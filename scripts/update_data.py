#!/usr/bin/env python3
"""Generate sample dashboard data files without external dependencies."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = REPO_ROOT / "data"
EVENTS_PATH = DATA_DIR / "events.json"
RISK_PATH = DATA_DIR / "risk.json"


def iso(dt: datetime) -> str:
    return dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def build_events(now: datetime) -> list[dict]:
    return [
        {
            "lat": 26.55,
            "lon": 56.16,
            "type": "attack",
            "label": "Security incident causing fire",
            "source": "UKMTO",
            "confidence": 0.88,
            "time": iso(now - timedelta(minutes=5)),
        },
        {
            "lat": 26.73,
            "lon": 56.35,
            "type": "warning",
            "label": "NAVAREA IX warning issued",
            "source": "NAVAREA IX",
            "confidence": 0.93,
            "time": iso(now - timedelta(hours=2, minutes=30)),
        },
        {
            "lat": 26.89,
            "lon": 55.96,
            "type": "advisory",
            "label": "Regional threat advisory update",
            "source": "JMIC",
            "confidence": 0.99,
            "time": iso(now - timedelta(hours=4, minutes=50)),
        },
        {
            "lat": 26.46,
            "lon": 56.55,
            "type": "air",
            "label": "Unusual patrol orbit signal",
            "source": "OpenSky",
            "confidence": 0.72,
            "time": iso(now - timedelta(hours=7, minutes=15)),
        },
    ]


def build_risk(now: datetime, events: list[dict]) -> dict:
    attack_weight = sum(1 for e in events if e["type"] == "attack")
    warning_weight = sum(1 for e in events if e["type"] == "warning")
    advisory_weight = sum(1 for e in events if e["type"] == "advisory")
    air_weight = sum(1 for e in events if e["type"] == "air")

    score = min(100, 55 + attack_weight * 10 + warning_weight * 5 + advisory_weight * 3 + air_weight * 1)

    if score >= 80:
        level = "CRITICAL"
    elif score >= 60:
        level = "HIGH"
    elif score >= 40:
        level = "ELEVATED"
    elif score >= 20:
        level = "GUARDED"
    else:
        level = "LOW"

    return {
        "score": score,
        "level": level,
        "incidents": len(events),
        "warnings": warning_weight + advisory_weight,
        "updated_at": iso(now),
    }


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc)
    events = build_events(now)
    risk = build_risk(now, events)

    EVENTS_PATH.write_text(json.dumps(events, indent=2) + "\n", encoding="utf-8")
    RISK_PATH.write_text(json.dumps(risk, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
