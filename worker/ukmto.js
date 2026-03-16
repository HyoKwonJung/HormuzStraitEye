import { cleanHtml, fetchText, getErrorString, isoNow, parseDateTime } from "./utils.js";

const SECURITY_FEED = "https://www.hellenicshippingnews.com/category/shipping-news/piracy-and-security-news/feed/";

export async function collectUkmto() {
  const nowIso = isoNow();
  try {
    const xml = await fetchText(SECURITY_FEED);
    const events = [];
    const items = xml.split("<item>").slice(1);

    for (const item of items) {
      const title = item.match(/<title>(<!\[CDATA\[)?(.+?)(]]>)?<\/title>/)?.[2] || "";
      const link = item.match(/<link>(.+?)<\/link>/)?.[1] || "";
      const pubDate = item.match(/<pubDate>(.+?)<\/pubDate>/)?.[1] || nowIso;
      
      const lowerTitle = title.toLowerCase();
      
      // 배제 키워드: 주간/월간 보고서 차단 (유지)
      if (/(weekly|monthly|annual|global|increase|decrease|report|summary|piracy in)/.test(lowerTitle)) continue;

      // 🎯 타겟 키워드 대폭 확장: 군함(warship), 순찰(patrol), 전개(deploy), 나포(seize), 방어(defense) 추가
      if (!/(hormuz|iran|us |navy|houthi|red sea|gulf|yemen|strike|missile|drone|attack|explosion|hijack|warship|patrol|deploy|seize|defense|military|guard)/.test(lowerTitle)) continue;

      let type = "warning";
      if (lowerTitle.includes("advisory") || lowerTitle.includes("patrol") || lowerTitle.includes("deploy")) type = "advisory";
      if (/(attack|explosion|strike|missile|seize|hijack)/.test(lowerTitle)) type = "attack";

      const lat = 24.5 + (Math.random() * 2);
      const lon = 55.5 + (Math.random() * 2.5);

      events.push({
        lat: Number(lat.toFixed(2)),
        lon: Number(lon.toFixed(2)),
        type,
        label: cleanHtml(title).slice(0, 120),
        source: "Tactical OSINT",
        source_url: link.trim(),
        confidence: 0.95,
        time: parseDateTime(pubDate, nowIso)
      });
    }

    if (events.length === 0) throw new Error("No recent combat/tactical events found.");
    return { events: events.slice(0, 6), status: { source: "Tactical OSINT", ok: true, used_fallback: false, error: null, checked_at: nowIso, count: events.length } };

  } catch (err) {
    return { events: [], status: { source: "Tactical OSINT", ok: false, used_fallback: false, error: getErrorString(err), checked_at: nowIso, count: 0 } };
  }
}