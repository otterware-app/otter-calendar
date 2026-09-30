# Performance

Otter Calendar's headline is speed, so its performance is measured, not assumed. This page
records how, the numbers from the last run, what changed because of them, and what is still slow.
The design decisions behind the numbers are in [the calendar engine](./internals/calendar-engine.md).

## Setup

- **Machine:** 8-core AMD EPYC-Rome VM, 15 GB RAM, Linux, Node 24.18. Shared with other services,
  so expect ±10% between runs.
- **Browser:** headless Chromium from `playwright-core` 1.60 (software rendering, no GPU), a
  1600×1000 viewport at device scale 1, time zone Europe/Berlin.
- **App:** the production web build (`vp run build` in `apps/web`) served by the server itself on
  loopback, with a fresh home each run. Nothing is warm except what the run warms.
- **Data:** the `massive` demo source, seed 7 (`T3CODE_CALENDAR_DEMO=massive:7`): 10 accounts ×
  4 calendars = 40 calendars, about 102,000 stored events and 129,000 materialized occurrences
  over three years, with thousands of recurring series, multi-day and all-day events, and
  overlaps up to ten deep.
- **Two scenarios:**
  - **Heavy (8 of 40 calendars shown):** about 155 events in a week view. Busier than almost
    anyone's real week.
  - **Stress (all 40 shown):** about 830 events in a week view, roughly 120 a day. Past any real
    calendar; it exists to find where the engine breaks.

## Method

`scripts/perf/calendar-perf.ts` starts the server, pairs a browser with the startup pairing link,
waits until the demo accounts have synced and events are on screen, then measures:

| Metric             | How                                                                                                                                                                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First render       | Full page load straight into each view (`/calendar?view=…`), three times; time from navigation start until no visible week chunk is loading and two frames have painted.                                                                                   |
| Paging             | 20 × `J` (week) or 8 × `J` (month) into never-visited periods (cold), then back (warm) and forward again (warm). Reported as **key-to-paint**, the browser's Event Timing duration of the key press (what INP measures).                                   |
| Agenda scroll      | 180 wheel steps down and up over the virtualized agenda; `requestAnimationFrame` intervals and long tasks.                                                                                                                                                 |
| Drag               | Move (90 pointer steps across days), resize (bottom edge, 60 steps) and drag-to-create (60 steps), cancelled with Esc; frame intervals and long tasks (`PerformanceObserver`, > 50 ms) during the gesture.                                                 |
| Memory             | JS heap after forced GC (CDP `HeapProfiler.collectGarbage`), at start, after paging 52 weeks, and after returning to today.                                                                                                                                |
| WebSocket payloads | Every received frame through CDP. CDP reports frames decompressed; the server negotiates permessage-deflate, so each frame is also deflated per message to estimate the bytes on the wire (an upper bound: the real stream keeps its compression context). |

Chrome traces (`Tracing` over CDP) and CPU profiles symbolicated with the build's source maps
explained the numbers; the scripts that took them are one-offs, not committed.

Run it yourself (after `vp run build` in `apps/web`):

```sh
~/.local/bin/heavy 7G -- node scripts/perf/calendar-perf.ts --demo massive:7                         # stress
~/.local/bin/heavy 7G -- node scripts/perf/calendar-perf.ts --demo massive:7 --visible-calendars 8   # heavy
```

Results are written to `scripts/perf/results/` (git-ignored). The `heavy` wrapper caps memory on a
shared machine; any runner works.

## Results

Last run: 2026-09-30, final build. Times in milliseconds, p50 (p95).

