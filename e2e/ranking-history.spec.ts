import type { Page } from '@playwright/test';
import { expect, setScenario, startMatch, test } from './fixtures';
import { SEED_RECORDS } from '../src/mocks/fixtures/seedRecords';

/** The mock db's storage key — hydrated at boot (mocks/db.ts). */
const RECORDS_KEY = 'pirate-battle/matches@1';
/** The pending-submission queue's storage key (api/pendingSubmissions.ts). */
const PENDING_KEY = 'pirate-battle/pending-submissions@1';

interface QueuedAttempt {
  attempts: number;
}

/** Re-boots the app at `query` on the fixture's already-clean storage. */
async function boot(page: Page, query: string): Promise<void> {
  await page.goto(`/?${query}`);
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible({ timeout: 15_000 });
}

/** Persists the given matches before boot — the mock db hydrates from storage. */
async function seedDb(page: Page, records: readonly unknown[]): Promise<void> {
  await page.evaluate(
    ({ key, json }) => localStorage.setItem(key, json),
    { key: RECORDS_KEY, json: JSON.stringify(records) },
  );
}

/**
 * `count` reproducible records for the default config (120 s, spawn every
 * 3 s) — the ranking compares them all, and distinct scores keep the rank
 * of each record equal to its position in this order.
 */
function defaultRecords(count: number): readonly unknown[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    playerId: '11111111-1111-4111-8111-111111111111',
    playerName: `Pilot ${i}`,
    playedAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
    score: count - i,
    durationSeconds: 60,
    endReason: 'time',
    config: { sessionTimeSec: 120, spawnIntervalSec: 3 },
  }));
}

/** Ends the match through the real damage rule (lethal hit). */
async function endByDeath(page: Page): Promise<{ status: string; endReason: string | null }> {
  return page.evaluate(() => {
    const hook = window.__game;
    if (hook === undefined) throw new Error('window.__game is not installed');
    hook.damagePlayer(999); // real damage rule; the next fixed step sees hp 0 and ends by death
    for (let i = 0; i < 20 && hook.getState().status === 'running'; i += 1) hook.advance(50);
    const state = hook.getState();
    return { status: state.status, endReason: state.endReason };
  });
}

/** The persisted submission queue — the transport's only observable trace. */
async function pendingQueue(page: Page): Promise<Record<string, QueuedAttempt>> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (raw === null) return {};
    return JSON.parse(raw) as Record<string, QueuedAttempt>;
  }, PENDING_KEY);
}

test('the boards show their loading state and then the loaded data', async ({ page }) => {
  await seedDb(page, SEED_RECORDS);
  await boot(page, 'test=1&seed=42&scenario=slow'); // 1500 ms per list — a visible loading window

  await expect(page.getByText('Loading ranking…')).toBeVisible();
  await page.getByRole('tab', { name: 'Match History' }).click();
  await expect(page.getByText('Loading match history…')).toBeVisible();

  await page.getByRole('tab', { name: 'Ranking' }).click();
  await expect(page.getByRole('table', { name: 'Ranking' }).locator('tbody tr')).toHaveCount(16, {
    timeout: 10_000,
  });
  await page.getByRole('tab', { name: 'Match History' }).click();
  await expect(page.getByText('No matches played yet.')).toBeVisible();
});

test('the boards show the empty state under the empty scenario', async ({ page }) => {
  await boot(page, 'test=1&seed=42&scenario=empty');
  await expect(page.getByText('No matches ranked yet.')).toBeVisible();
  await page.getByRole('tab', { name: 'Match History' }).click();
  await expect(page.getByText('No matches played yet.')).toBeVisible();
});

