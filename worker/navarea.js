import { cleanHtml, fetchText, getErrorString, isoNow, parseDateTime } from "./utils.js";

// 미 해군/해병대 전문 군사 매체 (USNI News)
const MILITARY_FEED = "https://news.usni.org/feed/";

export async function collectNavarea() {
  const nowIso = isoNow();
  try {
    const xml = await fetchText(MILITARY_FEED);
    const events = [];
    const items = xml.split("<item>").slice(1);

    for (const item of items) {
      const title = item.match(/<title>(<!\[CDATA\[)?(.+?)(]]>)?<\/title>/)?.[2] || "";
      const link = item.match(/<link>(.+?)<\/link>/)?.[1] || "";
      const pubDate = item.match(/<pubDate>(.+?)<\/pubDate>/)?.[1] || nowIso;
      
      const lowerTitle = title.toLowerCase();
      
      if (!/(hormuz|iran|marine|meu|arg|carrier|deploy|amphibious|5th fleet|centcom|warship|strike group|force)/.test(lowerTitle)) continue;

      let type = "warning";
      if (/(deploy|marine|carrier|force)/.test(lowerTitle)) type = "advisory";
      if (/(strike|attack|fire|intercept)/.test(lowerTitle)) type = "attack";

      // 해군/해병대 전개 예상 해역 (오만 만 ~ 호르무즈 해협 입구)
      const lat = 24.0 + (Math.random() * 2);
      const lon = 56.5 + (Math.random() * 2);

      events.push({
        lat: Number(lat.toFixed(2)),
        lon: Number(lon.toFixed(2)),
        type,
        label: cleanHtml(title).slice(0, 120),
        source: "Naval OSINT",
        source_url: link.trim(),
        confidence: 0.98,
        time: parseDateTime(pubDate, nowIso)
      });
    }

    if (events.length === 0) throw new Error("No strategic military deployments found.");
    return { events: events.slice(0, 5), status: { source: "Naval OSINT", ok: true, used_fallback: false, error: null, checked_at: nowIso, count: events.length } };

  } catch (err) {
    return { events: [], status: { source: "Naval OSINT", ok: false, used_fallback: false, error: getErrorString(err), checked_at: nowIso, count: 0 } };
  }
}