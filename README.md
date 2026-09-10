# 0923katouC.github.io

Personal website hosted with GitHub Pages.

**Website:** [https://0923katouC.github.io/](https://0923katouC.github.io/)

## Current structure

- `index.html` — homepage
- `photography.html` — photography landing page
  - `photography/travel.html` — travel archive, organized chronologically
  - `photography/topics.html` — themed photography: conventions, birds, astronomy, outdoor
- `academics.html` — research interests, academic background and publications
- `writing.html` — writing landing page
  - `writing/fiction.html` — fiction
  - `writing/essays.html` — invitation-gated essays
- `projects.html` — games, AI tools and pond simulations
- `assets/css/style.css` — site-wide styles
- `assets/js/main.js` — language switch and common behavior
- `assets/js/essay-gate.js` — client-side essay access gate

## Publication synchronization

The publication block in `academics.html` is synchronized with INSPIRE author record `2107075`.

- `.github/workflows/sync-inspire.yml` runs once per week and can also be started manually from GitHub Actions.
- `scripts/sync_inspire_publications.py` resolves the author's current INSPIRE BAI, queries the INSPIRE Literature API, and updates only the HTML between `INSPIRE_PUBLICATIONS_START` and `INSPIRE_PUBLICATIONS_END`.
- If the INSPIRE list has not changed, the workflow makes no commit.
- If the INSPIRE API returns no publications or fails unexpectedly, the script exits without erasing the existing publication list.

## Security notes

The site is fully static and contains no server-side secrets. Pages use a restrictive Content Security Policy and conservative referrer settings. The invitation gate on the essay page is intended only as a lightweight browsing barrier; content requiring real confidentiality must not be stored in this public repository or shipped to the browser.
