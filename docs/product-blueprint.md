# Hormuz Strait Eye — Product Blueprint (User-Facing)

## 1) What This Product Is

Hormuz Strait Eye is a maritime security situation board for users who need a clear picture of risk conditions around the Strait of Hormuz.

It is designed to answer four user questions immediately:
1. How risky is transit right now?
2. What happened in the last 24–72 hours?
3. Which threat patterns are increasing?
4. Which areas are currently most sensitive?

## 2) Product Philosophy

This product is intentionally built around **observable risk signals**, not hidden military tracking.

### Not claimed
- Real-time position of all warships
- Real-time submarine locations
- Classified military operations

### Shown to users
- Official maritime advisories and warnings
- Publicly reported attacks and harassment events
- UAV/USV/missile-related incidents when reported
- Navigation and signal interference indicators
- Explainable risk trends tied to source-backed events

## 3) Core Information Sources (as displayed to users)

- UKMTO incident and advisory reporting
- JMIC regional threat advisories
- MARAD maritime advisories
- NAVAREA navigational warnings
- Public media event feeds used as supporting context

All events should be interpreted together with source confidence and timestamp context.

## 4) What Users See on the Dashboard

### A. Hero Status
- Computed Risk Score
- Official Regional Threat Level
- Incidents in the selected time window
- Warnings currently in force

### B. Live Operational Map
- Incident markers
- Advisory/warning markers
- Highlighted risk concentration zones
- Optional air-activity signal layer (when available)

### C. Timeline
A chronological view of recent events with:
- Time
- Event summary
- Approximate location
- Source and confidence

### D. Threat Breakdown
A categorized distribution view (for example: missile/UAV, boarding/seizure, mine-related, navigation warnings, signal interference).

### E. “Why Risk Is Up” Panel
Human-readable reasoning tied to recent events and official warnings.

## 5) Suggested User-Facing Pages

- `/` Main dashboard
- `/map` Event-focused map view
- `/incidents` Incident list
- `/warnings` Official advisories and warnings
- `/methodology` Public scoring explanation

## 6) Trust and Transparency Principles

1. Show timestamps clearly.
2. Keep source attribution visible.
3. Separate computed score from official threat labels.
4. Avoid hard claims when location precision is uncertain.
5. Explain major score changes in plain language.

## 7) Example Header Copy

- **Hormuz Military Risk: HIGH**
- **Official Regional Maritime Threat: CRITICAL**

Supporting line:
- *Driven by recent attacks, active navigational warnings, and elevated maritime security advisories.*

## 8) Product Definition

Hormuz Strait Eye is an **operational threat picture** based on public and official reporting.

Its value comes from turning fragmented signals into a clear, explainable user view of maritime risk.
