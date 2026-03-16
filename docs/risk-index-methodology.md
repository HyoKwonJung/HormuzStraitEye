# Hormuz Risk Index Methodology

## Purpose

The Hormuz Risk Index summarizes recent maritime security conditions into a single public score from 0 to 100.

## Public Components

The score combines five components:
- **Incident Severity (I)**
- **Threat Diversity (D)**
- **Spatial Proximity (P)**
- **Official Warning Intensity (W)**
- **Air/Signal Activity (A)**

## Formula

```text
Risk_t = 0.35I_t + 0.15D_t + 0.20P_t + 0.20W_t + 0.10A_t
```

Optional normalization form:

```text
Risk_t = 100 * sigmoid(0.35I_t + 0.15D_t + 0.20P_t + 0.20W_t + 0.10A_t)
```

## Example Event Baselines

- Projectile/missile strike: 90
- UAV attack: 85
- Vessel seizure/boarding: 80
- Mine-related warning: 75
- Armed harassment: 65
- Suspicious approach: 45
- Navigation warning only: 35
- ISR signal only: 25

## Time Weighting

Recent events are weighted more strongly:

```text
decay(Δh) = exp(-0.03 * Δh)
```

## Public Risk Labels

- 0–19: Low
- 20–39: Guarded
- 40–59: Elevated
- 60–79: High
- 80–100: Critical

## Display Rule

The interface should always show these as separate values:
1. **Computed Risk Score**
2. **Official Regional Threat Level**

This separation helps users distinguish model output from official authority statements.
