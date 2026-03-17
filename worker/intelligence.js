import { cleanHtml, fetchText, getErrorString, isoNow, parseDateTime } from "./utils.js";

const FEEDS = [
  { url: "https://www.navy.mil/Press-Office/News-Stories/RSS/", source: "US Navy" },
  { url: "https://www.aljazeera.com/xml/rss/all.xml", source: "Al Jazeera" },
  { url: "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml", source: "BBC Middle East" },
  { url: "https://www.centcom.mil/MEDIA/PRESS-RELEASES/RSS/", source: "US CENTCOM" }
];

// 🎯 군사/전술 핵심 키워드
const MILITARY_KEYWORDS = [
  "Naval", "Fleet", "Carrier", "Destroyer", "Frigate", "Submarine", "Exercise", "Drill", 
  "UAV", "Drone", "USV", "UUV", "Missile", "Intercept", "Patrol", "Deployment",
  "Base", "Strike", "Warship", "Combat", "Defense", "Coast Guard", "Task Force", 
  "Airstrike", "Ballistic", "Reconnaissance", "Surveillance", "Marine", "MEU", "Blockade"
];

// 🚫 스포츠 및 연예 뉴스 배제 키워드 (오탐지 방지용)
const SPORTS_EXCLUDE = [
  "WBC", "FIFA", "World Cup", "Olympic", "Tournament", "League", "Baseball", "Football", 
  "Soccer", "Tennis", "Basketball", "Score", "Coach", "Match", "Finals", "Trophy", 
  "Hollywood", "Entertainment", "Film", "Cinema", "Music", "Actor", "Italy", "Venezuela"
];

// 🚫 일반 정치/경제 뉴스 배제 키워드
const POLITICAL_EXCLUDE = [
  "Election", "Parliament", "Protest", "Economy", "Stock", "Diplomacy", "Olympic", "Talks"
];

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
    
    // 국가별로 정렬하고 최신 3개씩만 선별
    const grouped = groupAndLimitUpdates(allUpdates, 3);
    return { 
      status: { ok: true, source: "Military Intelligence Aggregate", error: null, checked_at: nowIso }, 
      updates: grouped 
    };
  } catch (err) {
    return fallbackIntelligence(nowIso, getErrorString(err));
  }
}

function parseIntelligence(xml, sourceName, nowIso) {
  const updates = [];
  const items = xml.split(/<item>/i).slice(1);

  for (const item of items) {
    // 1. 기본 데이터 추출 (CDATA 대응)
    const titleMatch = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const descMatch = item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);
    const linkMatch = item.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
    const dateMatch = item.match(/<(?:pubDate|dc:date)>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:pubDate|dc:date)>/i);

    const title = titleMatch ? titleMatch[1].trim() : "";
    const description = descMatch ? descMatch[1].trim() : "";
    const link = linkMatch ? linkMatch[1].trim() : "";
    const dateStr = dateMatch ? dateMatch[1].trim() : "";

    const combinedText = (title + " " + description).toLowerCase();

    // 🎯 [필터링 순서 중요]
    // 1단계: 스포츠/연예 관련 단어가 있으면 즉시 제외
    const isSports = SPORTS_EXCLUDE.some(k => combinedText.includes(k.toLowerCase()));
    if (isSports) continue;

    // 2단계: 일반 정치/경제 뉴스 제외
    const isPolitical = POLITICAL_EXCLUDE.some(k => combinedText.includes(k.toLowerCase()));
    if (isPolitical) continue;

    // 3단계: 군사 핵심 키워드가 최소 하나는 있어야 통과
    const isMilitary = MILITARY_KEYWORDS.some(k => combinedText.includes(k.toLowerCase()));
    if (!isMilitary) continue;

    // 2. 국가 분류 (호르무즈 해협 분쟁 진영 기준)
    let country = "Regional";
    if (combinedText.match(/us |navy|carrier|pentagon|centcom|destroyer|marine|marines/)) country = "USA";
    else if (combinedText.match(/iran|irgc|tehran|houthi|hormuz/)) country = "Iran";
    else if (combinedText.match(/israel|idf|tel aviv|mossad|lebanon|hezbollah|gaza/)) country = "Israel";
    else if (combinedText.match(/saudi|uae|gcc|bahrain|qatar|kuwait|emirati/)) country = "GCC";

    // 3. 상태 태그 (UI의 색상 점 표시용)
    let status_tag = "NEUTRAL";
    if (combinedText.match(/exercise|patrol|drill|deployment|operation|transit|intercept/)) status_tag = "ACTIVE";
    if (combinedText.match(/threat|missile|attack|warn|strike|explosion|killed|crash|seize|hijack/)) status_tag = "ALERT";

    // 4. 날짜 해석 (utils.js의 parseDateTime 사용)
    const articleTime = parseDateTime(dateStr, nowIso);

    updates.push({
      country,
      status_tag,
      summary: cleanHtml(title).slice(0, 110),
      source: sourceName,
      source_url: link,
      time: articleTime
    });
  }
  return updates;
}

function groupAndLimitUpdates(updates, limit) {
  const counts = {};
  // 시간순으로 정렬 후 국가별 개수 제한
  return updates
    .sort((a, b) => b.time.localeCompare(a.time))
    .filter(u => {
      counts[u.country] = (counts[u.country] || 0) + 1;
      return counts[u.country] <= limit;
    });
}

export function fallbackIntelligence(nowIso = isoNow(), errorMsg = null) {
  return { 
    status: { ok: false, source: "Intelligence Fallback", error: errorMsg, checked_at: nowIso }, 
    updates: [] 
  };
}
