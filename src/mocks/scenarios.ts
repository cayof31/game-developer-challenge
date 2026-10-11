import { mulberry32 } from '../game/random';

/**
 * Scenario presets for the mock backend — the whole "server" misbehaves
 * on demand. The handlers read the ACTIVE config on every request, so a
 * switch takes effect immediately.
 *
 * The active scenario is persisted in localStorage; a `?scenario=name`
 * query parameter overrides and re-persists it — that is the Playwright
 * door. `?seed=number` re-seeds the mock's RNG, which drives the
 * randomized latency: same seed, same sequence. Fixed latency is just
 * `min === max`.
 */

/** How POST /api/matches behaves, when it misbehaves. */
export type SubmitFailureMode =
  | 'none'
  | '4xx'
  | '500'
  | 'timeout'
  /** the record is stored, but the answer never arrives */
  | 'timeout-after-write'
  /** the connection dies before any answer */
  | 'network';

export interface ScenarioConfig {
  /** per-request latency range in ms (fixed when min === max) */
  latency: { min: number; max: number };
  /** GET /api/ranking answers 500 */
  failRanking: boolean;
  /** GET /api/history answers 500 */
  failHistory: boolean;
  /** how the submit endpoint behaves */
  failSubmit: SubmitFailureMode;
  /** down-then-recover: submissions failing before it starts accepting */
  submitFailures: number;
  /** first request per endpoint much slower than the following ones */
  outOfOrder: boolean;
  /** the lists answer empty pages */
  emptyLists: boolean;
  /** approximate number of pages the lists report; null keeps the default */
  pages: number | null;
}

export type ScenarioName =
  | 'success'
  | 'empty'
  | 'many-pages'
  | 'slow'
  | 'variable-latency'
  | 'out-of-order'
  | 'ranking-error'
  | 'history-error'
  | 'http-4xx'
  | 'http-5xx'
  | 'network-error'
  | 'timeout'
  | 'timeout-after-write'
  | 'submit-down-then-recover';

const base: ScenarioConfig = {
  latency: { min: 0, max: 0 },
  failRanking: false,
  failHistory: false,
  failSubmit: 'none',
  submitFailures: 0,
  outOfOrder: false,
  emptyLists: false,
  pages: null,
};

/** The named scenarios: presets of ScenarioConfig. */
export const SCENARIOS: Record<ScenarioName, ScenarioConfig> = {
  success: base,
  empty: { ...base, emptyLists: true },
  'many-pages': { ...base, pages: 5 },
  slow: { ...base, latency: { min: 1_500, max: 1_500 } },
  'variable-latency': { ...base, latency: { min: 100, max: 1_200 } },
  'out-of-order': { ...base, latency: { min: 50, max: 150 }, outOfOrder: true },
  'ranking-error': { ...base, failRanking: true },
  'history-error': { ...base, failHistory: true },
  'http-4xx': { ...base, failSubmit: '4xx' },
  'http-5xx': { ...base, failSubmit: '500' },
  'network-error': { ...base, failSubmit: 'network' },
  timeout: { ...base, failSubmit: 'timeout' },
  'timeout-after-write': { ...base, failSubmit: 'timeout-after-write' },
  'submit-down-then-recover': { ...base, failSubmit: '500', submitFailures: 3 },
};

/** Versioned storage key — bump `@N` whenever the format changes. */
const STORAGE_KEY = 'pirate-battle/scenario@1';
const DEFAULT_SCENARIO: ScenarioName = 'success';
const DEFAULT_SEED = 42;
/** Under out-of-order: the first request per endpoint waits this long. */
const OUT_OF_ORDER_FIRST_MS = 2_500;

function isScenarioName(value: unknown): value is ScenarioName {
  return typeof value === 'string' && value in SCENARIOS;
}

function queryParam(name: string): string | null {
  if (typeof location === 'undefined') return null; // Node checks
  return new URLSearchParams(location.search).get(name);
}

