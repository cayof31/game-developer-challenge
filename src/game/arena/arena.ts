import { tileGid, type TiledMapDef } from '../map/tiled';
import type { Arena, Vec2 } from '../types';

/**
 * Fixed logical world, built from the hand-authored Tiled map. The collision
 * grid IS the islands layer, so what the player sees is what the physics
 * uses. The world is larger than the view (config.view); the camera scrolls
 * across it and the renderer scales the view window to the screen.
 */
export const ISLAND_LAYER_INDEX = 2; // map layer 3: islands (collision)

/** Builds the arena from the parsed map. No generation, no RNG. */
export function buildArena(map: TiledMapDef): Arena {
  const collision = new Uint8Array(map.cols * map.rows);
  const islandCells = map.layers[ISLAND_LAYER_INDEX].cells;
  for (let i = 0; i < collision.length; i += 1) {
    collision[i] = tileGid(islandCells[i]) !== 0 ? 1 : 0;
  }
  return {
    width: map.widthPx,
    height: map.heightPx,
    cols: map.cols,
    rows: map.rows,
    tileSize: map.tileSize,
    playerSpawn: { x: map.widthPx / 2, y: map.heightPx / 2 },
    layers: map.layers,
    collision,
  };
}

/** True while the cell under the world point is solid (island). */
export function solidAt(arena: Arena, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= arena.width || y >= arena.height) return false;
  const col = Math.floor(x / arena.tileSize);
  const row = Math.floor(y / arena.tileSize);
  return arena.collision[row * arena.cols + col] === 1;
}

/** True when any solid cell overlaps the circle (world px). */
export function solidWithinRadius(arena: Arena, position: Vec2, radius: number): boolean {
  const col0 = Math.max(0, Math.floor((position.x - radius) / arena.tileSize));
  const col1 = Math.min(arena.cols - 1, Math.floor((position.x + radius) / arena.tileSize));
  const row0 = Math.max(0, Math.floor((position.y - radius) / arena.tileSize));
  const row1 = Math.min(arena.rows - 1, Math.floor((position.y + radius) / arena.tileSize));
  for (let row = row0; row <= row1; row += 1) {
    for (let col = col0; col <= col1; col += 1) {
      if (arena.collision[row * arena.cols + col] !== 1) continue;
      const left = col * arena.tileSize;
      const top = row * arena.tileSize;
      const closestX = Math.min(Math.max(position.x, left), left + arena.tileSize);
      const closestY = Math.min(Math.max(position.y, top), top + arena.tileSize);
      const dx = position.x - closestX;
      const dy = position.y - closestY;
      if (dx * dx + dy * dy < radius * radius) return true;
    }
  }
  return false;
}

/** Clamps a circle (ship) so it stays fully inside the arena bounds. */
export function clampToArena(arena: Arena, position: Vec2, radius: number): Vec2 {
  return {
    x: Math.min(Math.max(position.x, radius), arena.width - radius),
    y: Math.min(Math.max(position.y, radius), arena.height - radius),
  };
}

/** True while the point is inside the arena (used to expire projectiles). */
export function isInsideArena(arena: Arena, position: Vec2): boolean {
  return (
    position.x >= 0 && position.x <= arena.width && position.y >= 0 && position.y <= arena.height
  );
}
