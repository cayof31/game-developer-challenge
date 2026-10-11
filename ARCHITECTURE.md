# Architecture

Pirate Battle is a React application that hosts a PixiJS game inside a
small state machine of screens (menu → match → result). Everything the
player sees of the "backend" — ranking, history, submissions — is a mock
API running in the browser (MSW), so the whole solution runs from a clean
checkout with no external services or environment variables.

## Stack

- **React 19 + TypeScript (strict)** — screens, HUD, dialogs, forms.
- **PixiJS v8** — the arena canvas (rendering only; no rules in views).
- **TanStack Query** — ranking/history cache, invalidation, retries.
- **Axios** — one HTTP client (timeouts) in front of the handlers.
- **MSW** — the mock backend (handlers + in-memory db + scenarios).
- **Zod** — every boundary: API contracts, storages, options.
- **Vite** (dev/build) · **Playwright** (e2e).

## Directory map (the live tree)

```
src/
  config/        gameConfig — every gameplay number — and option limits
  api/           contracts (zod), http client, ranking/history APIs,
                 query keys + hooks, pending-submission queue
  mocks/         MSW worker, handlers, scenarios, in-memory db, fixtures
  bridge/        React↔Pixi seam: gameStore, MatchPublisher
  features/      screens — menu (boards, options), match (session, HUD,
                 touch pad, pause), result
  game/          the game itself:
    Simulation   rules — pure TS with ZERO Pixi imports; owns state and
                 steps the systems
    systems/     movement, weapons, enemy AI, spawn, collision, damage, score
    entities/    player/chaser/shooter/projectile factories
    map/         Tiled map loading + the arena's collision grid (pure TS)
    render/      the only Pixi-touching layer: renderer, camera/viewport,
                 arena/ship/projectile/effects views, asset loader. The
                 dependency is one-way: render → simulation (the rules
                 never import this folder, so nothing in the rules can
                 depend on Pixi)
  input/         keyboard + touch state, merged once per frame
  test-support/  window.__game hooks (?test=1 or VITE_E2E=1 only)
```

## Map pipeline

