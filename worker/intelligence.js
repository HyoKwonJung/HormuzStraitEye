// worker/intelligence.js
import { cleanHtml, fetchText, getErrorString, isoNow, parseDateTime } from "./utils.js";

const FEEDS = [
  { url: "https://www.navy.mil/Press-Office/News-Stories/RSS/", source: "US Navy" },
  { url: "https://www.aljazeera.com/xml/rss/all.xml", source: "Al Jazeera" },
  { url: "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml", source: "BBC Middle East" },
  { url: "https://www.centcom.mil/MEDIA/PRESS-RELEASES/RSS/", source: "US CENTCOM" }
];

const MILITARY_KEYWORDS = ["Naval", "Fleet", "Carrier", "Destroyer", "Frigate", "Submarine", "Exercise", "Drill", "UAV", "Drone", "USV", "UUV", "Missile", "Intercept", "Patrol", "Deployment", "Base", "Strike", "Warship", "Combat", "Defense", "Coast Guard", "Task Force", "Airstrike", "Ballistic", "Reconnaissance", "Surveillance"];
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
      } catch (err) { console.error(`Feed Error [${feed.source}]:`, getErrorString(err)); }
    }
    if (allUpdates.length === 0) return fallbackIntelligence(nowIso);
    const grouped = groupAndLimitUpdates(allUpdates, 3);
    return { status: { ok: true, source: "Military Intelligence Aggregate", error: null, checked_at: nowIso }, updates: grouped };
  } catch (err) { return fallbackIntelligence(nowIso, getErrorString(err)); }
}

function parseIntelligence(xml, sourceName, nowIso) {
  const updates = [];
  const items = xml.split("<item>").slice(1);
  for (const item of items) {
    const title = item.match(/<title>(<!\[CDATA\[)?(.+?)(]]>)?<\/title>/)?.[2] || "";
    const description = item.match(/<description>(<!\[CDATA\[)?(.+?)(]]>)?<\/description>/)?.[2] || "";
    const pubDate = item.match(/<pubDate>(.+?)<\/pubDate>/)?.[1] || nowIso;
    const combinedText = (title + " " + description).toLowerCase();
    if (!MILITARY_KEYWORDS.some(k => combinedText.includes(k.toLowerCase()))) continue;
    if (POLITICAL_EXCLUDE.some(k => combinedText.includes(k.toLowerCase()))) continue;

    let country = "Regional";
    if (combinedText.match(/us |navy|carrier|pentagon|centcom|destroyer/)) country = "USA";
    else if (combinedText.match(/iran|irgc|tehran|houthi|hormuz/)) country = "Iran";
    else if (combinedText.match(/israel|idf|tel aviv|mossad/)) country = "Israel";
    else if (combinedText.match(/saudi|uae|gcc|bahrain|qatar|kuwait/)) country = "GCC";

    let status_tag = "NEUTRAL";
    if (combinedText.match(/exercise|patrol|drill|deployment|operation|transit/)) status_tag = "ACTIVE";
    if (combinedText.match(/threat|missile|attack|warn|strike|intercept|explosion/)) status_tag = "ALERT";

    updates.push({ country, status_tag, summary: cleanHtml(title).slice(0, 110), source: sourceName, time: parseDateTime(pubDate, nowIso) });
  }
  return updates;
}

function groupAndLimitUpdates(updates, limit) {
  const counts = {};
  return updates.sort((a, b) => b.time.localeCompare(a.time)).filter(u => {
    counts[u.country] = (counts[u.country] || 0) + 1;
    return counts[u.country] <= limit;
  });
}

export function fallbackIntelligence(nowIso = isoNow(), errorMsg = null) {
  const updates = [
    { country: "USA", status_tag: "ACTIVE", summary: "US 5th Fleet Task Force 59 deploys advanced USV fleet for Hormuz surveillance.", source: "Manual/OSINT", time: nowIso },
    { country: "Iran", status_tag: "ALERT", summary: "IRGC Navy conducts high-speed boat swarm drills near Strait of Hormuz.", source: "Manual/OSINT", time: nowIso },
    { country: "Israel", status_tag: "ACTIVE", summary: "IDF Sa'ar 6-class corvette maintains presence in regional transit lanes.", source: "Manual/OSINT", time: nowIso },
    { country: "GCC", status_tag: "NEUTRAL", summary: "Combined Maritime Forces (CMF) announce routine naval security cooperation.", source: "Manual/OSINT", time: nowIso }
  ];
  return { status: { ok: false, source: "Intelligence Fallback", error: errorMsg, checked_at: nowIso }, updates };
}