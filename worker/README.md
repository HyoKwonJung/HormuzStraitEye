# Cloudflare Worker Data Pipeline

This Worker replaces GitHub Actions-based live collection for runtime snapshot refresh.

## What it does

- Scheduled collection (Cron Trigger)
- UKMTO + NAVAREA fetch/parsing with fallback
- Event deduplication and risk computation
- Snapshot storage in Cloudflare KV
- API serving for dashboard:
  - `GET /api/events`
  - `GET /api/risk`

## Files

- `index.js`: Worker entry, API routes, scheduled refresh, KV read/write
- `ukmto.js`: UKMTO collector/parser
- `navarea.js`: NAVAREA collector/parser
- `risk_model.js`: explainable risk model
- `utils.js`: helper utilities (headers, JSON response, dedup, time helpers)
- `wrangler.toml`: deployment config

## Deploy

1. Install Wrangler

```bash
npm install -g wrangler
```

2. Login

```bash
wrangler login
```

3. Create KV namespace

```bash
wrangler kv namespace create DASHBOARD_SNAPSHOTS
```

4. Put namespace ID into `wrangler.toml` (`id = "..."`)

5. Deploy

```bash
cd worker
wrangler deploy
```

## Cron trigger

Configured in `wrangler.toml`:

- `*/30 * * * *`

Worker runs snapshot refresh on schedule and keeps previous valid snapshot when upstream fails.

## Local test

```bash
cd worker
wrangler dev
```

Check endpoints:
- `http://127.0.0.1:8787/api/events`
- `http://127.0.0.1:8787/api/risk`

Manual refresh:

```bash
curl -X POST http://127.0.0.1:8787/api/refresh
```
