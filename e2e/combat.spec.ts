import type { Page } from '@playwright/test';
import { expect, advance, getState, press, quietOptions, startMatch, test } from './fixtures';
import type { GameState } from './fixtures';
import { gameConfig } from '../src/config/gameConfig';

/** All live projectiles (owner tells player fire from enemy fire). */
const projectilesOf = (state: GameState): GameState['projectiles'] => state.projectiles;

/** One press — well inside the front cooldown — launches exactly one shot. */
async function fireFront(page: Page): Promise<void> {
  await press(page, 'Space', 120);
}

test('front fire launches one projectile, the broadside launches three', async ({ page }) => {
  await startMatch(page);
  expect(projectilesOf(await getState(page))).toHaveLength(0);

  await fireFront(page);
  expect(projectilesOf(await getState(page))).toHaveLength(1);

  // let the first shot expire (lifeSec) so the counts never overlap
  await advance(page, gameConfig.projectile.player.lifeSec * 1000 + 100);
  expect(projectilesOf(await getState(page))).toHaveLength(0);

  await press(page, 'KeyQ', 120); // left broadside
  expect(projectilesOf(await getState(page))).toHaveLength(gameConfig.player.sideShotCount);
});

test('two shots inside the cooldown window produce a single projectile', async ({ page }) => {
  await startMatch(page);

  await fireFront(page);
  expect(projectilesOf(await getState(page))).toHaveLength(1);

  // ≈0.22 s elapsed: still inside the 0.4 s front cooldown
  await advance(page, 100);
  await fireFront(page);
  expect(projectilesOf(await getState(page))).toHaveLength(1);
});

test('killing a placed enemy scores +1, exactly once', async ({ page }) => {
  test.setTimeout(120_000); // the heaviest combat test: full-viewport renders for every sim step
  await quietOptions(page);
  await startMatch(page);

  // a shooter 200 px dead ahead — open water for this whole stretch of the map
  await page.evaluate(() => window.__game!.placeEnemyInFront('shooter', 200));
  expect((await getState(page)).enemies).toHaveLength(1);
  expect((await getState(page)).score).toBe(0);

  // 25 damage per shot vs 40 hp → two hits; each flight is ≈0.37 s
  for (let shot = 0; shot < 4 && (await getState(page)).enemies.length > 0; shot += 1) {
    await fireFront(page);
    await advance(page, 500); // the hit lands inside this window
  }

  const afterKill = await getState(page);
  expect(afterKill.enemies).toHaveLength(0); // shot down
  expect(afterKill.score).toBe(1);

  // and it stays: one kill, one point — never twice
  await advance(page, 2000);
  expect((await getState(page)).score).toBe(1);
});

test('a chaser exploding on the player costs hp and no score', async ({ page }) => {
  await quietOptions(page);
  await startMatch(page);
  const before = await getState(page);
  expect(before.player).not.toBeNull();

  // it charges head-on from 150 px (200 px/s → contact in ≈0.5 s)
  await page.evaluate(() => window.__game!.placeEnemyInFront('chaser', 150));

  let hp = before.player!.hp;
  for (let i = 0; i < 30 && hp === before.player!.hp; i += 1) {
    await advance(page, 200);
    hp = (await getState(page)).player!.hp;
  }

  const after = await getState(page);
  expect(hp).toBeLessThan(before.player!.hp); // vida cai (100 → 75)
  expect(after.score).toBe(before.score); // pontuação continua igual
  expect(after.enemies).toHaveLength(0); // explodiu no impacto
});

test('a shooter inside its attack range fires enemy projectiles', async ({ page }) => {
  await quietOptions(page);
  await startMatch(page);

  // 300 px ahead, inside the 420 px attack range: it stops and opens fire
  await page.evaluate(() => window.__game!.placeEnemyInFront('shooter', 300));
  await advance(page, 300);

  const enemyShots = projectilesOf(await getState(page)).filter(
    (projectile) => projectile.owner === 'enemy',
  );
  expect(enemyShots.length).toBeGreaterThan(0);
});

test('one spawn interval brings an enemy onto the field', async ({ page }) => {
  await startMatch(page); // out-of-the-box options: a spawn every 3 s
  expect((await getState(page)).enemies).toHaveLength(0);

  // the spawn fires on the first tick at/after the interval (one frame of margin)
  await advance(page, gameConfig.match.spawnIntervalSec * 1000 + 100);
  expect((await getState(page)).enemies.length).toBeGreaterThan(0);
});