test('the ranking error state recovers through Retry', async ({ page }) => {
  await boot(page, 'test=1&seed=42&scenario=ranking-error');
  await expect(page.getByText('Could not load the ranking.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();

  // nothing refetches by itself — Retry is the way out of the error
  await setScenario(page, 'success');
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('Could not load the ranking.')).toBeHidden();
  await expect(page.getByText('No matches ranked yet.')).toBeVisible();
});

test('pagination walks to page 2 and back', async ({ page }) => {
  await seedDb(page, SEED_RECORDS);
  await boot(page, 'test=1&seed=42&scenario=many-pages'); // 16 records → page size 4 → 4 pages

  const pager = page.getByRole('navigation', { name: 'Pagination' });
  const ranking = page.getByRole('table', { name: 'Ranking' });
  const firstRank = ranking.locator('tbody tr').first().locator('td').first();

  await expect(pager).toContainText('Page 1 of 4');
  await expect(firstRank).toHaveText('1');

  await pager.getByRole('button', { name: 'Next' }).click();
  await expect(pager).toContainText('Page 2 of 4');
  await expect(firstRank).toHaveText('5'); // ranks keep counting across pages
  await expect(ranking.locator('tbody tr')).toHaveCount(4);

  await pager.getByRole('button', { name: 'Previous' }).click();
  await expect(pager).toContainText('Page 1 of 4');
  await expect(firstRank).toHaveText('1');
});

test('a finished match lands in both tabs', async ({ page }) => {
  await startMatch(page);
  const ended = await endByDeath(page);
  expect(ended.status).toBe('ended');
  expect(ended.endReason).toBe('death');

  await page.getByRole('button', { name: 'Main Menu' }).click();
  const ranking = page.getByRole('table', { name: 'Ranking' });
  await expect(ranking.locator('tbody tr')).toHaveCount(1);
  await expect(ranking.locator('tbody tr').first()).toContainText('(You)');

  await page.getByRole('tab', { name: 'Match History' }).click();
  const history = page.getByRole('table', { name: 'Match History' }).locator('tbody tr');
  await expect(history).toHaveCount(1);
  await expect(history.first()).toContainText('Defeated');
});

test('a rejected submission resumes after a reload', async ({ page }) => {
  await setScenario(page, 'submit-down-then-recover'); // the first three submits answer 500
  await startMatch(page);
  await endByDeath(page);

  // the failed send is queued, its first attempt recorded
  await expect
    .poll(
      async () => {
        const queue = await pendingQueue(page);
        return Object.values(queue).some((entry) => entry.attempts >= 1);
      },
      { timeout: 15_000 },
    )
    .toBe(true);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Main Menu' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Main Menu' }).click();

  // the boot flush restarts the walk: three more rejections (1 s, 2 s, 4 s
  // apart), then the record lands and the queue drains
  await page.getByRole('tab', { name: 'Match History' }).click();
  await expect(
    page.getByRole('table', { name: 'Match History' }).locator('tbody tr'),
  ).toHaveCount(1, { timeout: 30_000 });
  await expect
    .poll(async () => Object.keys(await pendingQueue(page)).length, { timeout: 30_000 })
    .toBe(0);
});

test('a timeout after the write resends without duplicating the record', async ({ page }) => {
  await setScenario(page, 'timeout-after-write'); // stored, but the answer never arrives
  await startMatch(page);
  await endByDeath(page);

  // 5 s until the axios timeout, 1 s of backoff — two full cycles mean the
  // same id reached the server at least twice
  await expect
    .poll(
      async () => {
        const queue = await pendingQueue(page);
        return Object.values(queue).some((entry) => entry.attempts >= 2);
      },
      { timeout: 30_000 },
    )
    .toBe(true);

  await page.getByRole('button', { name: 'Main Menu' }).click();
  await page.getByRole('tab', { name: 'Match History' }).click();
  await expect(page.getByRole('table', { name: 'Match History' }).locator('tbody tr')).toHaveCount(
    1,
    { timeout: 10_000 }, // one row: the resends were idempotent
  );
});

test('a late answer never overwrites the newer page', async ({ page }) => {
  // 45 records on the default config: every ranking page holds 20 of them,
  // before and after the scenario switch — the page size never changes
  await seedDb(page, defaultRecords(45));
  await boot(page, 'test=1&seed=42&scenario=success');

  const pager = page.getByRole('navigation', { name: 'Pagination' });
  const firstRank = page
    .getByRole('table', { name: 'Ranking' })
    .locator('tbody tr')
    .first()
    .locator('td')
    .first();
  await expect(pager).toContainText('Page 1 of 3');
  await expect(firstRank).toHaveText('1');

  await setScenario(page, 'out-of-order'); // the first ranking request now waits 2500 ms
  await pager.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('status')).toHaveText('Updating…'); // page 2 in flight
  await expect(pager).toContainText('Page 2 of 3');
  await expect(firstRank).toHaveText('1'); // the previous page stays on screen meanwhile

  await pager.getByRole('button', { name: 'Previous' }).click(); // supersede it with page 1
  await expect(pager).toContainText('Page 1 of 3');
  await expect(firstRank).toHaveText('1'); // the newer answer owns the screen

  await pager.getByRole('button', { name: 'Next' }).click();
  await expect(pager).toContainText('Page 2 of 3');
  // the slow original answer finally lands — in page 2's own cache entry
  await expect(firstRank).toHaveText('21', { timeout: 10_000 });

  await pager.getByRole('button', { name: 'Previous' }).click();
  await expect(firstRank).toHaveText('1'); // page 1 kept its own answer all along
});