The arena is authored in Tiled (`assets/map-src/arena.tmx`) using the
provided 64×64 tilesheet and exported to `public/assets/maps/arena.tmj`.
Tile layers (`water`, `land`, `decor`) are render-only; the land layer
is also converted at load time into the collision grid used by the
simulation, so what is drawn is what blocks ships and projectiles.
Spawn points are validated against that same grid: candidates are rolled
inside a camera-relative window (the view, grown by a margin and
intersected with the world) and rejected unless they are **off-screen**,
at least **420 px from the player**, and in **open water** (no solid cell
within the ship's radius); after 20 rejected candidates no enemy spawns
that tick. The enemy kind is picked from the configured weights
(60 % chaser / 40 % shooter).

## React ↔ PixiJS integration

React owns the DOM; PixiJS owns one `<canvas>` inside the match screen.
They never share mutable state:

- `useGameSession` (features/match) is the lifecycle owner: on mount it
  loads the map and textures, builds the `Simulation` + `GameRenderer`,
  starts the loop, and tears both down on unmount or exit — one
  canvas and one ticker at a time. Both the session and the renderer
  carry a `disposed` flag that resolves React Strict Mode's double
  invocation: an unmount while the asynchronous init (asset loading) is
  still in flight is discarded when the init continuation resumes, so
  dev's double mount still leaves exactly one live renderer and one
  canvas.
- Combat starts only after the assets are ready: the match screen walks
  loading → ready, showing real progress (percentage + progress bar); a
  failed load shows the error with a **Retry** button that re-runs the
  asset loading. The simulation is never built against missing
  textures.
- During a match, the HUD numbers (score, hull, clock) flow through
  `bridge/gameStore`, a tiny external store React subscribes to with
  `useSyncExternalStore`. `MatchPublisher` is its only writer: score,
  health and status publish on the frame they change, the clock at most
  every ~250 ms, and a frame where nothing changed publishes nothing —
  the 60 fps sim never re-renders React per frame.
- A finished match is handed to React exactly once through the bridge;
  React persists the record (last result + pending queue) and switches to
  the result screen.
- Inputs: window keyboard listeners and the touch pad write into an input
  state; the session merges them once per frame and feeds the simulation.

## Simulation loop

- **Fixed timestep** (`1/60 s`) with an accumulator: frame deltas are
  consumed in exact fixed steps, so the rules are framerate-independent.
- The frame delta comes from the Pixi ticker, clamped to `MAX_FRAME_DELTA_MS`
  (100 ms): a backgrounded tab can never produce a giant step that
  teleports ships.
- One fixed step runs the systems in a fixed order:
  1. clock — session countdown, end by time;
  2. movement — ships (thrust only, no inertia);
  3. weapons — player/shooter cooldowns spawn projectiles;
  4. enemy AI — chasers home in, shooters keep their attack range and fire;
  5. ship↔arena collision — border clamp + island grid;
  6. chaser rams — contact damage, the chaser explodes on impact;
  7. projectiles — movement, arena, ship hits, damage, score;
  8. events — hits/explosions collected for the view layer.
- **Determinism**: all randomness comes from a seeded mulberry32 PRNG
  (`?seed=` in the URL, `setSeed` in test mode) and effects consume only
  tick deltas — the same inputs replay the same match. The e2e suite and
  the visual baselines build on this.
- **Test seam**: with `?test=1` (or the build-time `VITE_E2E=1`) the Pixi
  ticker is stopped and `window.__game` advances the real pipeline
  manually — `advance(ms)` delivers real ticks, so rules, rendering and
  inputs stay the production ones. Nothing is exposed in normal use
  (empirically verified: a plain load of the production build leaves
  `window.__game` undefined, at the menu and during a live match).

### Pause

- **Manual**: the HUD's Pause button or the `Esc`/`P` keys. While paused
  the dialog swallows `Esc` and resuming is always a click.
- **Automatic**: a hidden tab or a blurred window pauses the match
  (`usePageVisibility`); nothing ever auto-resumes — coming back only
  re-shows the dialog.
- While paused the status freezes and the loop runs no fixed steps at
  all: the clock, every weapon cooldown and every effect are suspended
  (they all advance on tick time). On the way back to running the
  keyboard state is released (`releaseAllKeyboard`) and any held touch
  pointer is dropped, so nothing from the paused period leaks into
  combat.

## Collisions

- **Ship ↔ arena**: the arena (built from the Tiled map) exposes
  walkable water plus a grid of island cells; ships are clamped at the
  border and pushed out of island cells (circle vs cell, by ship radius).
- **Projectile ↔ arena**: projectiles die on borders and islands.
- **Projectile ↔ ship**: circle vs circle; the damage lands in the same
  fixed step that removes the projectile — a hit can never double-fire.
- **Chaser ↔ player**: contact applies the ram damage once and the
  chaser explodes; killing blows are credited by the projectile's owner.

## Rendering and resource management

- One Pixi `Application` per match, initialized at
  `resolution: devicePixelRatio` with `autoDensity` — the canvas is
  allocated in device pixels but laid out in CSS pixels, so it stays
  sharp on HiDPI screens. A `ResizeObserver` on the host element (not
  `window.resize`) refits the canvas and the world transform on every
  layout change, including fullscreen.
- **Viewport and camera**: the host fills the viewport, so the canvas is
  not tied to 16:9. The scale fits the logical view (1920×1080,
  `gameConfig.view`) to the host, and the camera follows the player. It
  is clamped against the area that is actually visible (host size ÷
  scale) rather than the nominal view, so it also stops at the map edges
  on hosts that are not 16:9 (see the cosmetic caveat under Known
  limitations). `computeLetterbox` + `clampCamera` are small pure
  functions in `game/render/viewport.ts`. The arena renders the Tiled
  layers underneath.
- Views (`ArenaView`, `ShipView`, `ProjectileView`, `EffectsView`) map
  simulation state to containers/sprites. Effects (muzzle flash,
  explosions) run on tick-time progress, so they freeze with the manual
  clock and cost nothing on a paused page.
- **Teardown**: leaving or ending a match destroys the application,
  detaches ticker callbacks and input listeners, and deletes the test
  hooks. The committed profiling report
  (`docs/test-reports/profiling-*.md`) verifies five start/play/exit
  cycles do not grow the JS heap, the DOM or the canvas count.

## Local persistence

All persistent user state lives in versioned `localStorage` keys,
zod-validated on read — anything missing or malformed falls back to
defaults. The one exception is the current screen, which lives in
`sessionStorage` so a refresh can reopen the result screen without making
it sticky across tabs. Every key below has an active reader and writer;
none is reserved or dormant:

| Key | Contents | Read / written by |
| --- | --- | --- |
| `pirate-battle/options@1` | session time + spawn interval | options screen writes on save; a new match reads it |
| `pirate-battle/last-result@2` | last finished match | match screen writes it, result screen reads it (the data survives a reload) |
| `pirate-battle/pending-submissions@1` | matches waiting to be POSTed | the pending queue: recovered at boot, flushed and retried on the app mount |
| `pirate-battle/playerId@1` | stable local player uuid | created with the first submission (`api/contracts.ts`), sent with every one after it |
| `pirate-battle/scenario@1` | selected mock scenario | scenario picker writes it; the MSW handlers re-read it on every request |
| `pirate-battle/matches@1` | the mock db, hydrated at boot | `mocks/db.ts` — behind every ranking, history and submission request |
| `pirate-battle/screen@1` (**sessionStorage**) | the screen the app was showing | `App` writes it on every screen change and reads it once at boot |

### What a refresh does

The stored last result always persists, but it does not by itself decide
which screen opens. At boot the app restores the **result** screen only
if the player was on it before the refresh (and a stored result exists);
from anywhere else it lands on the **menu**:

- **Refresh on the result screen**: the result screen reopens with the
  same data.
- **Refresh during a match**: the match is abandoned and the app lands on
  the menu. Nothing is registered in the ranking or the history.
- **Refresh on the menu or options**: the menu opens.
- **A new tab** starts at the menu, since `sessionStorage` is per tab.
- **Pending submissions** are recovered and retried at boot no matter
  which screen opens.

## Ranking, history and the mock backend

- **Contracts** (`api/contracts.ts`): zod schemas are the single source
  of truth and the TS types are inferred from them, so the wire format
  and the types cannot drift. A finished match carries a client-generated
  UUID (`crypto.randomUUID()`) — the idempotency key of the POST.
- **Cache** (TanStack Query): keys are built only through
  `api/queryKeys.ts`, and the page is part of every key, so a late answer
  for an old page can never overwrite a newer one. A successful
  submission invalidates the whole ranking prefix (every page of the
  match's config bucket) and the player's history prefix.
- **Same-config rule and tie-break**: the ranking only ever compares
  matches played under the same options — the
  `sessionTimeSec|spawnIntervalSec` config bucket; scores from
  different configs never mix. Ties are resolved deterministically:
  score desc, then shorter duration, then older `playedAt`, then id —
  the same order on every load, across pages.
- **Mock backend** (`mocks/`): MSW handlers re-read the in-memory db
  (persisted in `localStorage`) and the active scenario on **every**
  request — latency, forced failures, empty lists, pagination — so a
  scenario switch takes effect immediately. `?seed=` makes the mock's own
  RNG reproducible.
- **Pending submissions**: a match is queued *before* the first attempt;
  the queue retries with an exponential backoff (1 s, 2 s, 4 s, … capped
  at 30 s), survives reloads (boot recovery + flush on the app mount),
  surfaces Saving/Pending/error on the result screen, and resends
  idempotently — a timeout after a successful write never duplicates the
  record.

## Balancing decisions

Key numbers (all in `src/config/gameConfig.ts`): the player has 100 hull
and 240 px/s — faster than every enemy, so kiting is always an option —
with a 25-damage front gun every 0.4 s: two aimed shots delete a chaser
(50 hp) before it can ram (25 damage). Shooters keep a 420 px attack
range and fire every 1.6 s (15 damage). Spawns are capped at 8 alive
ships with 60/40 chaser/shooter weights, one point per kill. The
player-facing options only expose pacing — session 60–180 s (default
120), spawn 0.5–10 s (default 3) — so the verified core stays fair; every
other knob is a typed config value with its rationale in the file.

**Aiming follows the spec, not the reference art**: the front gun fires
strictly along the bow and the two broadsides fire straight out the
sides (angle ∓90°, parallel to each other); there is no aim assist, no
convergence and no off-axis firing — alignment is entirely the player's
job. The concept art suggests wider firing arcs, but the enunciado
defines frontal + parallel lateral shots, and that is what was
implemented.

## Performance

Measured on the production build; full evidence and method in
`docs/test-reports/profiling-2026-10-11.md`.

- **Frame rate**: on the reference machine (Ryzen 5 5500U + Radeon via
  ANGLE/OpenGL, headless Chromium with `--enable-gpu`, 1280×720), a
  7-minute combat window holds **60 FPS avg with a p95 frame time of
  16.7 ms** (25 188 frames; enemies avg 1.3 / max 4, plus a separate
  window that exercised the configured cap of 8).
- **Slow frames**: a few frames do exceed one refresh interval. A
  dedicated instrumented run attributes all of them (6 in 14 393 frames)
  to the brief result-screen → rematch transition, where the two largest
  match measured main-thread long tasks (the React screen swap and the
  asset reload). None occurred during combat, where p95 equals the
  median (16.7 ms).
- **Memory**: five start/play/exit cycles with forced GC show the heap
  plateauing after warm-up (+0.2–0.4 MB per cycle, fully accounted for by
  accumulated history rows) and the canvas count returning to 0 at the
  menu after every cycle — no leak signal.
- **Mobile**: beyond the automated desktop runs, the touch controls and
  the match layout were additionally verified by manual testing on a
  physical device (Chrome on a Xiaomi Redmi Note 13).

## Mobile and orientation

Landscape is the supported orientation on mobile: while the viewport is
in portrait, the match screen is covered by a "Rotate your device"
prompt (`@media (orientation: portrait)` in `MatchScreen.css`). The
layout adapts with CSS only — no mobile-specific JS: the touch pad is
two thumb clusters in the bottom corners (movement left, guns right)
with safe-area insets for notches, its buttons are 64 px (above the
44 px touch-target recommendation), and every menu panel is fluid
(`min(<max>px, 100vw − gutter)`), so the screens fit phone widths
without a separate layout.

## Accessibility

- **Menus and dialogs are plain DOM**: every action is a native button,
  so keyboard activation comes for free, and a global `:focus-visible`
  rule (`styles/global.css`) draws a thick, offset gold ring on top of
  the sprite-based UI — nothing interactive is mouse-only.
- **Dialogs** (`components/Dialog.tsx`) are built on the native
  `<dialog>` + `showModal()`: everything outside goes inert (Tab stays
  inside), Esc closes a dismissible dialog (the pause dialog is not
  dismissible — only an explicit action closes it), focus moves to the
  first focusable control on open and returns to the opener on close,
  and the accessible name comes from the dialog's heading via
  `aria-labelledby`.
- **The Ranking / Match History tabs** implement the WAI-ARIA tabs
  pattern: Arrow keys and Home/End move focus and selection together,
  and a roving tabindex keeps a single stop in the page tab order.
- **In the match**, one polite live region (`role="status"`) speaks only
  on real events — start, pause/resume, the low-hull crossing, the end —
  while the clock and the score stay as plain readable HUD text with no
  `aria-live`, so a screen reader hears nothing per frame. Keyboard
  listeners are captured only while the match is running, so the pause
  dialog owns the keys while it is open.
- **Contrast**: the UI is token-based (`styles/tokens.css`); body text
  (`--color-text`, near-white) on the deep-ocean background sits at
  roughly 10:1 — above the WCAG AAA 7:1 threshold — and the focus ring
  uses a dedicated high-contrast gold.

## Known limitations

- Enemies do not path around islands: the AI steers straight at the
  player and the collision grid pushes the ship out, so an enemy behind
  an island simply presses against it ("stop against the island" —
  `enemyAISystem`). No flow-field or steering avoidance was implemented.
- **Camera edge (cosmetic)**: on some host aspect ratios, with the
  camera pinned to a map edge, a thin strip of the deep-ocean backdrop
  can still show past the map. It is visual only: ships and projectiles
  are bounded by the arena itself, so no rule depends on it.
- **Portrait on mobile**: a match cannot be played in portrait; a
  rotate-your-device prompt covers it. The menu, options and result
  screens work in either orientation.
- **Phone testing was manual**: the quantitative profiling above comes
  from the desktop reference machine; the physical phone check covered
  the touch controls and the layout.
- The backend is in-browser: the db persists across refreshes but there is
  no cross-device ranking and no server-side validation beyond the zod
  contracts mirrored in the handlers.
- The local identity is a generated uuid with a fixed display name
  ("Captain"); there is no name entry. The other players in the ranking
  are fixtures.
- One local viewport; no split screen or gamepad support.
- The visual baselines (and the e2e suite) are Chromium-only and
  machine-dependent by nature — documented in the README.