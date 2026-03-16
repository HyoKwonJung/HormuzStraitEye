# Hormuz Strait Eye

Hormuz Military Dashboard is a lightweight OSINT project that monitors security conditions in and around the Strait of Hormuz through a public dashboard. The system combines event collection, deduplication, explainable risk scoring, geospatial visualization, and resilient snapshot serving. It is designed to remain usable even when some collectors fail, making fallback state, freshness, and collector health visible to end users.

**Live dashboard:**  
https://hyokwonjung.github.io/HormuzStraitEye/app/

## Features

- Live-source collection and fallback-resilient snapshots
- Explainable risk scoring
- Operational event map and timeline
- Collector health, freshness, and fallback visibility

## Data Sources

- UKMTO
- NAVAREA IX
- JMIC
- OpenSky

## Risk Model

The risk model is designed to be transparent and operationally interpretable.
It considers:
event severity by type
time decay
event diversity
proximity to transit lanes
warning pressure
air / signal activity
official baseline modifier
The final output includes both:
a numerical score
a textual explanation of major drivers


## Current Limitations

NAVAREA collection may still degrade into fallback mode depending on upstream behavior.
Source reliability can vary based on runtime network conditions and provider restrictions.
This project is intended as an OSINT situational awareness tool, not as an authoritative military command-and-control system.


## Disclaimer

This dashboard is an OSINT-based public information tool intended for situational awareness, experimentation, and portfolio demonstration. It should not be treated as an official military or shipping authority system.




