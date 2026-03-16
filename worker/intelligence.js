import { cleanHtml, fetchText, getErrorString, isoNow, parseDateTime } from "./utils.js";

// 군사/해군 전략 중심 뉴스 피드
const FEEDS = [
  { url: "https://www.navy.mil/Press-Office/News-Stories/RSS/", source: "US Navy" },
  { url: "https://www.aljazeera.com/xml/rss/all.xml", source: "Al Jazeera" },
  { url: "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml", source: "BBC Middle East" },
  { url: "https://www.centcom.mil/MEDIA/PRESS-RELEASES/RSS/", source: "US CENTCOM" }
];

// 전술/군사 전용 키워드
const MILITARY_KEYWORDS = [
  "Naval", "Fleet", "Carrier", "Destroyer", "Frigate", "Submarine", "Exercise", "Drill", 
  "UAV", "Drone", "USV", "UUV", "Missile", "Intercept", "Patrol", "Deployment",
  "Base", "Strike", "Warship", "Combat", "Defense", "Coast Guard", "Task Force", 
  "Airstrike", "Ballistic", "Reconnaissance", "Surveillance"
];

// 필터링할 정치/일반 뉴스 키워드
const POLITICAL_EXCLUDE = ["Election", "Parliament", "Protest", "Economy", "Stock", "Olympic", "Talks", "Diplomacy"];

/**
 * 진영별 동향 수집 메인 함수
 */
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

    // 국가별로 최대 3개씩 소식을 가져오도록 제한
    const grouped = groupAndLimitUpdates(allUpdates, 3);

    return { 
      status: { ok: true, source: "Military Intelligence Aggregate", error: null, checked_at: nowIso }, 
      updates: grouped 
    };
  } catch (err) {
    return fallbackIntelligence(nowIso, getErrorString(err));
  }
}

/**
 * RSS XML 파싱 및 원문 링크 추출
 */
function parseIntelligence(xml, sourceName, nowIso) {
  const updates = [];
  const items = xml.split("<item>").slice(1);

  for (const item of items) {
    const title = item.match(/<title>(<!\[CDATA\[)?(.+?)(]]>)?<\/title>/)?.[2] || "";
    const description = item.match(/<description>(<!\[CDATA\[)?(.+?)(]]>)?<\/description>/)?.[2] || "";
    // 원문 링크(URL) 추출 로직 추가
    const link = item.match(/<link>(.+?)<\/link>/)?.[1] || "";
    const pubDate = item.match(/<pubDate>(.+?)<\/pubDate>/)?.[1] || nowIso;
    
    const combinedText = (title + " " + description).toLowerCase();

    // 1. 군사 키워드 체크
    const isMilitary = MILITARY_KEYWORDS.some(k => combinedText.includes(k.toLowerCase()));
    if (!isMilitary) continue;

    // 2. 정치적 뉴스 배제
    const isPolitical = POLITICAL_EXCLUDE.some(k => combinedText.includes(k.toLowerCase()));
    if (isPolitical) continue;

    // 3. 진영 판별
    let country = "Regional";
    if (combinedText.match(/us |navy|carrier|pentagon|centcom|destroyer/)) country = "USA";
    else if (combinedText.match(/iran|irgc|tehran|houthi|hormuz/)) country = "Iran";
    else if (combinedText.match(/israel|idf|tel aviv|mossad/)) country = "Israel";
    else if (combinedText.match(/saudi|uae|gcc|bahrain|qatar|kuwait/)) country = "GCC";

    // 4. 상태 태그 판별
    let status_tag = "NEUTRAL";
    if (combinedText.match(/exercise|patrol|drill|deployment|operation|transit/)) status_tag = "ACTIVE";
    if (combinedText.match(/threat|missile|attack|warn|strike|intercept|explosion/)) status_tag = "ALERT";

    updates.push({
      country,
      status_tag,
      summary: cleanHtml(title).slice(0, 110),
      source: sourceName,
      source_url: link.trim(), // 원문 링크 저장
      time: parseDateTime(pubDate, nowIso)
    });
  }
  return updates;
}

/**
 * 국가별 데이터 제한 (최대 limit개)
 */
function groupAndLimitUpdates(updates, limit) {
  const counts = {};
  return updates
    .sort((a, b) => b.time.localeCompare(a.time))
    .filter(u => {
      counts[u.country] = (counts[u.country] || 0) + 1;
      return counts[u.country] <= limit;
    });
}

/**
 * 수집 실패 시 사용할 폴백 데이터
 */
export function fallbackIntelligence(nowIso = isoNow(), errorMsg = null) {
  const updates = [
    { country: "USA", status_tag: "ACTIVE", summary: "US 5th Fleet Task Force 59 deploys advanced USV fleet for Hormuz surveillance.", source: "Manual/OSINT", source_url: "https://www.navy.mil/", time: nowIso },
    { country: "Iran", status_tag: "ALERT", summary: "IRGC Navy conducts high-speed boat swarm drills near Strait of Hormuz.", source: "Manual/OSINT", source_url: "https://www.aljazeera.com/", time: nowIso },
    { country: "Israel", status_tag: "ACTIVE", summary: "IDF Sa'ar 6-class corvette maintains presence in regional transit lanes.", source: "Manual/OSINT", source_url: "https://www.bbc.com/news/world/middle_east", time: nowIso },
    { country: "GCC", status_tag: "NEUTRAL", summary: "Combined Maritime Forces (CMF) announce routine naval security cooperation.", source: "Manual/OSINT", source_url: "https://www.centcom.mil/", time: nowIso }
  ];
  return { 
    status: { ok: false, source: "Intelligence Fallback", error: errorMsg, checked_at: nowIso }, 
    updates 
  };
}