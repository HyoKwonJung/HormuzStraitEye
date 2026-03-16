#!/usr/bin/env python3
"""Explainable risk model with time decay, proximity, and official modifier."""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from typing import Any

BASE_SEVERITY = {
    "attack": 90,
    "mine-related": 78,
    "warning": 55,
    "advisory": 35,
    "air": 28,
}

OFFICIAL_MODIFIER = {
    "CRITICAL": 10,
    "HIGH": 6,
    "ELEVATED": 3,
    "GUARDED": 1,
    "LOW": 0,
}

# Simplified Hormuz transit corridor points.
TRANSIT_LANE = [
    (26.10, 56.90),
    (26.40, 56.50),
    (26.80, 56.10),
    (27.10, 55.70),
]


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


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _proximity_score(events: list[dict[str, Any]]) -> float:
    if not events:
        return 0.0
    min_distance = 9999.0
    for event in events:
        try:
            lat = float(event.get("lat", 0))
            lon = float(event.get("lon", 0))
        except Exception:
            continue
        for lane_lat, lane_lon in TRANSIT_LANE:
            min_distance = min(min_distance, _haversine_km(lat, lon, lane_lat, lane_lon))

    if min_distance <= 20:
        return 100.0
    if min_distance <= 50:
        return 70.0
    if min_distance <= 100:
        return 40.0
    return 20.0


def compute_risk(events: list[dict[str, Any]], now: datetime, official_threat_level: str = "CRITICAL") -> dict[str, Any]:
    if not events:
        return {
            "score": 0,
            "level": "LOW",
            "incidents": 0,
            "warnings": 0,
            "updated_at": now.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            "components": {"incident": 0, "diversity": 0, "proximity": 0, "warning": 0, "air": 0},
            "explanation": ["No events available."],
        }

    weighted_incident_sum = 0.0
    weight_sum = 0.0
    diversity = set()
    warning_count = 0
    advisory_count = 0
    air_count = 0
    attack_count = 0

    for event in events:
        event_type = str(event.get("type", "warning")).lower()
        diversity.add(event_type)
        if event_type == "warning":
            warning_count += 1
        if event_type == "advisory":
            advisory_count += 1
        if event_type == "air":
            air_count += 1
        if event_type in {"attack", "mine-related"}:
            attack_count += 1

        severity = BASE_SEVERITY.get(event_type, 45)
        confidence = float(event.get("confidence", 0.7))

        try:
            event_time = _parse_iso(str(event.get("time")))
            hours_delta = (now - event_time).total_seconds() / 3600.0
        except Exception:
            hours_delta = 8.0

        w = max(0.1, confidence * _decay(hours_delta))
        weighted_incident_sum += severity * w
        weight_sum += w

    incident_score = min(100.0, weighted_incident_sum / max(weight_sum, 1e-6))
    diversity_score = min(100.0, len(diversity) / 5.0 * 100.0)
    proximity_score = _proximity_score(events)
    warning_score = min(100.0, warning_count * 22.0 + advisory_count * 10.0)
    air_score = min(100.0, air_count * 28.0)

    base_score = (
        0.35 * incident_score
        + 0.15 * diversity_score
        + 0.20 * proximity_score
        + 0.20 * warning_score
        + 0.10 * air_score
    )

    official_modifier = OFFICIAL_MODIFIER.get(official_threat_level.upper(), 0)
    final_score = int(max(0, min(100, round(base_score + official_modifier))))

    return {
        "score": final_score,
        "level": _risk_label(final_score),
        "incidents": len(events),
        "warnings": warning_count + advisory_count,
        "updated_at": now.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "components": {
            "incident": round(incident_score, 2),
            "diversity": round(diversity_score, 2),
            "proximity": round(proximity_score, 2),
            "warning": round(warning_score, 2),
            "air": round(air_score, 2),
            "official_modifier": official_modifier,
        },
        "explanation": [
            f"{attack_count} high-severity attack/mine events in scope.",
            f"{warning_count} warnings and {advisory_count} advisories contributed to warning pressure.",
            f"Event diversity includes {len(diversity)} distinct threat categories.",
            f"Official baseline modifier applied: {official_threat_level.upper()} (+{official_modifier}).",
        ],
    }


if __name__ == "__main__":
    now = datetime.now(timezone.utc)
    sample = [{"type": "attack", "confidence": 0.9, "time": now.isoformat().replace("+00:00", "Z"), "lat": 26.5, "lon": 56.2}]
    print(json.dumps(compute_risk(sample, now), indent=2))
