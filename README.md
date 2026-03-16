# Hormuz Strait Eye

Hormuz Strait Eye is a public-facing maritime security dashboard focused on operational risk signals in and around the Strait of Hormuz.

## Product Positioning

> Not just traffic. Operational risk intelligence for Hormuz.

The dashboard does **not** claim to track hidden military positions. Instead, it helps users understand risk by combining:
- Official maritime advisories and warnings
- Publicly reported security incidents
- Explainable risk indicators
- Location-aware event context

## View the Dashboard

```bash
cd app
python3 -m http.server 4173
```

Open `http://localhost:4173` in your browser.

## User-Facing Documentation

- `docs/product-blueprint.md`: What the product shows, how users should interpret it, and core dashboard sections
- `docs/risk-index-methodology.md`: How the public risk score is calculated and labeled

## Important Note

This prototype currently uses sample data for demonstration. It is designed to communicate risk structure and UX behavior, not to provide live operational truth by itself.


## Collector URL Diagnostics

To verify that configured collector URLs match real browser-resolved endpoints:

```bash
python scripts/validate_source_urls.py
```

Use this before debugging parser logic when 403 or redirect issues appear.
