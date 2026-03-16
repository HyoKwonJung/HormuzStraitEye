# Operations Checklist

Use this checklist to verify Worker + KV snapshot updates are healthy and visible to users.

## 0) Worker + KV wiring
- Confirm Worker is deployed and reachable.
- Confirm KV namespace `DASHBOARD_SNAPSHOTS` is bound.
- Confirm Cron Trigger runs every 30 minutes.
- Confirm `/api/events` and `/api/risk` return JSON.


Use this checklist to verify that scheduled updates are healthy and visible to users.

## 0) Source URL validation
- Run `python scripts/validate_source_urls.py` and compare configured URLs with final resolved URLs.
- Confirm the URL opened in browser is the same as collector target (including redirects).
- Prefer stable listing/text/document endpoints over fragile UI pages when available.

## 1) GitHub Actions health
- Open **Actions** tab in the repository.
- Select **Update Dashboard Data** workflow.
- Confirm latest runs are green.
- Confirm schedule runs every 30 minutes.
- Confirm failures are not repeating.

## 2) Required workflow step order
1. Checkout
2. Set up Python
3. Generate JSON (`python scripts/update_data.py`)
4. Validate schema fields
5. Run snapshot verification
6. Simulate collector failures
7. Commit updated JSON
8. Push changes

## 3) Data file validation
Inspect:
- `data/events.json`
- `data/risk.json`

Confirm:
- `updated_at` is recent.
- `data_staleness_minutes` is sensible.
- `collector_status` exists and includes UKMTO/NAVAREA status.
- `components` and `explanation` exist.

## 4) Fallback detection
Check fields in `data/risk.json`:
- `collector_status.ukmto.ok`
- `collector_status.ukmto.used_fallback`
- `collector_status.navarea.ok`
- `collector_status.navarea.used_fallback`

Healthy target:
- `ok: true`
- `used_fallback: false`

## 6) UI consistency
Verify deployed UI values match repository JSON:
- Last updated
- Data freshness
- Sources checked
- Timeline
- Collector Health

## 6) Minimum pass criteria
- Workflow success
- `data/events.json` updated
- `data/risk.json` updated
- Dashboard shows latest values


## 7) Alternative collector runtime
If GitHub Actions egress is blocked (for example repeated 403/Tunnel errors), run collectors in a separate environment:
- Cloudflare Worker cron
- Render/Railway scheduled job
- VPS cron
- local scheduled runner

Recommended split for low-cost reliability:
- Frontend: GitHub Pages
- Collectors: external cron runtime
- Output: update `data/events.json` and `data/risk.json`
