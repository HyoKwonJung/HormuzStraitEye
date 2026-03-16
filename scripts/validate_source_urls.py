#!/usr/bin/env python3
"""Validate collector source URLs and report final resolved endpoints.

This is a diagnostic utility for manual ops checks.
"""

from __future__ import annotations

import json
import urllib.request
import urllib.error
from dataclasses import asdict, dataclass
from datetime import datetime, timezone

from ukmto_collector import UKMTO_URL
from navarea_parser import NAVAREA_URL

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Referer": "https://www.google.com/",
    "Upgrade-Insecure-Requests": "1",
}


@dataclass
class UrlCheck:
    name: str
    configured_url: str
    requested_url: str
    final_url: str | None
    status_code: int | None
    ok: bool
    error: str | None
    checked_at: str


def check_url(name: str, url: str, timeout_s: int = 20) -> UrlCheck:
    req = urllib.request.Request(url, headers=HEADERS, method="GET")
    checked_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            return UrlCheck(
                name=name,
                configured_url=url,
                requested_url=url,
                final_url=resp.geturl(),
                status_code=getattr(resp, "status", None),
                ok=True,
                error=None,
                checked_at=checked_at,
            )
    except urllib.error.HTTPError as exc:
        return UrlCheck(
            name=name,
            configured_url=url,
            requested_url=url,
            final_url=getattr(exc, "url", None),
            status_code=exc.code,
            ok=False,
            error=f"{exc.__class__.__name__}: {exc}",
            checked_at=checked_at,
        )
    except Exception as exc:
        return UrlCheck(
            name=name,
            configured_url=url,
            requested_url=url,
            final_url=None,
            status_code=None,
            ok=False,
            error=f"{exc.__class__.__name__}: {exc}",
            checked_at=checked_at,
        )


def main() -> None:
    checks = [
        check_url("UKMTO", UKMTO_URL),
        check_url("NAVAREA IX", NAVAREA_URL),
    ]
    payload = {"checks": [asdict(c) for c in checks]}
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