function queryScenario(): ScenarioName | null {
  const value = queryParam('scenario');
  return isScenarioName(value) ? value : null;
}

function querySeed(): number | null {
  const value = queryParam('seed');
  if (value === null) return null;
  const seed = Number(value);
  return Number.isInteger(seed) ? seed : null;
}

function loadStored(): ScenarioName | null {
  try {
    const value: unknown = JSON.parse(globalThis.localStorage.getItem(STORAGE_KEY) ?? 'null');
    return isScenarioName(value) ? value : null;
  } catch {
    return null;
  }
}

function persist(name: ScenarioName): void {
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(name));
  } catch {
    // storage unavailable — the session keeps the scenario in memory
  }
}

let appliedName: ScenarioName | null = null;
let rng = mulberry32(DEFAULT_SEED);
/** submit-down-then-recover's countdown; re-armed on a scenario switch. */
let failuresLeft: number | null = null;
/** per-endpoint request counts, for out-of-order's "first request". */
const requests = new Map<string, number>();

/** A scenario switch restarts every deterministic sequence. */
function resetSequences(seed: number): void {
  rng = mulberry32(seed);
  failuresLeft = null;
  requests.clear();
}

/** Resolves the active name (URL → storage → default), keeping the sequences in sync. */
function resolveName(): ScenarioName {
  const fromUrl = queryScenario();
  const name = fromUrl ?? loadStored() ?? DEFAULT_SCENARIO;
  // chosen via URL: keep it for reloads without the parameter
  if (fromUrl !== null) persist(name);
  if (name !== appliedName) {
    appliedName = name;
    resetSequences(querySeed() ?? DEFAULT_SEED);
  }
  return name;
}

/** The active scenario's name — what the picker shows as selected. */
export function getScenarioName(): ScenarioName {
  return resolveName();
}

/** The active scenario config — read by the handlers on every request. */
export function getScenario(): ScenarioConfig {
  return SCENARIOS[resolveName()];
}

/** Removes `?scenario=` from the address bar, keeping the other params. */
function dropScenarioParam(): void {
  if (typeof location === 'undefined') return; // Node checks
  const url = new URL(location.href);
  if (!url.searchParams.has('scenario')) return;
  url.searchParams.delete('scenario');
  history.replaceState(null, '', url.toString());
}

/**
 * Chooses the scenario like `?scenario=` would: persists it and drops
 * the URL override, so the query string stops beating the picker.
 */
export function setScenario(name: ScenarioName): void {
  persist(name);
  dropScenarioParam();
  appliedName = name;
  resetSequences(querySeed() ?? DEFAULT_SEED);
}

/**
 * The latency for the next request of `endpoint`, drawn from the seeded
 * RNG. Under out-of-order the FIRST request per endpoint waits far
 * longer than the following ones, so the old response arrives after the
 * new one.
 */
export function nextLatencyMs(endpoint: string): number {
  const cfg = getScenario();
  let min = cfg.latency.min;
  let max = cfg.latency.max;
  if (cfg.outOfOrder) {
    const seen = requests.get(endpoint) ?? 0;
    requests.set(endpoint, seen + 1);
    if (seen === 0) {
      min = OUT_OF_ORDER_FIRST_MS;
      max = OUT_OF_ORDER_FIRST_MS;
    }
  }
  return Math.floor(min + rng() * (max - min + 1));
}

/** What POST /api/matches should do on THIS request. */
export function submitOutcome(): SubmitFailureMode {
  const cfg = getScenario();
  if (cfg.failSubmit === 'none') return 'none';
  if (cfg.submitFailures > 0) {
    // down-then-recover: the first N submissions fail, then it accepts
    if (failuresLeft === null) failuresLeft = cfg.submitFailures;
    if (failuresLeft <= 0) return 'none';
    failuresLeft -= 1;
    return cfg.failSubmit;
  }
  return cfg.failSubmit;
}
