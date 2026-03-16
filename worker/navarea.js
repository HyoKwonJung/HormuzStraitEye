import { BROWSER_HEADERS, cleanHtml, getErrorString, isoNow, parseDateTime } from "./utils.js";

export const NAVAREA_URL = "https://hydro.gov.pk/navarea-warnings";
const NAVAREA_ALT_URLS = [
  NAVAREA_URL,
  `${NAVAREA_URL}/`,
  `${NAVAREA_URL}?output=1`,
];

const COORD_RE = /(?<lat>\d{1,2}(?:\.\d+)?)\s*[Nn][,\s]+(?<lon>\d{1,3}(?:\.\d+)?)\s*[Ee]/;
const NOTICE_SPLIT_RE = /(?:\r?\n){2,}|(?:\b(?:navarea|warning)\b\s*[:#-]?\s*\d{1,4})/gi;

function normalizeText(raw) {
  return cleanHtml(String(raw || ""))
    .replace(/\s*([,;:.])\s*/g, "$1 ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyType(low) {
  if (/(mine|floating\s+mine|drift\s+mine)/i.test(low)) return "mine-related";
  if (/(warning|hazard|danger|firing|exercise|closure)/i.test(low)) return "warning";
  return "advisory";
}

function looksLikeNavareaBlock(low) {
  return ["navarea", "warning", "hazard", "navigation", "notice to mariners", "mine"].some((k) => low.includes(k));
}

function extractBlocks(raw) {
  const cleaned = normalizeText(raw);
  if (!cleaned) return [];

  const lines = String(raw || "")
    .split(/\r?\n/)
    .map((x) => normalizeText(x))
    .filter(Boolean);

  let blocks = String(raw || "")
    .split(/(?:\r?\n){2,}/)
    .map((x) => normalizeText(x))
    .filter((x) => x.length > 30);

  if (blocks.length < 2) {
    blocks = cleaned
      .split(/\s*\|\s*|\s{2,}|\s*\u2022\s*/)
      .map((x) => x.trim())
      .filter((x) => x.length > 35);
  }

  if (blocks.length < 2 && lines.length) {
    blocks = [];
    let current = [];
    for (const line of lines) {
      if (/^\d{1,4}[.)-]\s+/.test(line) || /\b(navarea|warning)\b\s*[:#-]?\s*\d{1,4}/i.test(line)) {
        if (current.length) blocks.push(current.join(" "));
        current = [line];
      } else {
        current.push(line);
      }
    }
    if (current.length) blocks.push(current.join(" "));
  }

  if (blocks.length < 2) {
    blocks = cleaned
      .split(NOTICE_SPLIT_RE)
      .map((x) => x.trim())
      .filter((x) => x.length > 35);
  }

  return Array.from(new Set(blocks.map((b) => normalizeText(b)).filter(Boolean)));
}

export function fallbackNavarea(nowIso = isoNow(), sourceUrl = NAVAREA_URL) {
  return [{
    lat: 26.73,
    lon: 56.35,
    type: "warning",
    label: "NAVAREA IX fallback: New navigation warning issued near chokepoint",
    source: "NAVAREA IX",
    source_url: sourceUrl,
    confidence: 0.93,
    time: nowIso,
  }];
}

export function parseNavarea(raw, nowIso = isoNow(), sourceUrl = NAVAREA_URL) {
  const events = [];
  for (const block of extractBlocks(raw)) {
    const low = block.toLowerCase();
    if (!looksLikeNavareaBlock(low)) continue;

    const m = block.match(COORD_RE);
    const lat = m?.groups?.lat ? Number(m.groups.lat) : 26.73;
    const lon = m?.groups?.lon ? Number(m.groups.lon) : 56.35;

    events.push({
      lat,
      lon,
      type: classifyType(low),
      label: block.slice(0, 140),
      source: "NAVAREA IX",
      source_url: sourceUrl,
      confidence: 0.92,
      time: parseDateTime(block, nowIso),
    });
  }
  return events.slice(0, 10);
}

function classifyContentType(contentType) {
  const ct = String(contentType || "").toLowerCase();
  if (!ct) return "unknown";
  if (ct.includes("text/html") || ct.includes("text/plain") || ct.includes("xml") || ct.includes("application/xhtml")) return "text";
  if (ct.includes("application/pdf")) return "pdf";
  return "unsupported";
}

async function fetchNavareaText(url) {
  let res;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: BROWSER_HEADERS,
      redirect: "follow",
      cf: { cacheTtl: 0, cacheEverything: false },
    });
  } catch (err) {
    const e = new Error(`network fetch failed for ${url}: ${err?.message || err}`);
    e.name = "NetworkError";
    e.failure_type = "network";
    e.attempted_url = url;
    throw e;
  }

  if (!res.ok) {
    const e = new Error(`HTTP ${res.status} ${res.statusText || ""}`.trim());
    e.name = "HTTPError";
    e.status = res.status;
    e.failure_type = "http";
    e.attempted_url = url;
    throw e;
  }

  const finalUrl = res.url || url;
  const contentType = res.headers.get("content-type") || "";
  const contentClass = classifyContentType(contentType);
  if (contentClass === "pdf" || contentClass === "unsupported") {
    const e = new Error(`unsupported content-type: ${contentType || "unknown"}`);
    e.name = "UnsupportedContentTypeError";
    e.failure_type = "unsupported-content-type";
    e.attempted_url = finalUrl;
    throw e;
  }

  const text = await res.text();
  if (!text || text.trim().length < 20) {
    const e = new Error("response body too short");
    e.name = "ParseEmptyError";
    e.failure_type = "parse-empty";
    e.attempted_url = finalUrl;
    throw e;
  }

  return { text, finalUrl, contentType };
}

export async function collectNavarea() {
  const nowIso = isoNow();
  // NAVAREA IX origin intermittently returns anti-bot/edge errors in Workers, so we try a small
  // chain of equivalent URL variants before falling back to seeded NAVAREA data.
  let lastErr = null;

  for (const candidate of NAVAREA_ALT_URLS) {
    try {
      const { text, finalUrl } = await fetchNavareaText(candidate);
      const events = parseNavarea(text, nowIso, finalUrl || candidate);
      if (events.length) {
        return {
          events,
          status: {
            source: "NAVAREA IX",
            ok: true,
            used_fallback: false,
            error: null,
            checked_at: nowIso,
            count: events.length,
            parsed_notices: events.length,
            attempted_url: candidate,
            source_url: finalUrl || candidate,
            failure_type: null,
          },
        };
      }

      lastErr = Object.assign(new Error("parse-empty: source fetched but no NAVAREA-like notices found"), {
        name: "ParseEmptyError",
        failure_type: "parse-empty",
        attempted_url: finalUrl || candidate,
      });
    } catch (err) {
      lastErr = err;
      continue;
    }
  }

  const fallbackUrl = lastErr?.attempted_url || NAVAREA_URL;
  const fb = fallbackNavarea(nowIso, fallbackUrl);
  return {
    events: fb,
    status: {
      source: "NAVAREA IX",
      ok: false,
      used_fallback: true,
      error: getErrorString(lastErr || new Error("unknown NAVAREA failure")),
      checked_at: nowIso,
      count: fb.length,
      parsed_notices: 0,
      attempted_url: fallbackUrl,
      source_url: fallbackUrl,
      failure_type: lastErr?.failure_type || "unknown",
    },
  };
}
