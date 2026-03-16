export const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
  "Referer": "https://www.google.com/",
  "Upgrade-Insecure-Requests": "1",
};

export function isoNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function jsonResponse(data, status = 200, corsOrigin = "*") {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export function parseIso(value) {
  return new Date(value);
}

export function stalenessMinutes(events, now = new Date()) {
  let newest = new Date(now.getTime() - 365 * 24 * 3600 * 1000);
  for (const e of events || []) {
    const t = parseIso(String(e?.time || ""));
    if (!Number.isNaN(t.getTime()) && t > newest) newest = t;
  }
  return Math.max(0, Math.floor((now - newest) / 60000));
}

export function cleanHtml(text) {
  return String(text || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function parseDateTime(rawStr, fallbackIso) {
  if (!rawStr) return fallbackIso;
  
  const cleanStr = rawStr.replace(/<!\[CDATA\[|\]\]>/g, '').trim();
  const parsed = new Date(cleanStr);
  
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }
  
  return fallbackIso;
}

export function normalizeLabel(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\b(ukmto|navarea\s*ix|jmic|opensky|warning|advisory|incident|fallback)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .slice(0, 8)
    .join(" ");
}

export function timeBucket(iso) {
  const dt = new Date(String(iso || ""));
  if (Number.isNaN(dt.getTime())) return "unknown";
  return dt.toISOString().slice(0, 13);
}

export function mergeDedup(events) {
  const map = new Map();
  for (const e of events || []) {
    const key = [
      String(e?.type || "warning").toLowerCase(),
      Number(Number(e?.lat || 0).toFixed(1)),
      Number(Number(e?.lon || 0).toFixed(1)),
      normalizeLabel(e?.label),
      timeBucket(e?.time),
    ].join("|");

    if (!map.has(key)) {
      map.set(key, { ...e, related_sources: [String(e?.source || "unknown")] });
      continue;
    }

    const cur = map.get(key);
    cur.confidence = Math.max(Number(cur.confidence || 0), Number(e?.confidence || 0));

    const ct = new Date(cur.time);
    const nt = new Date(e?.time);
    if (!Number.isNaN(ct.getTime()) && !Number.isNaN(nt.getTime()) && nt < ct) {
      cur.time = e.time;
    }

    cur.related_sources = Array.from(new Set([...(cur.related_sources || []), String(e?.source || "unknown")])).sort();
    map.set(key, cur);
  }
  return [...map.values()];
}

export function getErrorString(err) {
  const name = err?.name || err?.constructor?.name || "Error";
  return `${name}: ${String(err?.message || err)}`.slice(0, 180);
}

export async function fetchText(url) {
  const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return await res.text();
}
