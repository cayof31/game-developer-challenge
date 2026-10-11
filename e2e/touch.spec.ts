import type { Page } from '@playwright/test';
import { advance, expect, getState, quietOptions, startMatch, test } from './fixtures';

/**
 * Dispatches real pointer events on the touch pad's buttons. Playwright's
 * touchscreen API handles one contact at a time, so multitouch is two
 * pointer events fired on the two elements — and to make them truly
 * simultaneous, all the labels of one call go down in a single task.
 */
async function touch(
  page: Page,
  type: 'pointerdown' | 'pointerup',
  labels: readonly string[],
): Promise<void> {
  await page.evaluate(
    ({ type, labels }) => {
      for (const label of labels) {
        const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
        if (button === null) throw new Error(`no touch button: ${label}`);
        button.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1 }));
      }
    },
    { type, labels: [...labels] },
  );
}

// The pad is pointer-only and the desktop project has no touch context
test.describe('touch pad (mobile only)', () => {
  test.skip(({ isMobile }) => !isMobile, 'the touch pad belongs to the mobile project');

  test('two fingers at once: thrust moves and the front gun fires; releasing stops the ship', async ({
    page,
  }) => {
    await quietOptions(page); // no spawn interferes with the scripted hold
    await startMatch(page);
    const before = (await getState(page)).player!;

    // both buttons go down in one task — two contacts, one frame
    await touch(page, 'pointerdown', ['Thrust', 'Fire forward']);
    await advance(page, 1_000);

    const held = (await getState(page)).player!;
    // thrust: speed 240 px/s applied along the facing, no inertia
    expect(Math.hypot(held.x - before.x, held.y - before.y)).toBeGreaterThan(100);
    // the front gun fires on the press and re-fires every 0.4 s while held
    expect((await getState(page)).projectiles.length).toBeGreaterThan(0);

    // releasing thrust stops the movement; the fire finger stays down
    await touch(page, 'pointerup', ['Thrust']);
    await advance(page, 500);
    const released = (await getState(page)).player!;
    expect(released.x).toBe(held.x);
    expect(released.y).toBe(held.y);
  });
});
