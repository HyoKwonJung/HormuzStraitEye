import { cleanHtml, fetchText, getErrorString, isoNow, parseDateTime } from "./utils.js";

export const NAVAREA_URL = "https://hydro.gov.pk/navarea-warnings";

const COORD_RE = /(?<lat>\d{1,2}(?:\.\d+)?)\s*[Nn][,\s]+(?<lon>\d{1,3}(?:\.\d+)?)\s*[Ee]/;

function extractBlocks(raw) {
  const cleaned = cleanHtml(raw);
  let blocks = raw.split(/(?:\r?\n){2,}/).map((x) => cleanHtml(x)).filter(Boolean);
  if (blocks.length < 2) {
    blocks = cleaned.split(/\s{2,}|\s*\|\s*/).map((x) => x.trim()).filter((x) => x.length > 35);
  }
  return blocks;
}

export function fallbackNavarea(nowIso = isoNow()) {
  return [{
    lat: 26.73,
    lon: 56.35,
    type: "warning",
    label: "NAVAREA IX fallback: New navigation warning issued near chokepoint",
    source: "NAVAREA IX",
    source_url: NAVAREA_URL,
    confidence: 0.93,
    time: nowIso,
  }];
}

export function parseNavarea(raw, nowIso = isoNow()) {
  const events = [];
  for (const block of extractBlocks(raw)) {
    const low = block.toLowerCase();
    if (!["navarea", "warning", "hazard", "navigation", "mine"].some((k) => low.includes(k))) continue;

    const m = block.match(COORD_RE);
    const lat = m?.groups?.lat ? Number(m.groups.lat) : 26.73;
    const lon = m?.groups?.lon ? Number(m.groups.lon) : 56.35;

    let type = "advisory";
    if (low.includes("mine")) type = "mine-related";
    else if (low.includes("warning") || low.includes("hazard")) type = "warning";

    events.push({
      lat,
      lon,
      type,
      label: block.slice(0, 140),
      source: "NAVAREA IX",
      source_url: NAVAREA_URL,
      confidence: 0.92,
      time: parseDateTime(block, nowIso),
    });
  }
  return events.slice(0, 10);
}

export async function collectNavarea() {
  const nowIso = isoNow();
  try {
    const text = await fetchText(NAVAREA_URL);
    const events = parseNavarea(text, nowIso);
    if (events.length) {
      return { events, status: { source: "NAVAREA IX", ok: true, used_fallback: false, error: null, checked_at: nowIso, count: events.length } };
    }
    const fb = fallbackNavarea(nowIso);
    return { events: fb, status: { source: "NAVAREA IX", ok: false, used_fallback: true, error: "empty parse result", checked_at: nowIso, count: fb.length } };
  } catch (err) {
    const fb = fallbackNavarea(nowIso);
    return { events: fb, status: { source: "NAVAREA IX", ok: false, used_fallback: true, error: getErrorString(err), checked_at: nowIso, count: fb.length } };
  }
}
