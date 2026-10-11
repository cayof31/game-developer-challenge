# Performance profiling — Pirate Battle (2026-10-11)

Combat and memory profiling of the **production build** (`pnpm build`,
served by `pnpm preview --port 4173`), produced by a throwaway Playwright
harness driving the real page. Method below is reproducible; the harness
itself was deleted after the runs (convention: reports are committed,
one-off scripts are not).

## Reference environment

| Item | Value |
| --- | --- |
| Hardware | AMD Ryzen 5 5500U, 6 cores / 12 threads, up to 4.06 GHz; 6.6 GiB RAM; AMD Radeon iGPU (`/dev/dri/card1`) |
| OS | Ubuntu, kernel 7.0.0-31-generic, x86_64 |
| Browser | Playwright 1.64.0 bundled Chromium (chromium-1248, Chrome for Testing 156.0.8078.4), headless |
| Graphics (primary runs) | WebGL2 on the Radeon iGPU — `ANGLE (AMD, AMD Radeon Graphics (radeonsi renoir ACO), OpenGL 4.6)`, **hardware rasterization** (launch flags `--enable-gpu --ignore-gpu-blocklist`) |
| Graphics (fallback runs) | The default headless launch silently uses `SwiftShader` (software) — measured separately below |
| Viewport | 1280×720, devicePixelRatio 1 |
| Build | production bundle (`pnpm build`); main chunk 882 kB (304 kB gzip) |
| Match config | seed 42, session 180 s (max), spawn interval 10 s (slowest legal), scripted keyboard pilot (no human) |

## Method

- The test seam (`?test=1`) stops the Pixi ticker; the harness drives the
  **real pipeline** from `requestAnimationFrame`: one `advance(frameDelta)`
  per browser frame with the delta clamped at 100 ms — the exact contract
  production's ticker uses. Rules, rendering and inputs are the
  production ones; only the clock driver is external.
- Frame stats come from in-page rAF timestamps → frame deltas → avg FPS,
  median/p95/p99/max frame time, and % of frames over 16.7 ms / 33.3 ms.
- Entities (alive enemies, live projectiles, hull, score) are sampled
  every ~1 s through `window.__game.getState()`.
- Memory: a separate run on the **real clock** (no `?test=1`, default
  options: session 120 s, spawn 3 s): five cycles of start → ~25 s of
  active play → exit to menu, sampling after a forced GC
  (CDP `HeapProfiler.collectGarbage` + `Performance.getMetrics`) at the
  menu after every cycle, plus DOM node and canvas counts.

## Results — combat, hardware GPU (1280×720)

Continuous combat window of **420 s** under the 180 s-session config —
2.3× the three minutes the challenge asks for — spanning eight lives of
the scripted pilot (the harness window outlived it), 25 188 frames:

| Metric | Value |
| --- | --- |
| Average FPS | **60.0** |
| Median frame time | 16.7 ms |
| **p95 frame time** | **16.7 ms** |
| p99 frame time | 16.8 ms |
| Max frame time | 50.1 ms (attributed below) |
| Frames > 33.3 ms | **0.02 %** (attributed below) |

Frame deltas are vsync-quantized at 60 Hz (39 % of frames land a
fraction above the 16.7 ms threshold — 16.7–16.8 ms, not stalls). **The
60 FPS target is met** in the documented reference environment, p95
included.

**Entities in the window** (per-second samples, n = 420): alive enemies
avg **1.34** / max **4**; live projectiles avg **0.89** / max **5**;
hull min 5.

## Results — worst-case entity load (configured cap reached)

A separate window (same build and config, software path) where the pilot
let enemies accumulate: enemies avg **2.99** / max **8 — the configured
`spawnMaxActiveEnemies` cap**; projectiles avg 1.77 / max 7, over 330 s
(320 samples). This bounds the entity side of the load: even at the cap,
entity count is not what moves frame time (see attribution below). A
supporting single-life run under an actively-firing pilot: 142.9 s
survived, 12 kills, projectiles avg 2.51 / max 4.

## Attribution — the software fallback is raster-bound, not game-bound

The default headless launch (no GPU flags) secures
`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader
driver)` — pure CPU rasterization. Same harness, same build, same match
config:

