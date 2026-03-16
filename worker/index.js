import { collectUkmto } from "./ukmto.js";
import { collectNavarea } from "./navarea.js";
import { computeRisk } from "./risk_model.js";
import { isoNow, jsonResponse, mergeDedup, stalenessMinutes } from "./utils.js";
import { collectIntelligence } from "./intelligence.js"; // 신규 수집기 임포트

const KV_EVENTS_KEY = "events";
const KV_RISK_KEY = "risk";
const OFFICIAL_LEVEL_KEY = "official_threat_level";

/**
 * 모의 지원 이벤트 (고정 데이터)
 */
function buildSupportingEvents(nowIso) {
  const now = new Date(nowIso);
  return [
    {
      lat: 26.89, lon: 55.96, type: "advisory",
      label: "JMIC regional threat advisory update",
      source: "JMIC", source_url: "https://www.jmic-uk.com/advisories",
      confidence: 0.99,
      time: new Date(now.getTime() - (4 * 3600 + 50 * 60) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"),
    },
    {
      lat: 26.46, lon: 56.55, type: "air",
      label: "Unusual patrol orbit signal",
      source: "OpenSky", source_url: "https://opensky-network.org/",
      confidence: 0.72,
      time: new Date(now.getTime() - (7 * 3600 + 15 * 60) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"),
    },
  ];
}

/**
 * KV에서 현재 스냅샷 읽기
 */
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

/**
 * KV에 스냅샷 쓰기
 */
async function writeSnapshot(env, events, risk) {
  await Promise.all([
    env.DASHBOARD_SNAPSHOTS.put(KV_EVENTS_KEY, JSON.stringify(events)),
    env.DASHBOARD_SNAPSHOTS.put(KV_RISK_KEY, JSON.stringify(risk)),
  ]);
}

function isValid(events, risk) {
  return Array.isArray(events) && events.length > 0 && risk && typeof risk === "object" && risk.updated_at;
}

/**
 * 데이터 새로고침 메인 로직
 */
async function refreshSnapshots(env) {
  const nowIso = isoNow();
  const previous = await readSnapshot(env);

  // 1. 세 가지 수집기 동시 실행
  const [ukmto, navarea, intel] = await Promise.all([
    collectUkmto(),
    collectNavarea(),
    collectIntelligence() // 인텔리전스 수집 추가
  ]);

  // 2. 이벤트 병합 및 정렬
  const merged = mergeDedup([...(ukmto.events || []), ...(navarea.events || []), ...buildSupportingEvents(nowIso)])
    .sort((a, b) => String(b.time).localeCompare(String(a.time)));

  // 3. 위험 점수 계산
  const officialLevel = (await env.DASHBOARD_SNAPSHOTS.get(OFFICIAL_LEVEL_KEY)) || "CRITICAL";
  const risk = computeRisk(merged, new Date(), officialLevel);
  risk.official_threat_level = officialLevel;
  risk.source_count = [ukmto.status, navarea.status].filter((s) => s?.ok).length;
  risk.collector_status = { ukmto: ukmto.status, navarea: navarea.status };
  risk.data_staleness_minutes = stalenessMinutes(merged, new Date());

  // 4. 데이터 검증 및 저장
  if (!isValid(merged, risk)) {
    return previous || { events: [], risk: { score: 0, updated_at: nowIso } };
  }

  await writeSnapshot(env, merged, risk);
  
  // 5. 인텔리전스 데이터 별도 저장 (중요!)
  if (intel && intel.updates) {
    await env.DASHBOARD_SNAPSHOTS.put("intelligence", JSON.stringify(intel.updates));
  }

  return { events: merged, risk, intelligence: intel?.updates };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = env.CORS_ORIGIN || "*";

    // CORS 프리플라이트 대응
    if (request.method === "OPTIONS") return jsonResponse({ ok: true }, 200, origin);

    // 신규 인텔리전스 API 엔드포인트
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

    // 그 외의 경로는 정적 자산(index.html) 반환
    return env.ASSETS.fetch(request);
  },

  async scheduled(_event, env) {
    await refreshSnapshots(env);
  },
};