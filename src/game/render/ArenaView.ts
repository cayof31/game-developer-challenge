import { Container, Sprite } from 'pixi.js';
import type { Texture } from 'pixi.js';
import { tileGid } from '../map/tiled';
import type { Arena } from '../types';

/**
 * Per-flag-combo [rotation, scaleX, scaleY] implementing Tiled's flip
 * semantics as M = flipV · flipH · transpose around the cell center
 * (transpose first, mirrors after — Tiled's documented order). Pixi
 * composes scale BEFORE rotation, so the 8 combos are precomputed here
 * instead of composed at runtime. Index = H·4 + V·2 + D, from the raw
 * cell's high bits (H=0x80000000, V=0x40000000, D=0x20000000).
 */
export const FLIP_TABLE: readonly (readonly [number, number, number])[] = [
  [0, 1, 1], // no flags
  [-Math.PI / 2, -1, 1], // D: transpose
  [0, 1, -1], // V
  [-Math.PI / 2, 1, 1], // D+V
  [0, -1, 1], // H
  [Math.PI / 2, 1, 1], // H+D
  [0, -1, -1], // H+V
  [Math.PI / 2, -1, 1], // H+V+D
];

/**
 * Draws the Tiled map inside the world container: one child container per
 * layer in file order (bottom to top), one Sprite per non-empty cell. All
 * layers render under gameplay objects — collision keeps ships off island
 * cells, so nothing can overlap the map art. Images smaller than the cell
 * (crew: 22×20) align bottom-left, the Tiled default.
 */
export class ArenaView {
  readonly container = new Container();

  constructor(texturesByGid: ReadonlyMap<number, Texture>, arena: Arena) {
    for (const layer of arena.layers) {
      const layerContainer = new Container();
      for (let row = 0; row < arena.rows; row += 1) {
        for (let col = 0; col < arena.cols; col += 1) {
          const raw = layer.cells[row * arena.cols + col];
          const gid = tileGid(raw);
          if (gid === 0) continue;
          const texture = texturesByGid.get(gid);
          if (!texture) throw new Error(`ArenaView: missing texture for tile gid ${gid}`);
          if (texture.width > arena.tileSize || texture.height > arena.tileSize) {
            throw new Error(`ArenaView: tile gid ${gid} image is larger than the cell`);
          }
          const cell = new Container();
          cell.position.set(col * arena.tileSize, row * arena.tileSize);
          cell.pivot.set(arena.tileSize / 2, arena.tileSize / 2); // flips rotate the cell center
          const sprite = new Sprite(texture);
          sprite.y = arena.tileSize - texture.height; // bottom-left alignment
          const [rotation, scaleX, scaleY] = FLIP_TABLE[(raw >>> 29) & 7];
          cell.rotation = rotation;
          cell.scale.set(scaleX, scaleY);
          cell.addChild(sprite);
          layerContainer.addChild(cell);
        }
      }
      this.container.addChild(layerContainer); // file order = draw order
    }
  }

  /** Removes this view and its display objects; textures stay cached. */
  destroy(): void {
    this.container.destroy({ children: true });
  }
}
