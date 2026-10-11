import { expect, test as base } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { GameTestHooks, GameStateView } from '../../src/test-support/testHooks';
import type { ScenarioName } from '../../src/mocks/scenarios';

export { expect };

// The window.__game hook, typed here so the e2e layer never imports src
// at runtime (type-only) and Playwright's transpile stays standalone.
declare global {
  interface Window {
    __game?: GameTestHooks;
  }
}

/** Versioned storage key of the mock's active scenario (mocks/scenarios.ts). */
const SCENARIO_STORAGE_KEY = 'pirate-battle/scenario@1';

/**
 * The E2E base: every test starts from a clean slate — localStorage
 * emptied, the app opened at `/?test=1&seed=42&scenario=success` (game
 * hook on, deterministic mock latency, happy-path backend) and the menu
 * visible. No fixed sleeps anywhere: waits are expect/locator based, and
 * simulation state is polled through `getState()`.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    // localStorage is scoped to the origin — reach it before clearing
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/?test=1&seed=42&scenario=success');
    // real boot on a loaded machine: locator wait with headroom, never a sleep
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible({ timeout: 15_000 });
    // eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright's fixture callback (`use`), not React Hooks
    await use(page);
  },
});

/** Read-only view of the live simulation (what window.__game reports). */
export type GameState = GameStateView;

/** The menu's Play button → a running match, seeded for determinism. */
export async function startMatch(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Play' }).click();
  // the HUD only renders once the session is ready and the hook installed;
  // loading the map + textures is real work — headroom for a loaded machine
  await expect(page.getByRole('group', { name: 'Match status' })).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(() => window.__game !== undefined);
  // the constructor draws no randomness, so this replays the whole match
  await page.evaluate(() => window.__game?.setSeed(42));
}

/** Advances the real pipeline (rules, inputs, render) by `ms` virtual milliseconds. */
export async function advance(page: Page, ms: number): Promise<void> {
  await page.evaluate((value) => window.__game?.advance(value), ms);
}

/** The live simulation state — poll it with expect.poll, never with sleeps. */
export async function getState(page: Page): Promise<GameState> {
  return page.evaluate(() => {
    const hook = window.__game;
    if (hook === undefined) throw new Error('window.__game is not installed');
    return hook.getState();
  });
}

/** Holds a real key for `ms` of simulation time (down → advance → up). */
export async function press(page: Page, key: string, ms: number): Promise<void> {
  await page.keyboard.down(key);
  try {
    await advance(page, ms);
  } finally {
    await page.keyboard.up(key);
  }
}

/**
 * Seeds the slowest legal options (60 s match, a spawn every 10 s) before
 * startMatch, so no random spawn interferes with a scripted maneuver.
 */
export async function quietOptions(page: Page): Promise<void> {
  await page.evaluate(() =>
    localStorage.setItem(
      'pirate-battle/options@1',
      JSON.stringify({ sessionTimeSec: 60, spawnIntervalSec: 10 }),
    ),
  );
}

/**
 * Switches the mock backend to another scenario the same way the app
 * does: persist it and drop the `?scenario=` override, so the very next
 * API request runs under the new configuration (handlers re-read it).
 */
export async function setScenario(page: Page, name: ScenarioName): Promise<void> {
  await page.evaluate(
    ({ key, scenario }) => {
      localStorage.setItem(key, JSON.stringify(scenario));
      const url = new URL(window.location.href);
      url.searchParams.delete('scenario');
      history.replaceState(null, '', url.toString());
    },
    { key: SCENARIO_STORAGE_KEY, scenario: name },
  );
}
