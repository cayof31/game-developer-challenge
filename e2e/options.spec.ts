import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/** Versioned storage key of the saved options (features/options/optionsStorage.ts). */
const OPTIONS_KEY = 'pirate-battle/options@1';
const SESSION_ERROR = 'Enter a whole number of seconds between 60 and 180.';
const SPAWN_ERROR = 'Enter a number of seconds between 0.5 and 10.';

async function openOptions(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Options' }).click();
  await expect(page.getByRole('heading', { name: 'Options' })).toBeVisible();
}

test('invalid values show an error and do not save', async ({ page }) => {
  await openOptions(page);
  const stored = () => page.evaluate((key) => localStorage.getItem(key), OPTIONS_KEY);
  const before = await stored();

  const sessionField = page.getByLabel('Game session time');
  const spawnField = page.getByLabel('Enemy spawn time');
  const save = page.getByRole('button', { name: 'Save' });

  // below the minimum
  await sessionField.fill('59');
  await expect(page.getByText(SESSION_ERROR, { exact: true })).toBeVisible();
  await expect(sessionField).toHaveAttribute('aria-invalid', 'true');
  await expect(save).toBeDisabled();

  // above the maximum
  await sessionField.fill('181');
  await expect(page.getByText(SESSION_ERROR, { exact: true })).toBeVisible();
  await expect(save).toBeDisabled();

  // zero spawns: the session field is valid again, only spawn is wrong
  await sessionField.fill('120');
  await spawnField.fill('0');
  await expect(page.getByText(SPAWN_ERROR, { exact: true })).toBeVisible();
  await expect(spawnField).toHaveAttribute('aria-invalid', 'true');
  await expect(save).toBeDisabled();

  // nothing was persisted through any of it
  expect(await stored()).toBe(before);
});

test('a valid value saves and persists after page.reload()', async ({ page }) => {
  await openOptions(page);
  await page.getByLabel('Game session time').fill('90');
  await page.getByLabel('Enemy spawn time').fill('5');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Options saved.', { exact: true })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), OPTIONS_KEY)).toBe(
    JSON.stringify({ sessionTimeSec: 90, spawnIntervalSec: 5 }),
  );

  // a fresh load of the app reads the same values back
  await page.reload();
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await openOptions(page);
  await expect(page.getByLabel('Game session time')).toHaveValue('90');
  await expect(page.getByLabel('Enemy spawn time')).toHaveValue('5');
});
