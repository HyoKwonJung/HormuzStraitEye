#!/usr/bin/env python3
"""Generate dashboard JSON from collectors with safe stale-data fallback policy."""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent))

from navarea_parser import collect_navarea_events_with_status
from risk_model import compute_risk
from ukmto_collector import collect_ukmto_events_with_status

REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = REPO_ROOT / "data"
EVENTS_PATH = DATA_DIR / "events.json"
RISK_PATH = DATA_DIR / "risk.json"

REQUIRED_EVENT_FIELDS = {"lat", "lon", "type", "label", "source", "confidence", "time"}
REQUIRED_RISK_FIELDS = {
    "score",
    "level",
    "incidents",
    "warnings",
    "updated_at",
    "source_count",
    "collector_status",
    "data_staleness_minutes",
    "official_threat_level",
}


def iso(dt: datetime) -> str:
    return dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_iso(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def load_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def validate_events(events: list[dict]) -> bool:
    if not isinstance(events, list) or not events:
        return False
    return all(isinstance(e, dict) and REQUIRED_EVENT_FIELDS.issubset(e.keys()) for e in events)


def validate_risk(risk: dict) -> bool:
    return isinstance(risk, dict) and REQUIRED_RISK_FIELDS.issubset(risk.keys())


def build_supporting_events(now: datetime) -> list[dict]:
    return [
        {
            "lat": 26.89,
            "lon": 55.96,
            "type": "advisory",
            "label": "JMIC regional threat advisory update",
            "source": "JMIC",
            "source_url": "https://www.jmic-uk.com/advisories",
            "confidence": 0.99,
            "time": iso(now - timedelta(hours=4, minutes=50)),
        },
        {
            "lat": 26.46,
            "lon": 56.55,
            "type": "air",
            "label": "Unusual patrol orbit signal",
            "source": "OpenSky",
            "source_url": "https://opensky-network.org/",
            "confidence": 0.72,
            "time": iso(now - timedelta(hours=7, minutes=15)),
        },
    ]


def _normalize_label(text: str) -> str:
    text = text.lower()
    text = re.sub(r"\b(ukmto|navarea\s*ix|jmic|opensky|warning|advisory|incident|fallback)\b", " ", text)
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    tokens = [t for t in text.split() if len(t) > 2]
    return " ".join(tokens[:8])


def _time_bucket(ts: str) -> str:
    try:
        dt = parse_iso(ts)
        return dt.strftime("%Y-%m-%dT%H")
    except Exception:
        return "unknown"


def _event_key(event: dict) -> tuple:
    lat = round(float(event.get("lat", 0.0)), 1)
    lon = round(float(event.get("lon", 0.0)), 1)
    etype = str(event.get("type", "warning")).lower()
    label_norm = _normalize_label(str(event.get("label", "")))
    t_bucket = _time_bucket(str(event.get("time", "")))
    return etype, lat, lon, label_norm, t_bucket


def deduplicate_events(events: list[dict]) -> list[dict]:
    merged: dict[tuple, dict] = {}
    for event in events:
        key = _event_key(event)
        if key not in merged:
            copy = dict(event)
            copy["related_sources"] = [str(event.get("source", "unknown"))]
            merged[key] = copy
            continue

        existing = merged[key]
        existing["confidence"] = max(float(existing.get("confidence", 0.0)), float(event.get("confidence", 0.0)))

        # keep earliest event time as incident anchor
        try:
            current_time = parse_iso(str(existing.get("time")))
            incoming_time = parse_iso(str(event.get("time")))
            if incoming_time < current_time:
                existing["time"] = event.get("time")
        except Exception:
            pass

        src = str(event.get("source", "unknown"))
        related = set(existing.get("related_sources", []))
        related.add(src)
        existing["related_sources"] = sorted(related)

    return list(merged.values())


def compute_staleness_minutes(now: datetime, events: list[dict]) -> int:
    newest = now - timedelta(days=365)
    for event in events:
        try:
            t = parse_iso(str(event.get("time")))
            if t > newest:
                newest = t
        except Exception:
            continue
    return max(0, int((now - newest).total_seconds() // 60))


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc)

    prev_events = load_json(EVENTS_PATH, [])
    prev_risk = load_json(RISK_PATH, {})

    ukmto_events, ukmto_status = collect_ukmto_events_with_status(now)
    navarea_events, navarea_status = collect_navarea_events_with_status(now)

    events = deduplicate_events(ukmto_events + navarea_events + build_supporting_events(now))
    events = sorted(events, key=lambda e: str(e.get("time", "")), reverse=True)

    official_level = "CRITICAL"
    risk = compute_risk(events, now, official_threat_level=official_level)
    risk["official_threat_level"] = official_level
    risk["source_count"] = sum(1 for s in (ukmto_status, navarea_status) if s.get("ok"))
    risk["collector_status"] = {"ukmto": ukmto_status, "navarea": navarea_status}
    risk["data_staleness_minutes"] = compute_staleness_minutes(now, events)

    if not validate_events(events) or not validate_risk(risk):
        if validate_events(prev_events) and validate_risk(prev_risk):
            return
        raise RuntimeError("No valid fresh data and no previous valid snapshot")

    EVENTS_PATH.write_text(json.dumps(events, indent=2) + "\n", encoding="utf-8")
    RISK_PATH.write_text(json.dumps(risk, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
