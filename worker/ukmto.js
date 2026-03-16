import { cleanHtml, fetchText, getErrorString, isoNow, parseDateTime } from "./utils.js";

export const UKMTO_URL = "https://www.ukmto.org/indian-ocean/recent-incidents";

const COORD_RE = /(?<lat>\d{1,2}(?:\.\d+)?)\s*[Nn][,\s]+(?<lon>\d{1,3}(?:\.\d+)?)\s*[Ee]/;
const BLOCK_RES = [
  /<li[^>]*>(.*?)<\/li>/gis,
  /<tr[^>]*>(.*?)<\/tr>/gis,
  /<p[^>]*>(.*?)<\/p>/gis,
];

function extractBlocks(html) {
  const out = [];
  for (const re of BLOCK_RES) {
    for (const m of html.matchAll(re)) out.push(cleanHtml(m[1]));
  }
  if (!out.length) {
    for (const chunk of cleanHtml(html).split(/(?:\.|\n)\s+/)) {
      if (chunk.trim().length > 40) out.push(chunk.trim());
    }
  }
  return [...new Set(out)].filter(Boolean);
}

export function fallbackUkmto(nowIso = isoNow()) {
  return [{
    lat: 26.55,
    lon: 56.16,
    type: "attack",
    label: "UKMTO fallback: Security incident causing fire near transit lane",
    source: "UKMTO",
    source_url: UKMTO_URL,
    confidence: 0.88,
    time: nowIso,
  }];
}

export function parseUkmto(html, nowIso = isoNow()) {
  const events = [];
  for (const text of extractBlocks(html)) {
    const lower = text.toLowerCase();
    if (!["incident", "attack", "warning", "advisory", "security", "vessel"].some((k) => lower.includes(k))) continue;
    const m = text.match(COORD_RE);
    const lat = m?.groups?.lat ? Number(m.groups.lat) : 26.55;
    const lon = m?.groups?.lon ? Number(m.groups.lon) : 56.16;

    let type = "warning";
    if (["attack", "fire", "missile", "strike", "explosion"].some((k) => lower.includes(k))) type = "attack";
    else if (lower.includes("advisory")) type = "advisory";

    events.push({
      lat,
      lon,
      type,
      label: text.slice(0, 140),
      source: "UKMTO",
      source_url: UKMTO_URL,
      confidence: 0.85,
      time: parseDateTime(text, nowIso),
    });
  }
  return events.slice(0, 10);
}

export async function collectUkmto() {
  const nowIso = isoNow();
  try {
    const html = await fetchText(UKMTO_URL);
    const events = parseUkmto(html, nowIso);
    if (events.length) {
      return { events, status: { source: "UKMTO", ok: true, used_fallback: false, error: null, checked_at: nowIso, count: events.length } };
    }
    const fb = fallbackUkmto(nowIso);
    return { events: fb, status: { source: "UKMTO", ok: false, used_fallback: true, error: "empty parse result", checked_at: nowIso, count: fb.length } };
  } catch (err) {
    const fb = fallbackUkmto(nowIso);
    return { events: fb, status: { source: "UKMTO", ok: false, used_fallback: true, error: getErrorString(err), checked_at: nowIso, count: fb.length } };
  }
}
