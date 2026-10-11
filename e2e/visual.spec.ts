import type { Page } from '@playwright/test';
import { gameConfig } from '../src/config/gameConfig';
import { advance, expect, getState, quietOptions, startMatch, test } from './fixtures';
import { SEED_RECORDS } from '../src/mocks/fixtures/seedRecords';

/**
 * Visual baselines: three frozen frames — the main menu, the arena at rest
 * and the result screen — one snapshot set per project under
 * e2e/visual.spec.ts-snapshots/, regenerated with `pnpm test:e2e:update`.
 *
 * Everything in frame is deterministic: seed 42, scenario=success and the
 * manual test clock — only advance() moves time, so Pixi draws the same
 * pixels for the same inputs. `animations: 'disabled'` comes from the
 * global expect.toHaveScreenshot config in playwright.config.ts.
 */

/** Wraps to (−π, π] — same job as the game's own normalizeAngle, kept local so the spec stays self-contained. */
const normalize = (angle: number): number =>
  ((((angle + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;

/** The mock db's storage key — hydrated at boot (mocks/db.ts). */
const RECORDS_KEY = 'pirate-battle/matches@1';

/**
 * What varies with the wall clock or the device: the history's "When"
 * column renders a formatted date — it lives in the tab panel that is
 * hidden in every frame here, so today the mask paints nothing; it stays
 * in place so a layout change can never turn a date into a flake. No
 * screen displays ids.
 */
function volatileMasks(page: Page) {
  return [page.getByRole('table', { name: 'Match History' }).locator('tbody tr td').first()];
}

test('main menu', async ({ page }) => {
  // seeded rows give the ranking real content; scenario=success keeps the
  // mock healthy, so the board captures its loaded state — never the spinner
  await page.evaluate(
    ({ key, json }) => localStorage.setItem(key, json),
    { key: RECORDS_KEY, json: JSON.stringify(SEED_RECORDS) },
  );
  await page.goto('/?test=1&seed=42&scenario=success');
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('table', { name: 'Ranking' }).locator('tbody tr')).toHaveCount(16, {
    timeout: 10_000,
  });

  await expect(page).toHaveScreenshot('menu.png', { mask: volatileMasks(page) });
});

test('arena at rest', async ({ page }) => {
  // spawn interval 10 s: no enemy can exist half a second into the match
  await quietOptions(page);
  await startMatch(page);
  await advance(page, 500); // no input held: the ship rests where it spawned, effects idle

  await expect(page).toHaveScreenshot('arena.png', { mask: volatileMasks(page) });
});

/** One read of the live simulation, plus what the defense needs to aim. */
interface Sample {
  status: 'running' | 'paused' | 'ended';
  endReason: 'time' | 'death' | null;
  timeLeftSec: number;
  score: number;
  hp: number;
  /** desired angle minus the ship's angle (raw; normalize on this side) — null with no enemy */
  aim: number | null;
  /** distance to the nearest enemy — null with no enemy */
  dist: number | null;
}

/**
 * Advances `ms` and reads the state in the SAME evaluate: the moment the
 * match ends the app switches to the result screen, which tears the session
 * (and `window.__game`) down — a crossing advance must capture its own
 * result before React flushes that navigation.
 */
async function advanceAndSample(page: Page, ms: number): Promise<Sample> {
  return page.evaluate((value) => {
    const hook = window.__game;
    if (hook === undefined) throw new Error('window.__game is not installed');
    hook.advance(value);
    const state = hook.getState();
    const player = state.player;
    let aim: number | null = null;
    let dist: number | null = null;
    if (player !== null) {
      let best = -1;
      let bestDist = Infinity;
      for (let i = 0; i < state.enemies.length; i += 1) {
        const d = Math.hypot(state.enemies[i].x - player.x, state.enemies[i].y - player.y);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      if (best >= 0) {
        dist = bestDist;
        aim = Math.atan2(state.enemies[best].y - player.y, state.enemies[best].x - player.x) - player.angle;
      }
    }
    return {
      status: state.status,
      endReason: state.endReason,
      timeLeftSec: state.timeLeftSec,
      score: state.score,
      hp: player === null ? 0 : player.hp,
      aim,
      dist,
    };
  }, ms);
}

test('result screen after the clock runs the match out', async ({ page }) => {
  test.setTimeout(180_000); // 60 s of real full-viewport renders × two projects
  await quietOptions(page);
  await startMatch(page);

  // Same seeded defense as the match-flow clock test: hold fire (auto-fire
  // every 0.4 s) and swing the bow onto the nearest enemy — two aimed hits
  // drop any ship before it reaches the player. Real inputs only.
  await page.keyboard.down('Space');
  let turn: 'ArrowLeft' | 'ArrowRight' | null = null;
  const setTurn = async (want: typeof turn): Promise<void> => {
    if (turn === want) return;
    if (turn !== null) await page.keyboard.up(turn);
    turn = want;
    if (want !== null) await page.keyboard.down(want);
  };

  const view = await getState(page);
  let sample: Sample = {
    status: view.status,
    endReason: view.endReason,
    timeLeftSec: view.timeLeftSec,
    score: view.score,
    hp: view.player === null ? 0 : view.player.hp,
    aim: null,
    dist: null,
  };
  let ended: Sample | null = null;
  for (let i = 0; i < 1200 && sample.status === 'running'; i += 1) {
    const err = sample.aim === null ? null : normalize(sample.aim);
    if (err !== null && sample.dist !== null && sample.dist < 700 && Math.abs(err) > 0.06) {
      // in firing range: turn exactly onto the target (rotationSpeed), then
      // keep ticking short so the aim tracks the ship
      await setTurn(err > 0 ? 'ArrowRight' : 'ArrowLeft');
      const ms = Math.min((Math.abs(err) / gameConfig.player.rotationSpeed) * 1000, 400);
      const turning = await advanceAndSample(page, ms);
      if (turning.status !== 'running') {
        ended = turning;
        break;
      }
      const tracking = await advanceAndSample(page, 150);
      if (tracking.status !== 'running') {
        ended = tracking;
        break;
      }
      sample = tracking;
      continue;
    }
    await setTurn(null);
    const roaming = await advanceAndSample(page, sample.dist !== null && sample.dist < 700 ? 150 : 1000);
    if (roaming.status !== 'running') {
      ended = roaming;
      break;
    }
    sample = roaming;
  }
  await setTurn(null);
  await page.keyboard.up('Space');

  expect(ended, 'the clock must run the match out').not.toBeNull();
  expect(ended?.status).toBe('ended');
  expect(ended?.endReason).toBe('time');

  // the record lands under scenario=success — pin the registration row to
  // its settled "Saved" before the capture, never the in-flight "Saving…"
  await expect(page.getByText('Saved')).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveScreenshot('result.png', { mask: volatileMasks(page) });
});
