/* Throwaway browser integration check for the Tiled map (deleted after Task 4).
 *
 * Drive: turn the ship toward the nearest island to the spawn, thrust until
 * the collision stops it, then assert from pixels only — the camera is
 * derived from the island's screen edges (world edges are known from the
 * map data), because the bar itself stays screen-centered by design. */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const HALF_X = 960;
const HALF_Y = 540;

let failures = 0;
const step = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
  if (!ok) failures += 1;
};

const py = (mode, ...args) => {
  const out = execFileSync('python3', ['map-analyze.py', mode, ...args], { encoding: 'utf8' });
  return JSON.parse(out.trim().split('\n').filter(Boolean).pop());
};

// --- geometry from the real map -------------------------------------------------
const map = JSON.parse(readFileSync('public/assets/map/arena.tmj', 'utf8'));
const TW = map.tilewidth;
const cols = map.width;
const spawn = { x: (map.width * TW) / 2, y: (map.height * TW) / 2 };
let target = null;
for (let i = 0; i < map.layers[2].data.length; i += 1) {
  if ((map.layers[2].data[i] & 0x0fffffff) === 0) continue;
  const c = i % cols;
  const r = Math.floor(i / cols);
  const d = Math.hypot(c * TW + TW / 2 - spawn.x, r * TW + TW / 2 - spawn.y);
  if (!target || d < target.d) target = { c, r, d };
}
const aim = { x: target.c * TW + TW / 2 + 20, y: target.r * TW + TW / 2 };
const theta = Math.atan2(aim.y - spawn.y, aim.x - spawn.x); // ship angle starts at 0 = east

const dec = [];
for (let i = 0; i < map.layers[3].data.length; i += 1) {
  const v = map.layers[3].data[i];
  const g = v & 0x0fffffff;
  if (g >= 97 && g <= 102) dec.push({ c: i % cols, r: Math.floor(i / cols), g, flags: v & 0xe0000000 });
}
const cellDist = (cell) => Math.hypot(cell.c - target.c, cell.r - target.r);
const crewCell = dec.filter((cell) => cell.flags === 0).sort((a, b) => cellDist(a) - cellDist(b))[0];
const flipCells = dec.filter((cell) => cell.flags !== 0 && cellDist(cell) <= 6);
const worldRect = (cell) => [cell.c * TW, cell.r * TW, cell.c * TW + TW, cell.r * TW + TW];

const ISLAND_TOP = ['--xband', '700,940', '--yband', '200,720', '--exclude', '584,696,304,416'];

// --- context 1: load, map-0, drive, map-1, pause -------------------------------
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(String(error)));
let tmjFetches = 0;
await page.route('**/assets/map/arena.tmj', (route) => {
  tmjFetches += 1;
  return route.continue();
});
await page.goto('http://localhost:5199/map.html');
await page.click('text=Play');
await page.locator('.hud').waitFor();

const rect = await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  const r = canvas.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
});
writeFileSync('camera-meta.json', JSON.stringify(rect));
const scale = rect.width / (HALF_X * 2);
step('canvas covers the 1280x720 viewport (16:9, no letterbox bars)',
  rect.x === 0 && rect.y === 0 && rect.width === 1280 && rect.height === 720, JSON.stringify(rect));

const clock = await page.locator('.hud__value').nth(1).textContent();
step("clock shows '2:00' (default session time)", clock === '2:00', String(clock));
step('arena.tmj fetched exactly once (cached map load, Strict-Mode safe)',
  tmjFetches === 1, String(tmjFetches));

await page.screenshot({ path: 'map-0.png' });
const void0 = py('void', 'map-0.png');
step('map-0: no deep-ocean void pixels (<30)', void0.count < 30, String(void0.count));
const cen0 = py('centroid', 'map-0.png', '--expect', '640,337', '--box', '560,280,720,420');
step('map-0: player bar at screen-center offset (camera = world spawn)',
  cen0.found && Math.abs(cen0.x - 640) <= 3 && Math.abs(cen0.y - 337.3) <= 3, JSON.stringify(cen0));

// Turn: the sim angle starts at 0 (east); turnRight (KeyD) increases it.
const cfg = await page.evaluate(() => ({
  rot: window.__gameConfig.player.rotationSpeed,
  radius: window.__gameConfig.player.radius,
}));
const turnMs = (Math.abs(theta) / cfg.rot) * 1000;
await page.keyboard.down('KeyD');
await page.waitForTimeout(turnMs);
await page.keyboard.up('KeyD');

// Thrust in bursts so the ship never slides along the wall while a poll runs.
await page.keyboard.down('KeyW');
const driveSamples = [];
let stopped = false;
for (let i = 0; i < 30 && !stopped; i += 1) {
  await page.waitForTimeout(250);
  await page.keyboard.up('KeyW');
  await page.screenshot({ path: 'drive-tmp.png' });
  const poll = py('drive', 'drive-tmp.png', ...ISLAND_TOP, '--expect', '640,337');
  driveSamples.push({ topY: poll.topY, cen: poll.centroid.found ? [poll.centroid.x, poll.centroid.y] : null });
  if (poll.topY !== null && poll.topY <= 378) stopped = true; // tangent to the island face
  else if (poll.topY === null && i >= 4) stopped = true; // missed the island → bail out
  else await page.keyboard.down('KeyW');
}
await page.keyboard.up('KeyW');
await page.waitForTimeout(250);
console.log(`  (turn ${turnMs.toFixed(0)}ms at ${cfg.rot} rad/s, theta=${theta.toFixed(3)}rad, radius=${cfg.radius})`);
step('drive: ship reached the island (contact within the burst budget)', stopped,
  JSON.stringify(driveSamples.map((s) => s.topY)));
