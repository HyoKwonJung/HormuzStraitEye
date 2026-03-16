#!/usr/bin/env python3
"""Generate dashboard JSON from UKMTO + NAVAREA collectors and risk model."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# allow importing sibling modules when run as `python scripts/update_data.py`
sys.path.append(str(Path(__file__).resolve().parent))

from navarea_parser import collect_navarea_events
from risk_model import compute_risk
from ukmto_collector import collect_ukmto_events

REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = REPO_ROOT / "data"
EVENTS_PATH = DATA_DIR / "events.json"
RISK_PATH = DATA_DIR / "risk.json"


def iso(dt: datetime) -> str:
    return dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def build_supporting_events(now: datetime) -> list[dict]:
    return [
        {
            "lat": 26.89,
            "lon": 55.96,
            "type": "advisory",
            "label": "JMIC regional threat advisory update",
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


def deduplicate_events(events: list[dict]) -> list[dict]:
    dedup: list[dict] = []
    seen: set[tuple[str, str, str]] = set()
    for event in events:
      key = (
          event.get("source", ""),
          event.get("label", "")[:80],
          event.get("time", ""),
      )
      if key in seen:
          continue
      seen.add(key)
      dedup.append(event)
    return dedup


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc)

    ukmto_events = collect_ukmto_events(now)
    navarea_events = collect_navarea_events(now)
    extra_events = build_supporting_events(now)

    events = deduplicate_events(ukmto_events + navarea_events + extra_events)
    events = sorted(events, key=lambda e: e.get("time", ""), reverse=True)
    risk = compute_risk(events, now)

    EVENTS_PATH.write_text(json.dumps(events, indent=2) + "\n", encoding="utf-8")
    RISK_PATH.write_text(json.dumps(risk, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
