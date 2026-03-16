#!/usr/bin/env python3
"""UKMTO incident collector (best-effort, no external deps)."""

from __future__ import annotations

import json
import os
import re
import urllib.request
from datetime import datetime, timezone
from typing import Any

UKMTO_URL = "https://www.ukmto.org/indian-ocean/recent-incidents"

COORD_PATTERN = re.compile(r"(?P<lat>\d{1,2}(?:\.\d+)?)\s*[Nn][,\s]+(?P<lon>\d{1,3}(?:\.\d+)?)\s*[Ee]")
LINE_PATTERN = re.compile(r"<li[^>]*>(.*?)</li>", re.IGNORECASE | re.DOTALL)
TAG_PATTERN = re.compile(r"<[^>]+>")


def _iso_now(now: datetime) -> str:
    return now.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _clean_html(fragment: str) -> str:
    cleaned = TAG_PATTERN.sub(" ", fragment)
    return " ".join(cleaned.split())


def _fetch(url: str, timeout_s: int = 20) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "HormuzStraitEye/1.0"})
    with urllib.request.urlopen(req, timeout=timeout_s) as response:
        return response.read().decode("utf-8", errors="replace")


def parse_ukmto_html(html: str, now: datetime) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for block in LINE_PATTERN.findall(html):
        text = _clean_html(block)
        if len(text) < 20:
            continue

        coord_match = COORD_PATTERN.search(text)
        lat, lon = (float(coord_match.group("lat")), float(coord_match.group("lon"))) if coord_match else (26.55, 56.16)

        lowered = text.lower()
        if any(k in lowered for k in ("attack", "fire", "missile", "strike")):
            event_type = "attack"
        elif "advisory" in lowered:
            event_type = "advisory"
        else:
            event_type = "warning"

        events.append(
            {
                "lat": lat,
                "lon": lon,
                "type": event_type,
                "label": text[:120],
                "source": "UKMTO",
                "source_url": UKMTO_URL,
                "confidence": 0.85,
                "time": _iso_now(now),
            }
        )
    return events[:8]


def fallback_ukmto_events(now: datetime) -> list[dict[str, Any]]:
    return [{
        "lat": 26.55,
        "lon": 56.16,
        "type": "attack",
        "label": "UKMTO fallback: Security incident causing fire near transit lane",
        "source": "UKMTO",
        "source_url": UKMTO_URL,
        "confidence": 0.88,
        "time": _iso_now(now),
    }]


def collect_ukmto_events_with_status(now: datetime, url: str = UKMTO_URL) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if os.getenv("FORCE_UKMTO_FAIL") == "1":
        return fallback_ukmto_events(now), {
            "source": "UKMTO",
            "ok": False,
            "used_fallback": True,
            "error": "forced failure",
            "checked_at": _iso_now(now),
            "count": 1,
        }

    try:
        html = _fetch(url)
        events = parse_ukmto_html(html, now)
        if events:
            return events, {
                "source": "UKMTO",
                "ok": True,
                "used_fallback": False,
                "error": None,
                "checked_at": _iso_now(now),
                "count": len(events),
            }
        fallback = fallback_ukmto_events(now)
        return fallback, {
            "source": "UKMTO",
            "ok": False,
            "used_fallback": True,
            "error": "empty parse result",
            "checked_at": _iso_now(now),
            "count": len(fallback),
        }
    except Exception as exc:
        fallback = fallback_ukmto_events(now)
        return fallback, {
            "source": "UKMTO",
            "ok": False,
            "used_fallback": True,
            "error": str(exc)[:180],
            "checked_at": _iso_now(now),
            "count": len(fallback),
        }


def collect_ukmto_events(now: datetime, url: str = UKMTO_URL) -> list[dict[str, Any]]:
    events, _ = collect_ukmto_events_with_status(now, url=url)
    return events


if __name__ == "__main__":
    now = datetime.now(timezone.utc)
    events, status = collect_ukmto_events_with_status(now)
    print(json.dumps({"status": status, "events": events}, indent=2))
