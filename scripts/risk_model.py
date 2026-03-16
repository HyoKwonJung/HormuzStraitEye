#!/usr/bin/env python3
"""Risk score model for Hormuz dashboard."""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from typing import Any

BASE_SEVERITY = {
    "attack": 90,
    "warning": 55,
    "advisory": 40,
    "air": 30,
}


def _parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _decay(hours_delta: float, lambd: float = 0.03) -> float:
    return math.exp(-lambd * max(hours_delta, 0.0))


def _risk_label(score: int) -> str:
    if score >= 80:
        return "CRITICAL"
    if score >= 60:
        return "HIGH"
    if score >= 40:
        return "ELEVATED"
    if score >= 20:
        return "GUARDED"
    return "LOW"


def compute_risk(events: list[dict[str, Any]], now: datetime) -> dict[str, Any]:
    weighted = 0.0
    diversity = set()
    warning_count = 0

    for event in events:
        event_type = str(event.get("type", "warning")).lower()
        diversity.add(event_type)
        if event_type in {"warning", "advisory"}:
            warning_count += 1

        severity = BASE_SEVERITY.get(event_type, 45)
        conf = float(event.get("confidence", 0.7))

        try:
            event_time = _parse_iso(str(event.get("time")))
            hours_delta = (now - event_time).total_seconds() / 3600.0
        except Exception:
            hours_delta = 6.0

        weighted += severity * conf * _decay(hours_delta)

    diversity_bonus = min(15.0, len(diversity) * 4.0)
    score = int(max(0, min(100, round(weighted / max(1, len(events)) + diversity_bonus))))

    return {
        "score": score,
        "level": _risk_label(score),
        "incidents": len(events),
        "warnings": warning_count,
        "updated_at": now.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    }


if __name__ == "__main__":
    now = datetime.now(timezone.utc)
    sample = [{"type": "attack", "confidence": 0.9, "time": now.isoformat().replace("+00:00", "Z")}]
    print(json.dumps(compute_risk(sample, now), indent=2))
