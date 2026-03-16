import { cleanHtml, fetchText, getErrorString, isoNow, parseDateTime } from "./utils.js";

// 미 해군/해병대 전문 군사 매체 (USNI News)
const MILITARY_FEED = "https://news.usni.org/feed/";

export async function collectNavarea() {
  const nowIso = isoNow();
  try {
    const xml = await fetchText(MILITARY_FEED);
    const events = [];
    // <item> 태그로 분할 (대소문자 무시)
    const items = xml.split(/<item>/i).slice(1);

    for (const item of items) {
      // 🎯 제목, 링크 추출 (CDATA 및 줄바꿈 대응)
      const titleMatch = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
      const linkMatch = item.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
      
      // 🎯 유저 요청 로직: pubDate 추출 및 실제 기사 시간 생성
      const pubDateMatch = item.match(/<pubDate>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/pubDate>/i);
      const pubDateStr = pubDateMatch ? pubDateMatch[1].trim() : "";
      const articleTime = parseDateTime(pubDateStr, nowIso);
      
      const title = titleMatch ? titleMatch[1].trim() : "";
      const link = linkMatch ? linkMatch[1].trim() : "";
      
      const lowerTitle = title.toLowerCase();
      
      // 🎯 핵심 군사 키워드 필터링
      if (!/(hormuz|iran|marine|meu|arg|carrier|deploy|amphibious|5th fleet|centcom|warship|strike group|force)/.test(lowerTitle)) continue;

      let type = "warning";
      if (/(deploy|marine|carrier|force)/.test(lowerTitle)) type = "advisory";
      if (/(strike|attack|fire|intercept)/.test(lowerTitle)) type = "attack";

      // 해군/해병대 전개 예상 해역 (오만 만 ~ 호르무즈 해협 입구 랜덤 배치)
      const lat = 24.0 + (Math.random() * 2);
      const lon = 56.5 + (Math.random() * 2);

      events.push({
        lat: Number(lat.toFixed(2)),
        lon: Number(lon.toFixed(2)),
        type,
        label: cleanHtml(title).slice(0, 120),
        source: "Naval OSINT",
        source_url: link,
        confidence: 0.98,
        time: articleTime // 정밀하게 파싱된 기사 시간 적용
      });
    }

    if (events.length === 0) throw new Error("No strategic military deployments found.");

    // 기사 발행 시간 기준 내림차순 정렬 (최신순)
    const sortedEvents = events.sort((a, b) => b.time.localeCompare(a.time));

    return { 
      events: sortedEvents.slice(0, 5), 
      status: { source: "Naval OSINT", ok: true, used_fallback: false, error: null, checked_at: nowIso, count: events.length } 
    };

  } catch (err) {
    return { 
      events: [], 
      status: { source: "Naval OSINT", ok: false, used_fallback: false, error: getErrorString(err), checked_at: nowIso, count: 0 } 
    };
  }
}