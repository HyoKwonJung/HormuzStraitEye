#!/usr/bin/env python3
"""NAVAREA IX warning parser (best-effort, no external deps)."""

from __future__ import annotations

import json
import os
import re
import urllib.request
from datetime import datetime, timezone
from typing import Any

NAVAREA_URL = "https://hydro.gov.pk/navarea-warnings"
COORD_PATTERN = re.compile(r"(?P<lat>\d{1,2}(?:\.\d+)?)\s*[Nn][,\s]+(?P<lon>\d{1,3}(?:\.\d+)?)\s*[Ee]")
LINE_SPLIT = re.compile(r"(?:\r?\n){2,}")


def _iso_now(now: datetime) -> str:
    return now.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _fetch_text(url: str, timeout_s: int = 20) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "HormuzStraitEye/1.0"})
    with urllib.request.urlopen(req, timeout=timeout_s) as response:
        return response.read().decode("utf-8", errors="replace")


def parse_navarea_text(raw_text: str, now: datetime) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    blocks = [b.strip() for b in LINE_SPLIT.split(raw_text) if b.strip()]
    for block in blocks:
        low = block.lower()
        if "navarea" not in low and "warning" not in low:
            continue
        coord_match = COORD_PATTERN.search(block)
        lat, lon = (float(coord_match.group("lat")), float(coord_match.group("lon"))) if coord_match else (26.73, 56.35)
        event_type = "warning" if "warning" in low else "advisory"
        events.append(
            {
                "lat": lat,
                "lon": lon,
                "type": event_type,
                "label": " ".join(block.split())[:120],
                "source": "NAVAREA IX",
                "source_url": NAVAREA_URL,
                "confidence": 0.92,
                "time": _iso_now(now),
            }
        )
    return events[:8]


def fallback_navarea_events(now: datetime) -> list[dict[str, Any]]:
    return [{
        "lat": 26.73,
        "lon": 56.35,
        "type": "warning",
        "label": "NAVAREA IX fallback: New navigation warning issued near chokepoint",
        "source": "NAVAREA IX",
        "source_url": NAVAREA_URL,
        "confidence": 0.93,
        "time": _iso_now(now),
    }]


def collect_navarea_events_with_status(now: datetime, url: str = NAVAREA_URL) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if os.getenv("FORCE_NAVAREA_FAIL") == "1":
        fallback = fallback_navarea_events(now)
        return fallback, {
            "source": "NAVAREA IX",
            "ok": False,
            "used_fallback": True,
            "error": "forced failure",
            "checked_at": _iso_now(now),
            "count": len(fallback),
        }
    try:
        text = _fetch_text(url)
        events = parse_navarea_text(text, now)
        if events:
            return events, {
                "source": "NAVAREA IX",
                "ok": True,
                "used_fallback": False,
                "error": None,
                "checked_at": _iso_now(now),
                "count": len(events),
            }
        fallback = fallback_navarea_events(now)
        return fallback, {
            "source": "NAVAREA IX",
            "ok": False,
            "used_fallback": True,
            "error": "empty parse result",
            "checked_at": _iso_now(now),
            "count": len(fallback),
        }
    except Exception as exc:
        fallback = fallback_navarea_events(now)
        return fallback, {
            "source": "NAVAREA IX",
            "ok": False,
            "used_fallback": True,
            "error": str(exc)[:180],
            "checked_at": _iso_now(now),
            "count": len(fallback),
        }


def collect_navarea_events(now: datetime, url: str = NAVAREA_URL) -> list[dict[str, Any]]:
    events, _ = collect_navarea_events_with_status(now, url=url)
    return events


if __name__ == "__main__":
    now = datetime.now(timezone.utc)
    events, status = collect_navarea_events_with_status(now)
    print(json.dumps({"status": status, "events": events}, indent=2))
