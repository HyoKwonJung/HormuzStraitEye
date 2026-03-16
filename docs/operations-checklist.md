# Operations Checklist

Use this checklist to verify that scheduled updates are healthy and visible to users.

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

## 5) UI consistency
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
