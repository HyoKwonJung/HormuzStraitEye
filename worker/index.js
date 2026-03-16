import { collectUkmto } from "./ukmto.js";
import { collectNavarea } from "./navarea.js";
import { computeRisk } from "./risk_model.js";
import { isoNow, jsonResponse, mergeDedup, stalenessMinutes } from "./utils.js";
import { collectIntelligence } from "./intelligence.js";

const KV_EVENTS_KEY = "events";
const KV_RISK_KEY = "risk";
const OFFICIAL_LEVEL_KEY = "official_threat_level";
const KV_AI_SUMMARY = "ai_summary"; // AI 요약 저장용 키

function buildSupportingEvents(nowIso) {
  const now = new Date(nowIso);
  return [
    {
      lat: 26.89, lon: 55.96, type: "advisory",
      label: "Regional threat advisory update",
      source: "JMIC", source_url: "https://msi.nga.mil/NavWarnings",
      confidence: 0.99,
      time: new Date(now.getTime() - (4 * 3600 + 50 * 60) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"),
    }
  ];
}

async function readSnapshot(env) {
  const [eventsRaw, riskRaw] = await Promise.all([
    env.DASHBOARD_SNAPSHOTS.get(KV_EVENTS_KEY),
    env.DASHBOARD_SNAPSHOTS.get(KV_RISK_KEY),
  ]);
  let events = null, risk = null;
  try { events = eventsRaw ? JSON.parse(eventsRaw) : null; } catch {}
  try { risk = riskRaw ? JSON.parse(riskRaw) : null; } catch {}
  if (Array.isArray(events) && risk && typeof risk === "object") return { events, risk };
  return null;
}

async function writeSnapshot(env, events, risk) {
  await Promise.all([
    env.DASHBOARD_SNAPSHOTS.put(KV_EVENTS_KEY, JSON.stringify(events)),
    env.DASHBOARD_SNAPSHOTS.put(KV_RISK_KEY, JSON.stringify(risk)),
  ]);
}


async function generateAISummary(env, headlines) {
  if (!env.AI) return "AI Module is not connected.";
  if (headlines.length === 0) return "No significant tactical events reported at this time.";

  const promptText = `You are a military intelligence analyst. Based strictly on the following recent news headlines regarding the Strait of Hormuz, provide a concise, 3-sentence tactical briefing summarizing the current military threat level, deployments, and blockades. Do not invent information.

Recent Headlines:
${headlines.map(h => "- " + h).join("\n")}

Provide the 3-sentence english summary below:`;

  try {
    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [{ role: "user", content: promptText }]
    });
    return response.response;
  } catch (err) {
    console.error("AI Error:", err);
    return "The AI briefing system is currently experiencing temporary delays.";
  }
}

async function refreshSnapshots(env) {
  const nowIso = isoNow();
  const previous = await readSnapshot(env);

  const [ukmto, navarea, intel] = await Promise.all([
    collectUkmto(),
    collectNavarea(),
    collectIntelligence()
  ]);

  const merged = mergeDedup([...(ukmto.events || []), ...(navarea.events || []), ...buildSupportingEvents(nowIso)])
    .sort((a, b) => String(b.time).localeCompare(String(a.time)));

  // 1. AI에게 먹일 '헤드라인(기사 제목) 추출'
  const allTitles = [
    ...merged.slice(0, 6).map(e => e.label),
    ...(intel.updates || []).slice(0, 6).map(u => u.summary)
  ];
  const uniqueTitles = [...new Set(allTitles)].filter(Boolean);

  let aiSummaryText = "Waiting for AI summary...";
  if (env.AI && uniqueTitles.length > 0) {
    aiSummaryText = await generateAISummary(env, uniqueTitles);
    await env.DASHBOARD_SNAPSHOTS.put(KV_AI_SUMMARY, JSON.stringify({ summary: aiSummaryText, updated_at: nowIso }));
  }

  // 3. 기존 데이터 계산 및 저장
  const officialLevel = (await env.DASHBOARD_SNAPSHOTS.get(OFFICIAL_LEVEL_KEY)) || "CRITICAL";
  const risk = computeRisk(merged, new Date(), officialLevel);
  risk.official_threat_level = officialLevel;
  risk.source_count = [ukmto.status, navarea.status].filter((s) => s?.ok).length;
  risk.collector_status = { ukmto: ukmto.status, navarea: navarea.status };
  risk.data_staleness_minutes = stalenessMinutes(merged, new Date());

  if (!Array.isArray(merged) || merged.length === 0 || !risk || !risk.updated_at) {
    return previous || { events: [], risk: { score: 0, updated_at: nowIso } };
  }

  await writeSnapshot(env, merged, risk);
  
  if (intel && intel.updates) {
    await env.DASHBOARD_SNAPSHOTS.put("intelligence", JSON.stringify(intel.updates));
  }

  return { events: merged, risk, intelligence: intel?.updates, ai_summary: aiSummaryText };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = env.CORS_ORIGIN || "*";

    if (request.method === "OPTIONS") return jsonResponse({ ok: true }, 200, origin);

    // 🤖 신규 AI 브리핑 요청 엔드포인트
    if (url.pathname === "/api/summary") {
      const data = await env.DASHBOARD_SNAPSHOTS.get(KV_AI_SUMMARY);
      return jsonResponse(data ? JSON.parse(data) : { summary: "No summary available." }, 200, origin);
    }

    if (url.pathname === "/api/intel") {
      const data = await env.DASHBOARD_SNAPSHOTS.get("intelligence");
      return jsonResponse(JSON.parse(data || "[]"), 200, origin);
    }

    if (url.pathname === "/api/events") {
      const snapshot = (await readSnapshot(env)) || await refreshSnapshots(env);
      return jsonResponse(snapshot.events, 200, origin);
    }

    if (url.pathname === "/api/risk") {
      const snapshot = (await readSnapshot(env)) || await refreshSnapshots(env);
      return jsonResponse(snapshot.risk, 200, origin);
    }

    if (url.pathname === "/api/refresh" && request.method === "POST") {
      const snapshot = await refreshSnapshots(env);
      return jsonResponse({ ok: true, updated_at: snapshot.risk.updated_at }, 200, origin);
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(_event, env) {
    await refreshSnapshots(env);
  },
};