| Metric | 1280×720 (SwiftShader) | 640×360 (SwiftShader) |
| --- | --- | --- |
| Average FPS | 20.0 | **54.5** |
| Median frame time | 50.0 ms | **16.7 ms** |
| p95 frame time | 66.7 ms | **33.3 ms** |

Frame time scales with pixel count (4× pixels → ~2.7× slower frames),
while entity count does not affect it: the bottleneck of the software
path is **per-pixel rasterization**, not the simulation or scene graph.
With hardware rasterization (the primary run above) the same 720p combat
sits exactly on the 60 Hz cadence.

## Attribution — long frames belong to life transitions, not combat

A dedicated 240 s hardware run (same build, machine and viewport; default
match options — 120 s session, 3 s spawn — keyboard bot, 8 lives)
instruments every frame delta against `PerformanceObserver` entries
(`longtask`, `gc`) and phase markers (combat vs. result→rematch
transition):

| Metric | Value |
| --- | --- |
| Frames | 14 393 — 59.9 FPS avg, median/p95 16.7 ms, p99 16.8 ms |
| Frames > 33.3 ms | 6 (0.04 %) |
| …of which in combat | **0** |
| …of which in the result→rematch transition | 6, including the max (83.4 ms) |

- Every long frame sits between one life ending and the next one
  starting (result screen → Play Again → asset reload + React screen
  swap). The two largest (83.4 ms, 66.7 ms) each coincide with a
  measured main-thread long task (79 ms and 68 ms, under 100 ms apart).
- No `gc` entry was recorded in the window (the observer was
  supported) — the hitches are main-thread work, not garbage collection.
- This pins down the main combat window's outliers above: it spans the
  same kind of transitions between its lives, and its 5 frames over
  33.3 ms (worst 50.1 ms, 0.02 %) are of the same magnitude. During
  combat both windows are vsync-flat: p95 = median = 16.7 ms.

## Results — memory, five start/play/exit cycles (real clock)

Forced-GC samples at the menu after each cycle:

| Sample | JS heap used | JS heap total | DOM nodes | Canvases | History/Ranking rows |
| --- | --- | --- | --- | --- | --- |
| boot-menu | 3 046 KB | 4 040 KB | 19 | 0 | 0 / 0 |
| cycle 1 | 7 920 KB | 8 616 KB | 107 | 0 | 1 / 1 |
| cycle 2 | 8 181 KB | 9 640 KB | 107 | 0 | 1 / 1 |
| cycle 3 | 8 598 KB | 10 408 KB | 116 | 0 | 2 / 2 |
| cycle 4 | 8 791 KB | 10 920 KB | 125 | 0 | 3 / 3 |
| cycle 5 | 9 062 KB | 10 920 KB | 134 | 0 | 4 / 4 |

- Heap: +4.9 MB on the first cycle (app + Pixi warm-up), then
  +0.26 / +0.42 / +0.19 / +0.27 MB per cycle — small and not accelerating.
- DOM: every +9 nodes corresponds exactly to the new history + ranking
  rows of the match just played (rows grow 1→4 with the cycles) —
  legitimately accumulated data, not residue.
- Canvas count is **0 at the menu after every cycle** — the Pixi
  application is fully destroyed on exit (no orphaned canvases/tickers).

**Verdict**: no unbounded resource growth in five cycles; the teardown
path (renderer destroy, input detach, hook deletion) leaves nothing
behind.

## Limitations observed

- Hardware rasterization needs explicit launch flags in headless
  (`--enable-gpu --ignore-gpu-blocklist`); the default launch silently
  falls back to SwiftShader, where 720p tops out at ~20 FPS. On headed
  desktop browsers the GPU path is the default.
- The scripted pilot is not human skill: the longest single life was
  142.9 s (95.3 s in the hardware run) — no life reached the 180 s time
  end, so the measured window spans several lives and includes brief
  result/loading frames between them (a few % of the window).
- Single machine, single runs per configuration — no repeats or
  confidence intervals.
- Heap figures are forced-GC snapshots at the menu, not a continuous
  allocation trace; five cycles bound short-horizon leaks only.
- Mobile was covered by **manual testing only** (touch controls and
  layout on a physical device) — no automated mobile metrics are
  claimed anywhere in this report.
- The bundle exceeds Vite's 500 kB chunk guideline (882 kB / 304 kB
  gzip, single chunk) — informational; code-splitting was out of scope.
