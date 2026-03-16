# Hormuz Strait Eye

Hormuz Strait Eye is a public-facing maritime security dashboard focused on operational risk signals around the Strait of Hormuz.

## Architecture (Current)

- **Frontend**: static dashboard on GitHub Pages (`/app`)
- **Live data API**: Cloudflare Worker (`/api/events`, `/api/risk`)
- **Snapshot storage**: Cloudflare KV (`DASHBOARD_SNAPSHOTS`)

This replaces the previous GitHub Actions-only live collection path, which can fail in some environments due to outbound fetch restrictions.

## View Dashboard Locally

```bash
cd app
python3 -m http.server 4173
```

Open `http://localhost:4173`.

> By default `app/index.html` uses `API_BASE = "https://YOUR-WORKER.workers.dev"`.
> If this placeholder is unchanged, it falls back to local `../data/*.json` for local preview.

## Configure Frontend API

In `app/index.html` set:

```js
const API_BASE = "https://YOUR-WORKER.workers.dev";
```

Then the dashboard fetches:
- `${API_BASE}/api/events`
- `${API_BASE}/api/risk`

## Worker Deployment

See full guide: `worker/README.md`

Quick steps:

```bash
cd worker
wrangler login
wrangler kv namespace create DASHBOARD_SNAPSHOTS
# put KV id into worker/wrangler.toml
wrangler deploy
```

## Collector URL Diagnostics

To validate configured source URLs and final resolved endpoints:

```bash
python scripts/validate_source_urls.py
```

Use this before deep parser debugging when 403/redirect/runtime egress issues appear.

## User-Facing Documentation

- `docs/product-blueprint.md`
- `docs/risk-index-methodology.md`
- `docs/operations-checklist.md`

## Legacy Python Pipeline

The Python collector/model scripts remain in `scripts/` as legacy/reference and local fallback tooling.
