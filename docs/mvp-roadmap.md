# MVP Delivery Roadmap

## Phase 1 (Day 1~7)

### 목표
공식 경보 + 사건 데이터 기반의 첫 가동 대시보드 오픈

### 작업
- UKMTO / JMIC / MARAD / NAVAREA 수집기 구현
- raw_documents, warnings, events 기본 적재
- 위험점수 계산(단순 가중 평균)
- `/` Hero + Map + Timeline 구현

### 완료 조건
- 최근 72h 사건/경보 자동 수집
- 메인 화면에서 Risk Score/Official Level 동시 표시

---

## Phase 2 (Day 8~14)

### 목표
뉴스/OSINT 융합 + AI 정규화 + 알림

### 작업
- GDELT ingestion 추가
- 규칙 기반 추출 + LLM 보정 파이프라인
- dedup 엔진(시간/공간/유형)
- Alert 채널(email/Telegram/Discord) 최소 1개 배포

### 완료 조건
- 하나의 사건이 다중 소스에서 canonical event로 묶임
- 고심각도 이벤트 발생 시 알림 발송

---

## Phase 3 (Day 15~30)

### 목표
고도화 및 신뢰 확보

### 작업
- OpenSky 기반 air activity 신호 탑재
- Risk 모델 튜닝(감쇠/가중치 보정)
- `/methodology` 공개
- 모바일 최적화

### 완료 조건
- Why Risk Is Up 설명 품질 확보
- 사용자에게 모델 근거와 출처 투명 공개
