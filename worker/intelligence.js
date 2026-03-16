import { cleanHtml, fetchText, getErrorString, isoNow } from "./utils.js";

const FEEDS = [
  { url: "https://www.navy.mil/Press-Office/News-Stories/RSS/", source: "US Navy" },
  { url: "https://www.aljazeera.com/xml/rss/all.xml", source: "Al Jazeera" },
  { url: "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml", source: "BBC Middle East" },
  { url: "https://www.centcom.mil/MEDIA/PRESS-RELEASES/RSS/", source: "US CENTCOM" }
];

const MILITARY_KEYWORDS = [
  "Naval", "Fleet", "Carrier", "Destroyer", "Frigate", "Submarine", "Exercise", "Drill", 
  "UAV", "Drone", "USV", "UUV", "Missile", "Intercept", "Patrol", "Deployment",
  "Base", "Strike", "Warship", "Combat", "Defense", "Coast Guard", "Task Force", 
  "Airstrike", "Ballistic", "Reconnaissance", "Surveillance", "Marine", "MEU", "Blockade"
];

const POLITICAL_EXCLUDE = ["Election", "Parliament", "Protest", "Economy", "Stock", "Olympic", "Talks", "Diplomacy"];

export async function collectIntelligence() {
  const nowIso = isoNow();
  try {
    const allUpdates = [];
    for (const feed of FEEDS) {
      try {
        const xml = await fetchText(feed.url);
        const parsed = parseIntelligence(xml, feed.source, nowIso);
        allUpdates.push(...parsed);
      } catch (err) {
        console.error(`Feed Error [${feed.source}]:`, getErrorString(err));
      }
    }
    if (allUpdates.length === 0) return fallbackIntelligence(nowIso);
    const grouped = groupAndLimitUpdates(allUpdates, 3);
    return { status: { ok: true, source: "Military Intelligence Aggregate", error: null, checked_at: nowIso }, updates: grouped };
  } catch (err) {
    return fallbackIntelligence(nowIso, getErrorString(err));
  }
}

function parseIntelligence(xml, sourceName, nowIso) {
  const updates = [];
  const items = xml.split(/<item>/i).slice(1);

  for (const item of items) {
    const titleMatch = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const descMatch = item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);
    const linkMatch = item.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
    
    const dateMatch = item.match(/<(?:pubDate|dc:date|lastBuildDate)>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:pubDate|dc:date|lastBuildDate)>/i);

    const title = titleMatch ? titleMatch[1].trim() : "";
    const description = descMatch ? descMatch[1].trim() : "";
    const link = linkMatch ? linkMatch[1].trim() : "";
    const dateStr = dateMatch ? dateMatch[1].trim() : "";

    const combinedText = (title + " " + description).toLowerCase();

    const isMilitary = MILITARY_KEYWORDS.some(k => combinedText.includes(k.toLowerCase()));
    if (!isMilitary) continue;

    const isPolitical = POLITICAL_EXCLUDE.some(k => combinedText.includes(k.toLowerCase()));
    if (isPolitical) continue;

    let country = "Regional";
    if (combinedText.match(/us |navy|carrier|pentagon|centcom|destroyer|marine|marines/)) country = "USA";
    else if (combinedText.match(/iran|irgc|tehran|houthi|hormuz/)) country = "Iran";
    else if (combinedText.match(/israel|idf|tel aviv|mossad|lebanon|hezbollah|gaza/)) country = "Israel";
    else if (combinedText.match(/saudi|uae|gcc|bahrain|qatar|kuwait|emirati/)) country = "GCC";

    let status_tag = "NEUTRAL";
    if (combinedText.match(/exercise|patrol|drill|deployment|operation|transit|intercept/)) status_tag = "ACTIVE";
    if (combinedText.match(/threat|missile|attack|warn|strike|explosion|killed|crash|seize|hijack/)) status_tag = "ALERT";

    let articleTime = nowIso; // 기본값은 현재 시간
    if (dateStr) {
      const parsedDate = new Date(dateStr);
      // 유효한 날짜이고, 현재보다 미래가 아닌 경우에만 적용 (버그 방지)
      if (!isNaN(parsedDate.getTime())) {
        const parsedIso = parsedDate.toISOString();
        if (new Date(parsedIso) <= new Date(nowIso)) {
          articleTime = parsedIso;
        }
      }
    }

    updates.push({
      country,
      status_tag,
      summary: cleanHtml(title).slice(0, 110),
      source: sourceName,
      source_url: link,
      time: articleTime
    });
  }

  // 최신순으로 정렬해서 반환
  return updates.sort((a, b) => b.time.localeCompare(a.time));
}

function groupAndLimitUpdates(updates, limit) {
  const counts = {};
  return updates.sort((a, b) => b.time.localeCompare(a.time)).filter(u => {
    counts[u.country] = (counts[u.country] || 0) + 1;
    return counts[u.country] <= limit;
  });
}

export function fallbackIntelligence(nowIso = isoNow(), errorMsg = null) {
  return { status: { ok: false, source: "Intelligence Fallback", error: errorMsg, checked_at: nowIso }, updates: [] };
}