import type { Page } from '@playwright/test';
import { gameConfig } from '../src/config/gameConfig';
import { expect, advance, getState, press, quietOptions, startMatch, test } from './fixtures';

/**
 * Match lifecycle: how a session ends (clock or destruction), what the end
 * freezes, what Play Again rebuilds, how pausing behaves (button, hidden
 * page, explicit resume), what the result screen shows and survives — and
 * that abandoning to the menu writes no history record.
 *
 * The clock can only end a match if the player survives to it: an
 * unattended ship is destroyed around t≈22 s even with the slowest legal
 * options, so the time-limit test defends itself with real inputs only
 * (hold fire, keep the bow on the nearest enemy) — no extra game API.
 */

/** Wraps to (−π, π] — same job as the game's own normalizeAngle, kept local so the spec stays self-contained. */
const normalize = (angle: number): number =>
  ((((angle + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;

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

/** Ends the match through the real damage rule (lethal hit), capturing the end in-flight. */
async function endByDeath(page: Page): Promise<{ status: string; endReason: string | null; score: number }> {
  return page.evaluate(() => {
    const hook = window.__game;
    if (hook === undefined) throw new Error('window.__game is not installed');
    hook.damagePlayer(999); // real damage rule; the next fixed step sees hp 0 and ends by death
    for (let i = 0; i < 20 && hook.getState().status === 'running'; i += 1) hook.advance(50);
    const state = hook.getState();
    return { status: state.status, endReason: state.endReason, score: state.score };
  });
}

test('the session limit ends the match by time', async ({ page }) => {
  test.setTimeout(180_000); // 60 s of real full-viewport renders × two projects
  await quietOptions(page); // 60 s session, a spawn every 10 s — the slowest legal pacing
  await startMatch(page);

  // Survive with real inputs: Space held (auto-fire every 0.4 s) and the bow
  // swung onto the nearest enemy — two aimed hits drop any ship before it
  // reaches the player. Deterministic under the seeded match: the run ends
  // with the clock, hp 70, five kills.
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
      await setTurn(null);
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
  expect(ended?.timeLeftSec).toBe(0);
});

test('a destroyed ship ends the match by death', async ({ page }) => {
  await startMatch(page);
  const ended = await endByDeath(page);
  expect(ended.status).toBe('ended');
  expect(ended.endReason).toBe('death');
});

test('once ended, advancing changes nothing', async ({ page }) => {
  await startMatch(page);
  const { before, after } = await page.evaluate(() => {
    const hook = window.__game;
    if (hook === undefined) throw new Error('window.__game is not installed');
    hook.damagePlayer(999);
    for (let i = 0; i < 20 && hook.getState().status === 'running'; i += 1) hook.advance(50);
    const ended = hook.getState();
    hook.advance(5000);
    const frozen = hook.getState();
    const pick = (s: typeof ended) => ({
      status: s.status,
      endReason: s.endReason,
      timeLeftSec: s.timeLeftSec,
      score: s.score,
      x: s.player?.x,
      y: s.player?.y,
      enemies: s.enemies.length,
      projectiles: s.projectiles.length,
    });
    return { before: pick(ended), after: pick(frozen) };
  });
  expect(before.status).toBe('ended');
  expect(before.endReason).toBe('death');
  expect(after).toEqual(before);
});

test('Play Again starts a clean match', async ({ page }) => {
  await startMatch(page);
  const first = await getState(page);
  const spawnX = first.player?.x;
  const spawnY = first.player?.y;

  const ended = await endByDeath(page);
  expect(ended.status).toBe('ended');

  await page.getByRole('button', { name: 'Play Again' }).click();
  await expect(page.getByRole('group', { name: 'Match status' })).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(() => window.__game !== undefined);

  // read before any advance: a fresh session starts on the full clock
  const fresh = await getState(page);
  expect(fresh.status).toBe('running');
  expect(fresh.player?.hp).toBe(fresh.player?.maxHp ?? gameConfig.player.maxHp);
  expect(fresh.score).toBe(0);
  expect(fresh.timeLeftSec).toBe(gameConfig.match.sessionTimeSec);
  expect(fresh.enemies).toEqual([]);
  expect(fresh.projectiles).toEqual([]);
  expect(fresh.player?.x).toBe(spawnX);
  expect(fresh.player?.y).toBe(spawnY);
});

test('pausing freezes the clock; resuming is a click that accumulates nothing', async ({ page }) => {
  await startMatch(page);
  const start = await getState(page);
  const startX = start.player?.x;
  const startY = start.player?.y;

  // — the HUD pause button freezes the clock —
  await page.getByRole('button', { name: 'Pause' }).click();
  await advance(page, 50); // publish the new status
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
  let state = await getState(page);
  expect(state.status).toBe('paused');
  const frozenAt = state.timeLeftSec;

  // a held thrust key neither moves the ship nor resumes the match
  await page.keyboard.down('ArrowUp');
  await advance(page, 5000);
  state = await getState(page);
  expect(state.status).toBe('paused');
  expect(state.timeLeftSec).toBe(frozenAt);
  expect(state.player?.x).toBe(startX);
  expect(state.player?.y).toBe(startY);
  await page.keyboard.up('ArrowUp');

  // — resuming is an explicit click —
  await page.getByRole('button', { name: 'Resume' }).click();
  await advance(page, 50);
  state = await getState(page);
  expect(state.status).toBe('running');
  expect(state.timeLeftSec).toBeLessThan(frozenAt); // the clock runs again

  // — a hidden page pauses the match by itself — the handler reads
  // document.visibilityState, so the hidden state is reported the way the
  // browser would and the real event is dispatched
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await advance(page, 50);
  state = await getState(page);
  expect(state.status).toBe('paused');

  // — coming back never auto-resumes: only the click does —
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'visibilityState');
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await advance(page, 50);
  state = await getState(page);
  expect(state.status).toBe('paused');

  // — nothing from the paused period accumulates into combat —
  const pausedAt = { x: state.player?.x, y: state.player?.y };
  await page.keyboard.down('ArrowUp');
  await advance(page, 2000);
  state = await getState(page);
  expect(state.status).toBe('paused');
  expect(state.player?.x).toBe(pausedAt.x);
  expect(state.player?.y).toBe(pausedAt.y);
  await page.keyboard.up('ArrowUp');

  await page.getByRole('button', { name: 'Resume' }).click();
  await advance(page, 50);
  state = await getState(page);
  expect(state.status).toBe('running');
  expect(state.player?.x).toBe(pausedAt.x);
  expect(state.player?.y).toBe(pausedAt.y);
});

test('the result screen shows score, time and reason — and survives a reload', async ({ page }) => {
  await startMatch(page);
  // one kill, so the shown score is worth asserting
  await page.evaluate(() => window.__game?.placeEnemyInFront('shooter', 300));
  await press(page, 'Space', 120);
  await advance(page, 500);
  await press(page, 'Space', 120);
  await advance(page, 500);
  expect((await getState(page)).score).toBe(1);

  const ended = await endByDeath(page);
  expect(ended.status).toBe('ended');

  const row = (label: string) => page.locator(`dt:has-text("${label}") + dd`);
  await expect(page.getByRole('heading', { name: 'Result' })).toBeVisible();
  await expect(row('Score')).toHaveText('1');
  await expect(row('Time played')).toHaveText(/^\d{1,2}:\d{2}$/);
  await expect(row('End reason')).toHaveText('Ship destroyed');

  // the stored result reopens this screen on boot
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Result' })).toBeVisible({ timeout: 15_000 });
  await expect(row('Score')).toHaveText('1');
  await expect(row('Time played')).toHaveText(/^\d{1,2}:\d{2}$/);
  await expect(row('End reason')).toHaveText('Ship destroyed');
});

test('leaving a running match to the menu records nothing in the history', async ({ page }) => {
  await startMatch(page);
  await page.getByRole('button', { name: 'Pause' }).click();
  await advance(page, 50);
  await page.getByRole('button', { name: 'Main Menu' }).click();
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();

  // history records only exist when a finished match is submitted (the POST
  // handler inserts and persists); abandoning never reaches the end, so the
  // history storage is never written
  const stored = await page.evaluate(() => localStorage.getItem('pirate-battle/matches@1'));
  expect(stored).toBeNull();
});
