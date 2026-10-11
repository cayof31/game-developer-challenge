# React + TypeScript + Vite

## Getting started

Prerequisites: Node 24 and pnpm 12 (the versions this solution was
developed and verified with).

```bash
pnpm install   # dependencies
pnpm dev       # dev server with HMR
```

The app is self-contained: the whole backend is a mock intercepted by
MSW in the browser — no server, database or private service is needed. A
clean checkout runs offline after `pnpm install`.

### Environment variables

None are required. The only flag the code reads is the build-time
`VITE_E2E=1`, which installs the Playwright test hooks (`window.__game`)
on every load — the normal dev/build flow never sets it; the e2e suite
passes `?test=1` in the URL instead.

### Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | dev server (Vite, HMR) |
| `pnpm build` | typecheck (`tsc -b`) + production build |
| `pnpm typecheck` | type verification only |
| `pnpm lint` | ESLint over the whole repo |
| `pnpm preview` | serve the production build |
| `pnpm test:e2e` | Playwright suite (builds and serves the production bundle) |
| `pnpm test:report` | open the HTML report of the last e2e run |
| `pnpm test:e2e:update` | regenerate the visual baselines (same machine only — see Tests) |

### Controls

| Action | Keyboard | Touch (landscape) |
| --- | --- | --- |
| Thrust | `W` or `↑` | Thrust |
| Turn left / right | `A`/`←` · `D`/`→` | Turn left · Turn right |
| Front gun | `Space` | Fire forward |
| Broadside left / right | `Q` · `E` | Fire left/right broadside |
| Pause | `Esc` or `P`, or the HUD's Pause button | Pause button |

On phones the touch pad replaces the keyboard during a match; the device
must be held in landscape.

### Gameplay configuration

The Options screen (from the main menu) exposes two knobs, persisted in
`localStorage` and validated against documented bounds
(`src/config/limits.ts`):

- **Game session time** — 60 to 180 s (default 120)
- **Enemy spawn time** — 0.5 to 10 s between spawns (default 3)

Every other gameplay number lives in `src/config/gameConfig.ts` (speeds,
damage, cooldowns, radii, spawn weights…); a match reads a snapshot of
the config taken at match start. Scenario selection/reset and how to
reproduce network failures are covered in the next section.

## Pirate Battle — mock backend, scenarios and debug tools

Pirate Battle ships without a real server: the whole backend is a mock
(`src/mocks/`) intercepted by MSW in every environment — the db lives in
memory, persisted in `localStorage` (`pirate-battle/matches@1`). Its
behaviour is driven by **scenarios** (`src/mocks/scenarios.ts`): latency,
forced failures, empty lists and pagination, re-read by the handlers on
**every request**, so a switch takes effect immediately.

### Picking a scenario

- **In the app**: the discreet **Debug** button at the bottom-right of
  the main menu opens the panel (a `<select>` + **Reset**). Picking a
  scenario also reloads the mounted ranking/history lists.
- **By URL**: open the app with `?scenario=slow`. The choice is persisted
  in `localStorage` (`pirate-battle/scenario@1`) and re-applied on
  reloads without the parameter; picking in the panel drops the URL
  override. `?debug=1` opens the panel straight away.
- **Reproducible latency**: `?seed=42` seeds the mock's RNG (mulberry32,
  same as the game) — same seed, same latency sequence. Fixed latency is
  a preset with `min === max` (e.g. `slow`).

### The scenarios

| Scenario | What the mock does |
| --- | --- |
| `success` | the happy path, no latency |
| `empty` | ranking and history answer empty pages |
| `many-pages` | the lists report ~5 pages (derived, smaller page size) |
| `slow` | every response waits 1.5 s |
| `variable-latency` | 100–1200 ms per request, drawn from the seeded RNG |
| `out-of-order` | the FIRST request of each endpoint waits 2.5 s while the following ones take ~100 ms — the old response lands after the new one |
| `ranking-error` | `GET /api/ranking` answers 500 (history still works) |
| `history-error` | `GET /api/history` answers 500 (ranking still works) |
| `http-4xx` | `POST /api/matches` answers 400 — the result screen shows the rejection and a manual **Try again** |
| `http-5xx` | POST answers 500 — the queue keeps the record and retries with backoff |
| `network-error` | the connection dies before any answer |
| `timeout` | the POST never answers; the client gives up after its 5 s timeout |
| `timeout-after-write` | the record is **stored** and then the answer never arrives — the resend of the same id finds the existing record and the queue clears |
| `submit-down-then-recover` | the first 3 submissions fail with 500, then the endpoint accepts (counter in the mock) |

### Reset

**Reset** in the debug panel empties the mock's `localStorage` — records,
the active scenario and the pending-submissions queue
(`pirate-battle/matches@1`, `pirate-battle/scenario@1`,
`pirate-battle/pending-submissions@1`) — restores the 28 fixture matches
(`src/mocks/fixtures/seedRecords.ts`) and reloads the ranking/history
queries.

### Reproducing submission failures

Finish a match (the record is queued before it is sent) under a failing
scenario: the queue persists it, retries with an exponential backoff
(1 s, 2 s, 4 s, … up to ~30 s), survives refreshes, and shows **Try
again** on the result screen after a 4xx. Switch back to `success` (or
press **Reset**) and the next retry lands the record. Submissions are
idempotent by client-generated match id: a record is never stored twice,
no matter how many times it is resent.

## Tests

The end-to-end suite (Playwright) drives the real production build — the
config's webServer runs `pnpm build && pnpm preview --port 4173`, never
the dev server — across two projects in parallel: `desktop` (1280×720)
and `mobile` (Pixel 7 in landscape, touch-enabled). 31 tests × 2 projects
= 62 runs, deterministic throughout (seed 42, the manual test clock, no
fixed sleeps).

- `pnpm test:e2e` — the full suite
- `pnpm test:report` — opens the HTML report of the last run
  (`playwright-report/`)
- `pnpm test:e2e:update` — regenerates the visual baselines

Committed reports live under `docs/test-reports/` (e2e runs and the
performance profiling). The solution's design — React/PixiJS integration,
simulation loop, collisions, resource management, persistence, the
ranking/history pipeline, balancing decisions and limitations — is
documented in [`ARCHITECTURE.md`](ARCHITECTURE.md).

### Visual baselines are machine-dependent

`e2e/visual.spec.ts-snapshots/*.png` are pixel comparisons: they only
match the **system and browser that generated them** — fonts, GPU
rasterization and DPI all shift the output. Always regenerate them in the
same environment (`pnpm test:e2e:update`) and commit the result produced
there; never mix baselines from different machines. That is also why
`.github/workflows/ci.yml` runs every spec **except** `visual.spec.ts` —
a foreign runner would fail on pixels alone, so the visual regression is
a local step. Artifacts (`test-results/`, `playwright-report/`) are
gitignored; a summary of each clean run is committed under
`docs/test-reports/`.

---

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```
