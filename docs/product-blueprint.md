# Hormuz Military Dashboard — Full Product Blueprint

## 1) 제품 컨셉

### 제품명 제안
- Hormuz Military Watch
- Hormuz Security Dashboard
- Hormuz Escalation Monitor
- Hormuz Maritime Threat Map

### 한 줄 정의
**군사 위치정보가 아니라, 군사 위험 신호와 해상 보안 이벤트를 실시간으로 보여주는 호르무즈 상황판.**

### 사용자가 첫 화면에서 즉시 알아야 하는 4가지
1. 현재 호르무즈 통항 위험 수준
2. 최근 24~72시간 군사/준군사 사건
3. 증가 중인 위협 유형
4. 특히 위험한 구역

---

## 2) 제품 철학

직접 추적이 어려운 비공개 군사 정보를 쫓기보다, 다음 데이터를 융합한다.

### 추적하지 않는 것
- 군함 실시간 위치
- 잠수함 위치
- 비공개 군 작전

### 추적하는 것
- 공식 해사 경보
- 상선 공격 사건
- UAV/USV/미사일 사건
- AIS/GNSS 이상
- 군용기/ISR 패턴
- 항로 주변 위험구역 변화
- 뉴스/OSINT 기반 군사 이벤트

---

## 3) 시스템 구조

1. **Raw Data Intake**: 공개 소스 수집
2. **Event Extraction & Normalization**: 공통 이벤트 스키마 변환
3. **Risk Scoring Engine**: 심각도·빈도·신뢰도·공간 밀집 기반 위험 계산
4. **UI / Alerts / API**: 지도·타임라인·지수·알림 제공

---

## 4) 데이터 소스 전략

### A. 필수 공식 소스

1. **UKMTO Incidents / Advisories**
   - 용도: 선박 공격, 의심접근, 경보 텍스트
   - 수집: HTML polling + 구조화 파싱

2. **JMIC Advisory Notes**
   - 용도: 지역 위협수준, 상황평가, 패턴 해석
   - 수집: PDF polling + 요약/구조화

3. **MARAD Advisories**
   - 용도: 위협 유형 taxonomy, guidance
   - 수집: advisory 목록/본문 파싱

4. **NAVAREA IX Warnings**
   - 용도: 항행 위험 수역, 경고 번호, 유효시점
   - 수집: HTML parsing + 좌표/시점 추출

### B. 사건/뉴스

5. **GDELT**
   - 용도: 호르무즈 관련 뉴스 수집 및 이벤트 후보 생성

6. **ACLED**
   - 용도: 지역 분쟁 맥락 연결

### C. 항공

7. **OpenSky**
   - 용도: ISR/orbit/patrol intensity 보조 신호
   - 주의: 군용기 coverage bias 존재

### D. 위성/지도

8. **Copernicus/Sentinel**
   - 용도: 사건 전후 보조 시각 검증

### E. 선택

9. **IMO Middle East page**
   - 용도: 운영자 검증용 링크 허브

---

## 5) 현실적인 MVP 조합

### MVP 필수
- UKMTO
- JMIC
- MARAD
- NAVAREA IX
- GDELT

### MVP+
- OpenSky
- Copernicus snapshot
- ACLED

### 초기 제외 권장
- 상용 위성 실시간 feed
- 유료 AIS 고급 피드
- 복잡한 영상 AI

---

## 6) AI 이벤트 파이프라인

`collector → parser → event extractor → deduplicator → geocoder → classifier → scorer → alert engine`

### 공통 스키마 예시

```json
{
  "source": "UKMTO",
  "source_id": "2026-incident-123",
  "published_at": "2026-03-15T08:30:00Z",
  "raw_text": "...",
  "url": "...",
  "region": "Strait of Hormuz"
}
```

### 추출 필드
- event_type
- sub_type
- actor
- target
- date_time
- location_text / lat / lon / uncertainty
- severity
- confidence
- casualties
- affected_asset
- source_reliability

### 핵심 taxonomy
상위 카테고리:
- Attack
- Harassment
- Seizure/Boarding
- Missile/UAV/USV
- Mine/UXO
- Military Exercise
- Air Activity
- Navigation Warning
- Electronic Interference
- Commercial Disruption

세부 유형:
- projectile strike
- boarding attempt
- suspicious approach
- drone attack
- missile launch
- anti-ship threat
- mine-related warning
- salvage vessel threatened
- GNSS interference
- AIS anomaly
- ISR orbit detected

### Dedup 기준
- 시간 ±12h
- 거리 20~40km
- 동일 선박명/IMO
- 동일 사건 유형

### Confidence 규칙
- UKMTO/MARAD/NAVAREA 직접 보고: High
- GDELT 단일 기사: Medium
- 소셜 단독: Low

---

## 7) 리스크 모델: Hormuz Military Risk Index

총점(0~100):
- Incident Severity (I): 35%
- Threat Diversity (D): 15%
- Spatial Proximity (P): 20%
- Official Warning (W): 20%
- Air/Signal Activity (A): 10%

### 단순 MVP 수식
`Risk_t = 0.35I_t + 0.15D_t + 0.20P_t + 0.20W_t + 0.10A_t`

### 시간 감쇠
`decay(Δh) = exp(-λΔh), λ=0.03`

### 등급
- 0–19 Low
- 20–39 Guarded
- 40–59 Elevated
- 60–79 High
- 80–100 Critical

> 화면에는 **Official Threat Level(JMIC)** 과 **Computed Live Risk** 를 분리 표기한다.

---

## 8) UI 정보 구조

### 홈(`/`)
1. Hero Status
   - Hormuz Live Military Risk
   - Computed Risk Score
   - Official JMIC Level
   - Last 24h incidents/warnings

2. Main Map
   - 레이어: incidents / advisories / warnings / high-risk zones / air signals
   - 필터: 기간, event type, source, confidence

3. Timeline
4. Threat Breakdown
5. Why Risk Is Up (설명가능성)
6. Official Sources

### 추가 페이지
- `/map`: 전체 지도
- `/incidents`: 사건 DB
- `/warnings`: 공식 경보
- `/air-activity`: 항공 시그널
- `/methodology`: 지수 계산 설명

---

## 9) 기술 스택 권장

### Backend
- Python + FastAPI
- PostgreSQL + PostGIS
- Redis
- Celery/cron workers

### Ingestion
- BeautifulSoup / Playwright
- feedparser

### NLP/AI
- spaCy + regex (1차)
- LLM API (정규화/요약)
- sentence-transformers (dedup)

### Frontend
- Next.js
- Mapbox GL / deck.gl
- Tailwind
- Recharts / ECharts

### Hosting
- Frontend: Vercel
- Backend: Railway/Render/Fly.io
- DB: Supabase or managed Postgres

---

## 10) 차별화 포인트

- Military event taxonomy
- Official-warning fusion
- Explainable risk score
- Event deduplication
- Map + Timeline + Source-backed reasoning
- Air activity signals

---

## 11) 핵심 카피 제안

상단:
- **Hormuz Military Risk: HIGH**
- **Official regional maritime threat: CRITICAL**

설명 문구:
- *Driven by recent attacks, active navigational warnings, and elevated maritime security advisories.*

---

## 12) 결론

이 서비스는 “정확한 군사 위치 추적”이 아니라,
**공식 경보 + 공개 사건 기반의 operational threat picture** 제공 서비스로 정의해야 한다.

핵심 갭필링:
> **군함 좌표의 부재를, 군사 위험 신호 융합으로 메운다.**