const centered = driveSamples.filter((s) => s.cen)
  .every((s) => Math.abs(s.cen[0] - 640) <= 3.5 && Math.abs(s.cen[1] - 337.3) <= 3.5);
step('drive: bar stayed screen-centered the whole mid-map phase', centered && driveSamples.length >= 3,
  `${driveSamples.length} polls`);

await page.screenshot({ path: 'map-1.png' });
const top = py('island-top', 'map-1.png', ...ISLAND_TOP);
const left = py('island-left', 'map-1.png', '--xwin', '400,900', '--yband', '480,520');
const cen1 = py('centroid', 'map-1.png', '--expect', '640,337', '--box', '560,280,720,420');
// Camera from the island's screen edges (world edges known from the map data).
if (top.topY === null || left.leftX === null) {
  step('camera anchors found on map-1 (island top + left edges)', false,
    `topY=${top.topY} leftX=${left.leftX}`);
  await browser.close();
  process.exit(1);
}
const camY = target.r * TW + HALF_Y - top.topY / scale;
const camX = target.c * TW + HALF_X - left.leftX / scale;
step('final camera sits tangent to the island face (±8px of contact)',
  Math.abs(camY - (target.r * TW - cfg.radius)) <= 8,
  `camY=${camY.toFixed(1)} expected≈${target.r * TW - cfg.radius}`);
step('final camera stays under the hit region (ship did not slide far east)',
  camX > target.c * TW - 60 && camX < target.c * TW + TW * 4, `camX=${camX.toFixed(1)}`);
step('map-1: bar still screen-centered after the stop',
  cen1.found && Math.abs(cen1.x - 640) <= 3 && Math.abs(cen1.y - 337.3) <= 3, JSON.stringify(cen1));

// Screen-space helpers at the derived camera.
const toScreenX = (wx) => (wx - camX + HALF_X) * scale;
const toScreenY = (wy) => (wy - camY + HALF_Y) * scale;
const cellRect = worldRect(target).map((v, i) => (i % 2 === 0 ? toScreenX(v) : toScreenY(v)));
const inflate = cfg.radius * scale;
const bar = cen1;
const outside = bar.x < cellRect[0] - inflate || bar.x > cellRect[2] + inflate
  || bar.y < cellRect[1] - inflate || bar.y > cellRect[3] + inflate;
step('ship bar never entered the island cell rect inflated by radius', outside,
  `bar=(${bar.x},${bar.y}) rect=${cellRect.map((v) => v.toFixed(1)).join(',')}`);
const distToRect = Math.hypot(
  Math.max(cellRect[0] - 640, 0, 640 - cellRect[2]),
  Math.max(cellRect[1] - 360, 0, 360 - cellRect[3]),
);
step('final gap ship→cell rect < 2×radius×scale (it got close, not stuck across the map)',
  distToRect > 0 && distToRect < 2 * cfg.radius * scale, `gap=${distToRect.toFixed(1)}px`);

// Crew + flip presence at the derived camera (static checks via the analyzer).
const rects = {
  crew: { rect: worldRect(crewCell).map((v, i) => (i % 2 === 0 ? toScreenX(v) : toScreenY(v))) },
  flips: flipCells.map((cell) => ({
    gid: cell.g,
    flags: { 0x60000000: 'V|D', 0xa0000000: 'H|D', 0xc0000000: 'H|V' }[cell.flags],
    rect: worldRect(cell).map((v, i) => (i % 2 === 0 ? toScreenX(v) : toScreenY(v))),
  })),
};
writeFileSync('map-rects.json', JSON.stringify(rects));
const staticRun = spawnSync('python3', ['map-analyze.py', 'static', 'map-1.png', '--rects', 'map-rects.json'],
  { encoding: 'utf8' });
process.stdout.write(staticRun.stdout);
step('static crew/flip checks pass', staticRun.status === 0);
const void1 = py('void', 'map-1.png');
step('map-1: no deep-ocean void pixels (<30)', void1.count < 30, String(void1.count));

// Pause → Main Menu → the menu screen is back.
await page.keyboard.press('Escape');
await page.click('text=Main Menu');
await page.locator('text=Controls').waitFor().catch(() => {});
const backAtMenu = await page.locator('text=Play').first().isVisible().catch(() => false);
step('pause → Main Menu returns to the menu', backAtMenu === true);

// --- context 2: a camera-relative enemy walks in -------------------------------
const context2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page2 = await context2.newPage();
page2.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page2.on('pageerror', (error) => errors.push(String(error)));
await page2.goto('http://localhost:5199/map.html');
await page2.click('text=Play');
await page2.locator('.hud').waitFor();
await page2.waitForTimeout(5200);
await page2.screenshot({ path: 'map-2.png' });
const clusters = py('clusters', 'map-2.png');
step('map-2: at least 2 green bars (player + a camera-relative enemy)', clusters.clusters >= 2,
  JSON.stringify(clusters));

step('zero console errors / page errors across both contexts', errors.length === 0,
  errors.slice(0, 3).join(' | '));

await browser.close();
process.exit(failures === 0 ? 0 : 1);
