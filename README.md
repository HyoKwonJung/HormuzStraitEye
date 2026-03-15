# Hormuz Military Dashboard Blueprint

이 저장소는 **Hormuz Military Dashboard** 제품 설계를 바로 실행 가능한 형태로 정리한 문서 중심 MVP 출발점입니다.

## 핵심 포지셔닝

> **Not just traffic. Operational risk intelligence for Hormuz.**

군함 실시간 위치 추적이 아니라, 공식 해사 경보와 공개 사건(OSINT)을 결합해 **실시간 군사 위험 그림(operational threat picture)** 을 제공합니다.

## 포함 문서

- `docs/product-blueprint.md`: 전체 제품 설계(컨셉, 데이터소스, AI 파이프라인, 위험모델, UI, 스택)
- `docs/mvp-roadmap.md`: 7일/14일/30일 단계별 MVP 실행 계획
- `docs/db-schema.sql`: Postgres/PostGIS 기준 초기 스키마 템플릿
- `docs/risk-index-methodology.md`: Hormuz Military Risk Index 계산 상세

## 빠른 시작 (설계 기준)

1. 필수 데이터 소스 연결: UKMTO, JMIC, MARAD, NAVAREA IX
2. 이벤트 정규화 파이프라인 구축: collector → parser → extractor → dedup
3. 위험 지수 산출: Incident/Threat/Proximity/Warning/Air 5요소
4. 첫 화면 구성: Risk Hero + Map + Timeline + Why Risk Is Up

## MVP 목표

- **Week 1**: 공식 경보/사건 수집 + 지도/타임라인 + 위험 점수 카드
- **Week 2**: 뉴스 이벤트 추출 + AI 정규화 + 중복제거 + 알림
- **Week 3-4**: 항공 시그널 + 모델 고도화 + methodology 공개


## 대시보드 바로 보기

```bash
cd app
python3 -m http.server 4173
```

브라우저에서 `http://localhost:4173` 로 접속하면 프로토타입 대시보드를 즉시 볼 수 있습니다.

