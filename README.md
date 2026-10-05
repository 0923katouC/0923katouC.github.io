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
  - `writing/essays.html` — redirect to server-authenticated private essays and the protected collection list
- `projects.html` — games, AI tools and pond simulations
- `assets/css/style.css` — site-wide styles
- `assets/js/main.js` — language switch and common behavior

## Interaction motion

`assets/css/site-motion.css` enables native same-origin cross-document View
Transitions. Backgrounds fade over 220–280 ms while the incoming document stays
live: `site-motion.js` springs each heading and content module in independently
with a 75 ms stagger. Cards start at 87–91% scale, overshoot slightly and settle
over 620 ms. Buttons pop in over 520 ms, squash under a press and rebound with
two smaller settlements over 500 ms. Content below the fold enters once when
it approaches the viewport. Only the selected nav pill replays on internal
navigation; a fresh visit reveals all nav pills.

Native links, history, new-tab gestures, PDF downloads and private-essay access
keep their browser behavior. No navigation is delayed for an animation. Browsers
without cross-document transitions get the same module entrances on a normal
page load. Reduced motion disables the effects; interruptions and restored
history pages cancel animations and leave the content fully visible. Language
changes retain a short 180 ms fade.

The reference was [BigNaiWa](https://yhsome.github.io/BigNaiWa/): its button press
and springing panel entrance informed the interaction. The module choreography
and cross-page transition are specific to this site's structure; no game code
was copied.

## Homepage entry images

The four homepage cards use responsive WebP images from `assets/images/home-entries/`, served directly by GitHub Pages. The corresponding original JPEGs are preserved in `assets/images/home-entries/originals/`, named `photography`, `academics`, `writing`, and `projects`.

Run `python scripts/build_home_entry_images.py` with Pillow installed to regenerate the 480px and 960px variants. Source images retain their full frame; `assets/css/home.css` controls subject placement, responsive cover cropping, and translucency, while the shared stylesheet keeps the original card dimensions.

## Publication synchronization

The publication block in `academics.html` is synchronized with INSPIRE author record `2107075`.

- `.github/workflows/sync-inspire.yml` runs once per week and can also be started manually from GitHub Actions.
- `scripts/sync_inspire_publications.py` resolves the author's current INSPIRE BAI, queries the INSPIRE Literature API, and updates only the HTML between `INSPIRE_PUBLICATIONS_START` and `INSPIRE_PUBLICATIONS_END`.
- If the INSPIRE list has not changed, the workflow makes no commit.
- After a successful sync on `main`, the workflow explicitly requests a GitHub Pages build using `pages: write`, because pushes made with `GITHUB_TOKEN` do not trigger branch-based Pages builds. No-change runs also request a build so retries can recover a previous build-request failure.
- If the INSPIRE API returns no publications or fails unexpectedly, the script exits without erasing the existing publication list.

Run publication-sync regression tests with `python -B -m unittest discover -s tests -p 'test_sync_inspire_publications.py' -v`.

Run browser-script regression tests with `node --test tests/*.test.cjs` (Node.js 18 or later; no npm dependencies). These cover language switching when browser storage is unavailable and renderer fallback after texture-allocation failures. Run the full Python suite with `python -B -m unittest discover -s tests -v`; the volume-model tests require NumPy.

## Security notes

The GitHub Pages site is static and contains no private essay content or credentials. The essays entry links to a separate Cloudflare Worker at https://cmc-private-essays.cmc-private-essays.workers.dev, which verifies a fixed shared access key using a salted server-only PBKDF2 verifier before creating a server-stored session. Private R2 reads require a valid session and the current key version; changing the key invalidates old sessions. The old browser-only gate has been removed.

Never commit private essay text, access keys, credential verifiers, session records or private storage exports to this repository. The private service must keep R2 public access and preview URLs disabled, restrict its canonical hostname, and return no-store responses. Authorized readers can still save or share content they have read.


## Academic background renderer

The academic page uses a WebGL 2 adaptation of [baopinshui/NPGS](https://github.com/baopinshui/NPGS).
See the [upstream attribution, GPLv3 license and adaptation notes](assets/vendor/npgs/README.md)
for the rendering scope and source details.

The active scene contains only the black hole, its animated accretion disk and
lensed background stars. It restores the large framing from before the extra
objects, with higher-resolution central ray sampling. Earlier SPH experiment
files are retained as research records; the page does not load them.