| Metric                                      | Heavy (155 events/week)   | Stress (830 events/week)       |
| ------------------------------------------- | ------------------------- | ------------------------------ |
| First render: week                          | 505                       | 702                            |
| First render: day / 4 days                  | 452 / 475                 | 489 / 665                      |
| First render: month / agenda                | 545 / 519                 | 791 / 812                      |
| Paging weeks, key-to-paint, cold            | 112 (136)                 | 232 (264)                      |
| Paging weeks, key-to-paint, warm            | 96–104 (112)              | 232–248 (272)                  |
| Paging months, key-to-paint, warm           | 96 (112–120)              | 96–104 (112–128)               |
| Agenda scroll, frame interval               | 16.7 (16.8), 0 long tasks | 16.7 (16.8), 3 long tasks ≤ 69 |
| Drag move, frame interval                   | 16.7 (16.8), 0 long tasks | 16.7 (33.4), 2 long tasks ≤ 57 |
| Drag resize, frame interval                 | 16.7 (16.7), 0 long tasks | 16.7 (33.3), 1 long task, 54   |
| Drag to create, frame interval              | 16.7 (16.7), 0 long tasks | 16.7 (16.7), 0 long tasks      |
| Heap: start → after a year of weeks → today | 14.8 → 22.7 → 22.7 MB     | 14.7 → 31.0 → 31.1 MB          |
| Week chunk snapshot, raw / on the wire      | 25 KB / 5 KB              | 125 KB / 23 KB                 |
| Paging one week into new data, on the wire  | 7 KB                      | 29 KB                          |

Server side, on the same dataset (measured inside the calendar service): a week snapshot of about
830 occurrences across 40 calendars takes 2.5–3.5 ms; a search across every account about 5 ms; a
first week outside the materialized horizon about 390 ms once, while that year is expanded.

### Desktop startup

`scripts/perf/desktop-startup.ts` launches the Linux AppImage (`vp run dist:desktop:linux`) under
Xvfb with `--appimage-extract-and-run`, a fresh `HOME` and the standard demo data, and times it
over CDP until the calendar has painted events.

| Launch                                 | Window up | Calendar shell | First events |
| -------------------------------------- | --------- | -------------- | ------------ |
| First launch of a new build (extracts) | 2.7 s     | 5.4 s          | 5.8 s        |
| First launch of a profile (seeds demo) | 0.8 s     | 3.6 s          | 3.9–4.0 s    |
| Warm launch                            | 0.8–0.9 s | 3.5–3.6 s      | 3.9 s        |

The window appears once the bundled server is ready, about 2 s after start. 0.8 s of that is the
server reading the user's login-shell `PATH` synchronously (so a GUI launch finds `claude` and
`codex`); most of the rest is evaluating the 8 MB server bundle. Node's compile cache, which the
macOS build enables and the AppImage cannot use, made no measurable difference here.

## What the measurements changed

The first run (same dataset, stress scenario) found three problems, each fixed and re-measured:

| Problem (first run, stress)                                     | Cause                                                                                                             | Fix                                                                                                                                                     | After                                        |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 2–4 long tasks of 100–180 ms at the start and end of every drag | A gesture restyled every block (`[data-gesture] [data-calendar-event]`), and every block was a CSS size container | One shield element carries the gesture cursor; block sizes are classes computed at render instead of container queries                                  | 0–2 long tasks ≤ 57 ms (0 in the heavy case) |
| Week paging ~290 ms                                             | Style recalculation of ~5,800 boxes per page: 6–7 elements and 3 pseudo-elements per event                        | Blocks are one element plus a title; resize edges are hit-tested instead of drawn; the hover cursor is set on the one hovered block; time labels cached | ~230 ms stress, ~100 ms heavy                |
| Overlapping meetings unreadable                                 | Equal-width columns for deep overlaps                                                                             | Google's cascade layout, separated by background-colored borders (not shadows)                                                                          | —                                            |

Things measured and left alone: rendering from local state instead of the router's navigation
(no difference: the router was never the bottleneck), and the JavaScript side of a page step
(25–30 ms per step, mostly React applying DOM changes).

## Known limits and next levers

- **Very dense weeks page in about 230 ms.** The time goes to style recalculation of ~4,400
  boxes at 15–20 µs each; the shared UI kit's broad selectors (about 750 that cannot be bucketed,
  130 using `:has()`) make every box expensive. The next lever is recycling block elements per
  column between pages instead of replacing them, or pre-rendering the neighbouring week hidden
  with `content-visibility`.
- **Month views prefetch whole neighbouring months:** cold month paging moves about 130 KB on the
  wire in the stress case. Prefetching only the next month would halve it.
- **Server start (about 2 s) gates the desktop window.** Reading the login-shell `PATH`
  asynchronously, and waiting for it only before starting a provider, would save 0.8 s.
- Headless software rendering has no GPU; on real hardware, paint and raster costs are lower.
