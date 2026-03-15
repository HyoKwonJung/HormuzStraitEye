# Hormuz Military Risk Index Methodology

## 목적
실시간 사건과 공식 경보를 정량화하여 0~100 위험 점수로 제공한다.

## 지표 구성

- **I: Incident Severity (35%)**
- **D: Threat Diversity (15%)**
- **P: Spatial Proximity (20%)**
- **W: Official Warning (20%)**
- **A: Air/Signal Activity (10%)**

## 기본 수식

```text
Risk_t = 0.35I_t + 0.15D_t + 0.20P_t + 0.20W_t + 0.10A_t
```

확장형:

```text
Risk_t = 100 * sigmoid(0.35I_t + 0.15D_t + 0.20P_t + 0.20W_t + 0.10A_t)
```

## 이벤트 베이스 점수 예시

- projectile/missile strike: 90
- UAV attack: 85
- vessel seizure/boarding: 80
- suspected mine / mine warning: 75
- armed harassment: 65
- suspicious approach: 45
- navigation warning only: 35
- ISR orbit only: 25

## 시간 감쇠

```text
decay(Δh) = exp(-0.03 * Δh)
```

최근 24h 사건에 강한 비중을 둔다.

## 레이블 구간

- 0–19: Low
- 20–39: Guarded
- 40–59: Elevated
- 60–79: High
- 80–100: Critical

## 표시 원칙

메인 화면에는 아래를 분리 표시한다.

1. **Computed Risk Score** (내부 모델 산출)
2. **Official Regional Threat Level** (예: JMIC)

이 분리 표시는 사용자 신뢰와 해석가능성 확보에 중요하다.
