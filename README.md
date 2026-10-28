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
- `projects.html` — games, AI tools, pond simulations and little toys
- `projects/games/` — detective, railway and card-strategy games
- `projects/toys/` — imaginary radio and absurd inventions
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

## Pond experiment 001: Kerr black hole and accretion disk

Open [Pond simulations](https://0923katouC.github.io/projects/pond/) or the
[black-hole experiment](https://0923katouC.github.io/projects/pond/black-hole.html).
The page combines cached Kerr null-geodesic ray tracing, Page–Thorne thin-disk
emission and a time-dependent finite-volume 1D viscous disk. Magnetic stress is
prescribed; this is not a full 3D GRMHD calculation. Parameters, gas-ring injection,
frequency-shift and density views are interactive, with Chinese/English UI.

The academic-page renderer and its `1.0BH` baseline are unchanged. The new
renderer reuses the existing GPL-3.0-only Kerr geometry helpers with their attribution.
See [the equations, assumptions and papers](projects/pond/MODEL.md).

Run `node --test tests/*.test.cjs`; for actual GPU checks, serve the repository
with `python3 -m http.server 8765` and open `/tests/pond-gpu.html` and
`/tests/pond-kerr-geodesics.html`. No build or third-party JavaScript is required.

Camera interaction: drag the image to orbit, use the wheel or a two-finger
pinch to zoom. Arrow keys and +/- work while the image is focused; 0 resets
the view. Camera changes also work while paused. The renderer uses immediate
low-resolution camera previews followed by a refined, antialiased image.
Run `/tests/pond-camera-gpu.html` for the actual-GPU interaction checks.

## Games: Rain Night, Last Reel

The [Games collection](https://0923katouC.github.io/projects/games/) is linked
from the Games card in `projects.html`. Its first title is the original Chinese
mystery [雨夜最后一卷](https://0923katouC.github.io/projects/games/rain-reel/),
a relaxed 10–15 minute investigation with four locations, interviews, evidence
connections and a final accusation. There is no countdown.

- `projects/games/index.html` — bilingual games collection; the game itself is in Chinese.
- `projects/games/rain-reel/index.html` — game entry point.
- `projects/games/rain-reel/case-data.mjs` — original case text and solution data.
- `projects/games/rain-reel/state.mjs` — investigation rules and save validation.
- `projects/games/rain-reel/game.mjs` — interface, interviews and progression.
- `projects/games/rain-reel/game.css` and `scene.svg` — responsive styling and original illustration.

No build, third-party JavaScript, login or server API is required. Serve the
repository with `python3 -m http.server 8765` and open
`http://localhost:8765/projects/games/`. ES modules require an HTTP server;
opening the HTML directly as a local file is not supported.

Run the case progression and save-state checks with
`node --test tests/rain-reel.test.mjs` (Node.js 18 or later).

Progress and player notes are saved only in the current browser's local storage
under `cmc-rain-reel-v1`. Nothing is uploaded, and there is no cross-device sync.
If browser storage is blocked, the current session remains playable and displays
a save warning. Restart clears only this game's progress after confirmation.
Because the game is a public static site, its source includes the solution; the
normal interface reveals it only after the player completes the investigation.

## After-hours games and toys

The Games collection also includes **末班列车调度室** (`night-train/`), ten
track-rotation puzzles with ordered stops, undo and saved progress, and
**额度保卫战** (`quota-arcade/`), a seeded card game about keeping a fictional
quota between 40% and 50%. It does not read or spend any account's real quota.

The [Little Toys collection](https://0923katouC.github.io/projects/toys/)
contains **不存在电台** (`rain-radio/`), eight fictional stations with original
text broadcasts and optional synthesized ambience, and **无用发明局**
(`odd-inventions/`), a configurable invention generator with changing SVG
blueprints, favorites, reproducible links and downloadable SVG posters.
Radio audio begins only after an explicit Play action and pauses when the page
becomes hidden. Returning to the page does not resume it automatically.

Each project keeps its application code and illustration in its own directory.
They use native browser features, require no build step or third-party scripts,
and store progress or favorites only in the current browser. Blocked storage
does not prevent the current session from working. The bilingual collection
pages share `assets/css/playground.css`; `assets/js/playground.js` adds an
optional random-project button while preserving ordinary navigation links.

Run all game/toy model checks with `node --test tests/*.test.mjs` (Node.js 22
or later). `.github/workflows/odd-projects-check.yml` installs a pinned
Playwright version into the runner's temporary directory, serves the static
site, and exercises desktop and mobile pages in headless Chromium. It uploads
screenshots and a JSON report as a GitHub Actions artifact. The application
pages themselves have no npm dependencies.
