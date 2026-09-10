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

## Security notes

The site is fully static and contains no server-side secrets. Pages use a restrictive Content Security Policy and conservative referrer settings. The invitation gate on the essay page is intended only as a lightweight browsing barrier; content requiring real confidentiality must not be stored in this public repository or shipped to the browser.
