# Mac system-audio bridge

This menu-bar helper captures the mixed output of all Mac applications with
Core Audio process taps. It never asks the user to choose a window, tab or
application. macOS system-audio permission is still required. The website
receives only 1024 frequency bins, a signal level and the sample rate; no
recording is stored or uploaded.

Requires an Apple Silicon Mac running macOS 14.2 or later. To build locally
with Apple Command Line Tools and Python 3:

```sh
sh projects/ai/reactor/desktop/build.sh /tmp/reactor-audio
```

Move the resulting `声场反应堆接入器.app` into your Applications directory and
open it. The menu-bar `◈` opens the website, stops capture or quits the helper.
Then use **接入整机声音** on the website. Allow the browser's local-connection
permission and the macOS system-audio prompt on first use. The downloadable
build is locally ad-hoc signed, not notarized by Apple; building locally is
also supported.

The listener binds only `127.0.0.1:49321`. Requests require the exact website
Origin and loopback Host, a random per-launch token, and a per-capture session
for frames and stop requests. It cannot be used by arbitrary websites. A new
capture replaces the previous session; stopping an old session cannot stop
the new one. Capture stops when the page disconnects, with a twelve-second
watchdog for missed stop requests. Browser sharing is retained as an explicit
fallback under the page's secondary options.

`ReactorAudio --self-test` checks the frequency analysis with a generated tone.
`ReactorAudio --test-server` serves generated spectrum data without reading
system audio; only this mode also accepts the local preview origin.
