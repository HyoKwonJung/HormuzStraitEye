import { parseIso } from "./utils.js";

const BASE_SEVERITY = {
  attack: 90,
  "mine-related": 78,
  warning: 55,
  advisory: 35,
  air: 28,
};

const OFFICIAL_MODIFIER = { CRITICAL: 10, HIGH: 6, ELEVATED: 3, GUARDED: 1, LOW: 0 };
const TRANSIT_LANE = [
  [26.1, 56.9],
  [26.4, 56.5],
  [26.8, 56.1],
  [27.1, 55.7],
];

const decay = (h, lambda = 0.03) => Math.exp(-lambda * Math.max(h, 0));

function riskLabel(score) {
  if (score >= 80) return "CRITICAL";
  if (score >= 60) return "HIGH";
  if (score >= 40) return "ELEVATED";
  if (score >= 20) return "GUARDED";
  return "LOW";
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const r = 6371;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

function proximityScore(events) {
  if (!events?.length) return 0;
  let minD = 9999;
  for (const e of events) {
    const lat = Number(e?.lat || 0);
    const lon = Number(e?.lon || 0);
    for (const [llat, llon] of TRANSIT_LANE) {
      minD = Math.min(minD, haversineKm(lat, lon, llat, llon));
    }
  }
  if (minD <= 20) return 100;
  if (minD <= 50) return 70;
  if (minD <= 100) return 40;
  return 20;
}

export function computeRisk(events, now = new Date(), officialThreatLevel = "CRITICAL") {
  const safeEvents = Array.isArray(events) ? events : [];
  if (!safeEvents.length) {
    return {
      score: 0,
      level: "LOW",
      incidents: 0,
      warnings: 0,
      updated_at: new Date(now).toISOString().replace(/\.\d{3}Z$/, "Z"),
      components: { incident: 0, diversity: 0, proximity: 0, warning: 0, air: 0, official_modifier: OFFICIAL_MODIFIER[officialThreatLevel] || 0 },
      explanation: ["No events available."],
    };
  }

  let weighted = 0;
  let sumW = 0;
  const diversity = new Set();
  let warningCount = 0;
  let advisoryCount = 0;
  let airCount = 0;
  let attackCount = 0;

  for (const e of safeEvents) {
    const type = String(e?.type || "warning").toLowerCase();
    diversity.add(type);
    if (type === "warning") warningCount++;
    if (type === "advisory") advisoryCount++;
    if (type === "air") airCount++;
    if (type === "attack" || type === "mine-related") attackCount++;

    const severity = BASE_SEVERITY[type] || 45;
    const confidence = Number(e?.confidence ?? 0.7);
    const eventTime = parseIso(String(e?.time || ""));
    const hours = Number.isNaN(eventTime.getTime()) ? 8 : (new Date(now) - eventTime) / 36e5;
    const w = Math.max(0.1, confidence * decay(hours));
    weighted += severity * w;
    sumW += w;
  }

  const incident = Math.min(100, weighted / Math.max(sumW, 1e-6));
  const diversityScore = Math.min(100, (diversity.size / 5) * 100);
  const proximity = proximityScore(safeEvents);
  const warning = Math.min(100, warningCount * 22 + advisoryCount * 10);
  const air = Math.min(100, airCount * 28);

  const base = 0.35 * incident + 0.15 * diversityScore + 0.2 * proximity + 0.2 * warning + 0.1 * air;
  const officialModifier = OFFICIAL_MODIFIER[String(officialThreatLevel || "").toUpperCase()] || 0;
  const score = Math.max(0, Math.min(100, Math.round(base + officialModifier)));

  return {
    score,
    level: riskLabel(score),
    incidents: safeEvents.length,
    warnings: warningCount + advisoryCount,
    updated_at: new Date(now).toISOString().replace(/\.\d{3}Z$/, "Z"),
    components: {
      incident: Number(incident.toFixed(2)),
      diversity: Number(diversityScore.toFixed(2)),
      proximity: Number(proximity.toFixed(2)),
      warning: Number(warning.toFixed(2)),
      air: Number(air.toFixed(2)),
      official_modifier: officialModifier,
    },
    explanation: [
      `${attackCount} high-severity attack/mine events in scope.`,
      `${warningCount} warnings and ${advisoryCount} advisories contributed to warning pressure.`,
      `Event diversity includes ${diversity.size} distinct threat categories.`,
      `Official baseline modifier applied: ${String(officialThreatLevel).toUpperCase()} (+${officialModifier}).`,
    ],
  };
}
