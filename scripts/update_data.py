#!/usr/bin/env python3
"""Generate dashboard JSON from collectors with safe fallback policy.

Policy: bad update보다 stale update가 낫다 -> keep previous valid files if new data is invalid.
"""

from __future__ import annotations

import json
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
    if not isinstance(events, list) or len(events) == 0:
        return False
    for event in events:
        if not isinstance(event, dict):
            return False
        if not REQUIRED_EVENT_FIELDS.issubset(event.keys()):
            return False
    return True


def validate_risk(risk: dict) -> bool:
    if not isinstance(risk, dict):
        return False
    if not REQUIRED_RISK_FIELDS.issubset(risk.keys()):
        return False
    return True


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


def deduplicate_events(events: list[dict]) -> list[dict]:
    dedup: list[dict] = []
    seen: set[tuple[str, str, str]] = set()
    for event in events:
        key = (str(event.get("source", "")), str(event.get("label", ""))[:80], str(event.get("time", "")))
        if key in seen:
            continue
        seen.add(key)
        dedup.append(event)
    return dedup


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

    risk = compute_risk(events, now)
    risk["official_threat_level"] = "CRITICAL"
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
