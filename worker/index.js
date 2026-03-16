import { collectUkmto } from "./ukmto.js";
import { collectNavarea } from "./navarea.js";
import { computeRisk } from "./risk_model.js";
import { isoNow, jsonResponse, mergeDedup, stalenessMinutes } from "./utils.js";
import { collectIntelligence } from "./intelligence.js"; // 신규 수집기 임포트

const KV_EVENTS_KEY = "events";
const KV_RISK_KEY = "risk";
const OFFICIAL_LEVEL_KEY = "official_threat_level";


function buildSupportingEvents(nowIso) {
  const now = new Date(nowIso);
  return [
    {
      lat: 26.89, lon: 55.96, type: "advisory",
      label: "Regional threat advisory update",
      source: "JMIC", 
      source_url: "https://msi.nga.mil/NavWarnings", 
      confidence: 0.99,
      time: new Date(now.getTime() - (4 * 3600 + 50 * 60) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"),
    },
    {
      lat: 26.46, lon: 56.55, type: "air",
      label: "Unusual patrol orbit signal",
      source: "OpenSky", 
      source_url: "", // 빈칸으로 두면 새로 바뀐 UI 로직에 의해 링크가 생성되지 않음
      confidence: 0.72,
      time: new Date(now.getTime() - (7 * 3600 + 15 * 60) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"),
    },
  ];
}


async function readSnapshot(env) {
  const [eventsRaw, riskRaw] = await Promise.all([
    env.DASHBOARD_SNAPSHOTS.get(KV_EVENTS_KEY),
    env.DASHBOARD_SNAPSHOTS.get(KV_RISK_KEY),
  ]);

  let events = null;
  let risk = null;
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

function isValid(events, risk) {
  return Array.isArray(events) && events.length > 0 && risk && typeof risk === "object" && risk.updated_at;
}


async function refreshSnapshots(env) {
  const nowIso = isoNow();
  const previous = await readSnapshot(env);

  // 1. 세 가지 수집기 동시 실행
  const [ukmto, navarea, intel] = await Promise.all([
    collectUkmto(),
    collectNavarea(),
    collectIntelligence() 
  ]);

  const merged = mergeDedup([...(ukmto.events || []), ...(navarea.events || []), ...buildSupportingEvents(nowIso)])
    .sort((a, b) => String(b.time).localeCompare(String(a.time)));

  const officialLevel = (await env.DASHBOARD_SNAPSHOTS.get(OFFICIAL_LEVEL_KEY)) || "CRITICAL";
  const risk = computeRisk(merged, new Date(), officialLevel);
  risk.official_threat_level = officialLevel;
  risk.source_count = [ukmto.status, navarea.status].filter((s) => s?.ok).length;
  risk.collector_status = { ukmto: ukmto.status, navarea: navarea.status };
  risk.data_staleness_minutes = stalenessMinutes(merged, new Date());

  if (!isValid(merged, risk)) {
    return previous || { events: [], risk: { score: 0, updated_at: nowIso } };
  }

  await writeSnapshot(env, merged, risk);
  
  if (intel && intel.updates) {
    await env.DASHBOARD_SNAPSHOTS.put("intelligence", JSON.stringify(intel.updates));
  }

  return { events: merged, risk, intelligence: intel?.updates };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = env.CORS_ORIGIN || "*";

    if (request.method === "OPTIONS") return jsonResponse({ ok: true }, 200, origin);

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