#!/usr/bin/env python3
"""Operational checks for dashboard JSON snapshots."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
EVENTS_PATH = REPO_ROOT / "data" / "events.json"
RISK_PATH = REPO_ROOT / "data" / "risk.json"


def parse_iso(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def main() -> None:
    events = json.loads(EVENTS_PATH.read_text(encoding="utf-8"))
    risk = json.loads(RISK_PATH.read_text(encoding="utf-8"))

    assert isinstance(events, list) and events, "events.json must contain at least one event"
    assert isinstance(risk, dict), "risk.json must be an object"

    for key in ("updated_at", "data_staleness_minutes", "collector_status", "components", "explanation"):
        assert key in risk, f"risk.json missing key: {key}"

    updated_at = parse_iso(risk["updated_at"])
    now = datetime.now(timezone.utc)
    assert updated_at <= now, "updated_at cannot be in the future"

    for src in ("ukmto", "navarea"):
        assert src in risk["collector_status"], f"collector_status missing {src}"
        for field in ("ok", "used_fallback", "checked_at", "count"):
            assert field in risk["collector_status"][src], f"collector_status.{src} missing {field}"

    print("snapshot verification ok")
    print(f"updated_at={risk['updated_at']}")
    print(f"data_staleness_minutes={risk['data_staleness_minutes']}")
    print(f"ukmto_ok={risk['collector_status']['ukmto']['ok']} fallback={risk['collector_status']['ukmto']['used_fallback']}")
    print(f"navarea_ok={risk['collector_status']['navarea']['ok']} fallback={risk['collector_status']['navarea']['used_fallback']}")


if __name__ == "__main__":
    main()
