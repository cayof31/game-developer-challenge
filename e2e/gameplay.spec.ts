import type { Page } from '@playwright/test';
import { expect, advance, getState, press, quietOptions, startMatch, test } from './fixtures';
import { buildArena, solidWithinRadius } from '../src/game/arena/arena';
import { gameConfig } from '../src/config/gameConfig';
import { normalizeAngle } from '../src/game/math';
import { parseTiledMap } from '../src/game/map/tiled';
import type { Arena } from '../src/game/types';

const PLAYER = gameConfig.player;

/**
 * The hand-authored arena, parsed by the app's OWN pure code inside the
 * test process — the specs assert against the same collision rules the
 * simulation runs (islands are solid tile cells, not circles).
 */
async function loadArena(baseURL: string): Promise<Arena> {
  const response = await fetch(new URL('/assets/map/arena.tmj', baseURL));
  return buildArena(parseTiledMap(await response.json()));
}

interface RayHit {
  angle: number;
  dist: number;
  /** where the straight run ends: blocked by an island, or the world bound */
  kind: 'island' | 'border';
  x: number;
  y: number;
}

/**
 * Walks 72 straight rays from the spawn point and reports where each first
 * meets something: an island cell (never entered, by the very predicate
 * the game uses) or the arena limit. The shortest of each kind is a
 * guaranteed-clear maneuver for the tests below.
 */
function firstHits(arena: Arena): RayHit[] {
  const spawn = arena.playerSpawn;
  const maxDist = Math.hypot(arena.width, arena.height);
  const hits: RayHit[] = [];
  for (let i = 0; i < 72; i += 1) {
    const angle = (i / 72) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    for (let dist = 15; dist < maxDist; dist += 8) {
      const x = spawn.x + dx * dist;
      const y = spawn.y + dy * dist;
      const outOfBounds =
        x < PLAYER.radius ||
        x > arena.width - PLAYER.radius ||
        y < PLAYER.radius ||
        y > arena.height - PLAYER.radius;
      if (outOfBounds) {
        hits.push({ angle, dist, kind: 'border', x, y });
        break;
      }
      if (solidWithinRadius(arena, { x, y }, PLAYER.radius)) {
        hits.push({ angle, dist, kind: 'island', x, y });
        break;
      }
    }
  }
  return hits;
}

const nearest = (hits: RayHit[], kind: RayHit['kind']): RayHit =>
  hits
    .filter((hit) => hit.kind === kind)
    .reduce((best, hit) => (best.dist <= hit.dist ? best : hit));

/** Turns the ship (real keys, chunked on the deterministic clock) until it faces the target. */
async function turnTowards(page: Page, targetAngle: number): Promise<void> {
  for (let i = 0; i < 60; i += 1) {
    const player = (await getState(page)).player;
    expect(player).not.toBeNull();
    // turnRight increases the angle, turnLeft decreases it
    const error = normalizeAngle(targetAngle - player!.angle);
    if (Math.abs(error) < 0.05) return;
    const ms = Math.min(Math.abs(error) / PLAYER.rotationSpeed, 0.5) * 1000;
    await press(page, error > 0 ? 'ArrowRight' : 'ArrowLeft', ms);
  }
  throw new Error('the ship never faced the target angle');
}

test('a match starts: assets load and the state becomes running', async ({ page }) => {
  await startMatch(page);
  await expect(page.getByRole('group', { name: 'Match status' })).toBeVisible();
  await expect(page.locator('.match-screen__canvas canvas')).toBeVisible();

  const state = await getState(page);
  expect(state.status).toBe('running');
  expect(state.player).not.toBeNull();
  expect(state.player!.hp).toBe(state.player!.maxHp);
  expect(state.score).toBe(0);
  expect(state.enemies).toHaveLength(0);
  // a clean slate runs the out-of-the-box options, clock untouched
  expect(state.timeLeftSec).toBe(gameConfig.match.sessionTimeSec);
});

test('holding thrust and turn changes position and angle within 1s', async ({ page }) => {
  await startMatch(page);
  const before = (await getState(page)).player!;

  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('ArrowLeft');
  try {
    await advance(page, 1000);
  } finally {
    await page.keyboard.up('ArrowUp');
    await page.keyboard.up('ArrowLeft');
  }

  const after = (await getState(page)).player!;
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(10);
  expect(Math.abs(normalizeAngle(after.angle - before.angle))).toBeGreaterThan(0.5);
});

test('thrusting into the border pins the ship at the arena limit', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(180_000); // thousands of real renders; wall time scales with the machine
  await quietOptions(page);
  const arena = await loadArena(baseURL!);
  const border = nearest(firstHits(arena), 'border');
  // which world edge the chosen ray is heading for (clampToArena's limit)
  const axis = Math.abs(Math.cos(border.angle)) > Math.abs(Math.sin(border.angle)) ? 'x' : 'y';
  const bound =
    axis === 'x'
      ? border.x < arena.width / 2
        ? PLAYER.radius
        : arena.width - PLAYER.radius
      : border.y < arena.height / 2
        ? PLAYER.radius
        : arena.height - PLAYER.radius;

  await startMatch(page);
  await turnTowards(page, border.angle);

  // thrust in chunks until the clamp pins the ship on that limit
  let pinned = (await getState(page)).player!;
  for (let i = 0; i < 60 && Math.abs(pinned[axis] - bound) > 1; i += 1) {
    await press(page, 'ArrowUp', 400);
    pinned = (await getState(page)).player!;
  }
  expect(Math.abs(pinned[axis] - bound)).toBeLessThan(1);
  // never outside the world, on either axis
  expect(pinned.x).toBeGreaterThanOrEqual(PLAYER.radius - 0.01);
  expect(pinned.x).toBeLessThanOrEqual(arena.width - PLAYER.radius + 0.01);
  expect(pinned.y).toBeGreaterThanOrEqual(PLAYER.radius - 0.01);
  expect(pinned.y).toBeLessThanOrEqual(arena.height - PLAYER.radius + 0.01);

  // pushing further never passes the limit
  await press(page, 'ArrowUp', 2000);
  const after = (await getState(page)).player!;
  expect(Math.abs(after[axis] - bound)).toBeLessThan(1);
});

test('the ship never enters an island cell', async ({ page, baseURL }) => {
  test.setTimeout(180_000); // thousands of real renders; wall time scales with the machine
  await quietOptions(page);
  const arena = await loadArena(baseURL!);
  const island = nearest(firstHits(arena), 'island');

  await startMatch(page);
  await turnTowards(page, island.angle);

  let closest = Infinity;
  let last = Infinity;
  for (let i = 0; i < 40; i += 1) {
    await press(page, 'ArrowUp', 300);
    const player = (await getState(page)).player!;
    // the very contract: the ship's circle never overlaps a solid cell
    expect(solidWithinRadius(arena, player, PLAYER.radius)).toBe(false);
    const dist = Math.hypot(player.x - island.x, player.y - island.y);
    closest = Math.min(closest, dist);
    if (Math.abs(dist - last) < 0.3 || dist < PLAYER.radius + 2) break; // blocked
    last = dist;
  }
  // not vacuous: the ship really reached the island's edge and stopped there
  expect(closest).toBeLessThanOrEqual(PLAYER.radius + 10);
});
