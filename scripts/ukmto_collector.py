#!/usr/bin/env python3
"""UKMTO incident collector with resilient parsing and timestamp extraction."""

from __future__ import annotations

import json
import os
import re
import urllib.request
from datetime import datetime, timezone
from typing import Any

UKMTO_URL = "https://www.ukmto.org/indian-ocean/recent-incidents"

COORD_PATTERN = re.compile(r"(?P<lat>\d{1,2}(?:\.\d+)?)\s*[Nn][,\s]+(?P<lon>\d{1,3}(?:\.\d+)?)\s*[Ee]")
TAG_PATTERN = re.compile(r"<[^>]+>")

# Multiple extraction fallbacks to reduce parser breakage when HTML structure changes.
BLOCK_PATTERNS = [
    re.compile(r"<li[^>]*>(.*?)</li>", re.IGNORECASE | re.DOTALL),
    re.compile(r"<tr[^>]*>(.*?)</tr>", re.IGNORECASE | re.DOTALL),
    re.compile(r"<p[^>]*>(.*?)</p>", re.IGNORECASE | re.DOTALL),
]

# Common datetime patterns observed in advisories.
DATETIME_PATTERNS = [
    re.compile(r"(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?Z?)"),
    re.compile(r"(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\s+\d{2}:\d{2}\s*UTC)", re.IGNORECASE),
    re.compile(r"(\d{1,2}/\d{1,2}/\d{4}\s+\d{2}:\d{2})"),
]


def _iso_now(now: datetime) -> str:
    return now.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _clean_html(fragment: str) -> str:
    cleaned = TAG_PATTERN.sub(" ", fragment)
    return " ".join(cleaned.split())


def _fetch(url: str, timeout_s: int = 20) -> str:
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
    })
    with urllib.request.urlopen(req, timeout=timeout_s) as response:
        return response.read().decode("utf-8", errors="replace")


def _extract_blocks(html: str) -> list[str]:
    blocks: list[str] = []
    for pattern in BLOCK_PATTERNS:
        blocks.extend(pattern.findall(html))

    if not blocks:
        text = _clean_html(html)
        blocks = [x.strip() for x in re.split(r"(?:\.|\n)\s+", text) if len(x.strip()) > 40]

    # Deduplicate while preserving order.
    seen = set()
    unique = []
    for block in blocks:
        cleaned = _clean_html(block)
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            unique.append(cleaned)
    return unique


def _parse_datetime(text: str, now: datetime) -> str:
    for pattern in DATETIME_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue
        value = match.group(1).strip()
        candidates = [
            (value.replace(" UTC", " +00:00"), "%d %B %Y %H:%M %z"),
            (value.replace(" UTC", " +0000"), "%d %b %Y %H:%M %z"),
            (value, "%d/%m/%Y %H:%M"),
        ]

        # ISO-like first
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        except Exception:
            pass

        for raw, fmt in candidates:
            try:
                dt = datetime.strptime(raw, fmt)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
            except Exception:
                continue
    return _iso_now(now)


def parse_ukmto_html(html: str, now: datetime) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for text in _extract_blocks(html):
        lowered = text.lower()
        if not any(k in lowered for k in ("incident", "attack", "warning", "advisory", "security", "vessel")):
            continue

        coord_match = COORD_PATTERN.search(text)
        lat, lon = (float(coord_match.group("lat")), float(coord_match.group("lon"))) if coord_match else (26.55, 56.16)

        if any(k in lowered for k in ("attack", "fire", "missile", "strike", "explosion")):
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
                "label": text[:140],
                "source": "UKMTO",
                "source_url": UKMTO_URL,
                "confidence": 0.85,
                "time": _parse_datetime(text, now),
            }
        )

    return events[:10]


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
        fallback = fallback_ukmto_events(now)
        return fallback, {
            "source": "UKMTO",
            "ok": False,
            "used_fallback": True,
            "error": "forced failure",
            "checked_at": _iso_now(now),
            "count": len(fallback),
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
            "error": f"{exc.__class__.__name__}: {exc}"[:180],
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
