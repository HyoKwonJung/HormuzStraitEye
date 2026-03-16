import { collectUkmto } from "./ukmto.js";
import { collectNavarea } from "./navarea.js";
import { computeRisk } from "./risk_model.js";
import { isoNow, jsonResponse, mergeDedup, stalenessMinutes } from "./utils.js";

const KV_EVENTS_KEY = "events";
const KV_RISK_KEY = "risk";
const OFFICIAL_LEVEL_KEY = "official_threat_level";

function buildSupportingEvents(nowIso) {
  const now = new Date(nowIso);
  return [
    {
      lat: 26.89,
      lon: 55.96,
      type: "advisory",
      label: "JMIC regional threat advisory update",
      source: "JMIC",
      source_url: "https://www.jmic-uk.com/advisories",
      confidence: 0.99,
      time: new Date(now.getTime() - (4 * 3600 + 50 * 60) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"),
    },
    {
      lat: 26.46,
      lon: 56.55,
      type: "air",
      label: "Unusual patrol orbit signal",
      source: "OpenSky",
      source_url: "https://opensky-network.org/",
      confidence: 0.72,
      time: new Date(now.getTime() - (7 * 3600 + 15 * 60) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"),
    },
  ];
}

function fallbackSeed(nowIso = isoNow()) {
  const events = [
    {
      lat: 26.55,
      lon: 56.16,
      type: "attack",
      label: "Seed fallback: Security incident near transit lane",
      source: "Seed",
      source_url: "https://example.com/fallback",
      confidence: 0.5,
      time: nowIso,
      related_sources: ["Seed"],
    },
  ];

  const risk = {
    score: 45,
    level: "ELEVATED",
    incidents: 1,
    warnings: 0,
    updated_at: nowIso,
    components: { incident: 45, diversity: 20, proximity: 70, warning: 0, air: 0, official_modifier: 0 },
    explanation: ["Fallback seed snapshot in use due to missing prior data."],
    official_threat_level: "CRITICAL",
    source_count: 0,
    collector_status: {
      ukmto: { source: "UKMTO", ok: false, used_fallback: true, error: "seed bootstrap", checked_at: nowIso, count: 0 },
      navarea: { source: "NAVAREA IX", ok: false, used_fallback: true, error: "seed bootstrap", checked_at: nowIso, count: 0 },
    },
    data_staleness_minutes: 0,
  };

  return { events, risk };
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

  const [ukmto, navarea] = await Promise.all([collectUkmto(), collectNavarea()]);
  const merged = mergeDedup([...(ukmto.events || []), ...(navarea.events || []), ...buildSupportingEvents(nowIso)])
    .sort((a, b) => String(b.time).localeCompare(String(a.time)));

  const officialLevel = (await env.DASHBOARD_SNAPSHOTS.get(OFFICIAL_LEVEL_KEY)) || "CRITICAL";
  const risk = computeRisk(merged, new Date(), officialLevel);
  risk.official_threat_level = officialLevel;
  risk.source_count = [ukmto.status, navarea.status].filter((s) => s?.ok).length;
  risk.collector_status = { ukmto: ukmto.status, navarea: navarea.status };
  risk.data_staleness_minutes = stalenessMinutes(merged, new Date());

  if (!isValid(merged, risk)) {
    if (previous) return previous; // stale > bad
    const seed = fallbackSeed(nowIso);
    await writeSnapshot(env, seed.events, seed.risk);
    return seed;
  }

  await writeSnapshot(env, merged, risk);
  return { events: merged, risk };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = env.CORS_ORIGIN || "*";

    if (request.method === "OPTIONS") return jsonResponse({ ok: true }, 200, origin);

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

    return jsonResponse({ ok: true, service: "hormuz-worker", endpoints: ["/api/events", "/api/risk"] }, 200, origin);
  },

  async scheduled(_event, env) {
    await refreshSnapshots(env);
  },
};
