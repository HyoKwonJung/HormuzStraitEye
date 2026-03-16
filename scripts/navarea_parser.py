#!/usr/bin/env python3
"""NAVAREA IX parser with resilient extraction and timestamp parsing."""

from __future__ import annotations

import json
import os
import re
import urllib.request
from datetime import datetime, timezone
from typing import Any

NAVAREA_URL = "https://hydro.gov.pk/navarea-warnings"
COORD_PATTERN = re.compile(r"(?P<lat>\d{1,2}(?:\.\d+)?)\s*[Nn][,\s]+(?P<lon>\d{1,3}(?:\.\d+)?)\s*[Ee]")
TAG_PATTERN = re.compile(r"<[^>]+>")
LINE_SPLIT = re.compile(r"(?:\r?\n){2,}")

DATETIME_PATTERNS = [
    re.compile(r"(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?Z?)"),
    re.compile(r"(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\s+\d{2}:\d{2}\s*UTC)", re.IGNORECASE),
    re.compile(r"(\d{1,2}/\d{1,2}/\d{4}\s+\d{2}:\d{2})"),
]


def _iso_now(now: datetime) -> str:
    return now.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _fetch_text(url: str, timeout_s: int = 20) -> str:
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Referer": "https://www.google.com/",
        "Upgrade-Insecure-Requests": "1",
    })
    with urllib.request.urlopen(req, timeout=timeout_s) as response:
        return response.read().decode("utf-8", errors="replace")


def _clean(text: str) -> str:
    return " ".join(TAG_PATTERN.sub(" ", text).split())


def _extract_blocks(raw_text: str) -> list[str]:
    normalized = _clean(raw_text)
    blocks = [b.strip() for b in LINE_SPLIT.split(raw_text) if b.strip()]
    if len(blocks) < 2:
        blocks = [b.strip() for b in re.split(r"\s{2,}|\s*\|\s*", normalized) if len(b.strip()) > 35]
    return [_clean(b) for b in blocks if _clean(b)]


def _parse_datetime(text: str, now: datetime) -> str:
    for pattern in DATETIME_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue
        value = match.group(1).strip()
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        except Exception:
            pass
        for raw, fmt in (
            (value.replace(" UTC", " +00:00"), "%d %B %Y %H:%M %z"),
            (value.replace(" UTC", " +0000"), "%d %b %Y %H:%M %z"),
            (value, "%d/%m/%Y %H:%M"),
        ):
            try:
                dt = datetime.strptime(raw, fmt)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
            except Exception:
                continue
    return _iso_now(now)


def parse_navarea_text(raw_text: str, now: datetime) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for block in _extract_blocks(raw_text):
        low = block.lower()
        if not any(k in low for k in ("navarea", "warning", "hazard", "navigation", "mine")):
            continue

        coord_match = COORD_PATTERN.search(block)
        lat, lon = (float(coord_match.group("lat")), float(coord_match.group("lon"))) if coord_match else (26.73, 56.35)
        if "mine" in low:
            event_type = "mine-related"
        elif "warning" in low or "hazard" in low:
            event_type = "warning"
        else:
            event_type = "advisory"

        events.append(
            {
                "lat": lat,
                "lon": lon,
                "type": event_type,
                "label": block[:140],
                "source": "NAVAREA IX",
                "source_url": NAVAREA_URL,
                "confidence": 0.92,
                "time": _parse_datetime(block, now),
            }
        )

    return events[:10]


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
            "error": f"{exc.__class__.__name__}: {exc}"[:180],
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
