/**
 * Pure parser for Tiled exports: the map JSON (.tmj) and the external
 * tileset XML (.tsx). No DOM, no Pixi — strings in, plain data out, so the
 * same code runs in the browser and in Node checks.
 */

/** Tiled flip flags, stored in the high bits of every cell value. */
export const TILE_FLAG_H = 0x80000000;
export const TILE_FLAG_V = 0x40000000;
export const TILE_FLAG_D = 0x20000000;

/** The tile id of a cell: flip flags masked away. 0 = empty. */
export function tileGid(raw: number): number {
  return raw & 0x0fffffff;
}

/** One tile layer, in draw order (file order = bottom to top). */
export interface TiledLayer {
  readonly name: string;
  /** raw cell values: gid + flip flags, 0 = empty */
  readonly cells: Int32Array;
}

/** Everything the game needs from a Tiled .tmj export. */
export interface TiledMapDef {
  readonly cols: number;
  readonly rows: number;
  readonly tileSize: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly firstGid: number;
  readonly layers: readonly TiledLayer[];
}

const EXPECTED_LAYERS = 5;

interface RawTiledLayer {
  readonly type?: unknown;
  readonly name?: unknown;
  readonly data?: unknown;
}

interface RawTiledMap {
  readonly type?: unknown;
  readonly orientation?: unknown;
  readonly infinite?: unknown;
  readonly width?: unknown;
  readonly height?: unknown;
  readonly tilewidth?: unknown;
  readonly tileheight?: unknown;
  readonly layers?: unknown;
  readonly tilesets?: unknown;
}

function positiveNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Tiled map: invalid "${label}"`);
  }
  return value;
}

/** Parses a Tiled .tmj export; throws a descriptive Error when invalid. */
export function parseTiledMap(json: unknown): TiledMapDef {
  const raw = json as RawTiledMap;
  if (raw?.type !== 'map') throw new Error('Tiled map: missing type "map"');
  if (raw.orientation !== 'orthogonal') {
    throw new Error(`Tiled map: orientation "${String(raw.orientation)}" is not orthogonal`);
  }
  if (raw.infinite) throw new Error('Tiled map: infinite maps are not supported');
  const cols = positiveNumber(raw.width, 'width');
  const rows = positiveNumber(raw.height, 'height');
  const tileSize = positiveNumber(raw.tilewidth, 'tilewidth');
  if (positiveNumber(raw.tileheight, 'tileheight') !== tileSize) {
    throw new Error('Tiled map: non-square tiles are not supported');
  }
  if (!Array.isArray(raw.layers) || raw.layers.length !== EXPECTED_LAYERS) {
    throw new Error(`Tiled map: expected exactly ${EXPECTED_LAYERS} layers, got ${Array.isArray(raw.layers) ? raw.layers.length : 0}`);
  }
  const tilesets = raw.tilesets;
  if (!Array.isArray(tilesets) || tilesets.length !== 1) {
    throw new Error('Tiled map: expected exactly 1 tileset');
  }
  const firstGid = positiveNumber(
    (tilesets[0] as { readonly firstgid?: unknown }).firstgid,
    'tilesets[0].firstgid',
  );
  const layers: TiledLayer[] = raw.layers.map((entry, index) => {
    const layer = entry as RawTiledLayer;
    if (layer?.type !== 'tilelayer') {
      throw new Error(`Tiled map: layer ${index + 1} is not a tile layer`);
    }
    const data = layer.data;
    if (!Array.isArray(data) || data.length !== cols * rows) {
      throw new Error(`Tiled map: layer ${index + 1} data length ${Array.isArray(data) ? data.length : 'missing'} != ${cols * rows}`);
    }
    return { name: String(layer.name), cells: Int32Array.from(data) };
  });
  return {
    cols,
    rows,
    tileSize,
    widthPx: cols * tileSize,
    heightPx: rows * tileSize,
    firstGid,
    layers,
  };
}

/**
 * Parses a Tiled external tileset (.tsx, an image collection) into a
 * gid → absolute image URL map. Sources resolve against the TSX URL, so
 * entries like "../ship_parts/crew_1.png" land in the right directory.
 */
export function parseTileset(
  xml: string,
  tsxUrl: string,
  firstGid: number,
): ReadonlyMap<number, string> {
  const images = new Map<number, string>();
  const entry = /<tile id="(\d+)">\s*<image source="([^"]+)"/g;
  for (const match of xml.matchAll(entry)) {
    images.set(firstGid + Number(match[1]), new URL(match[2], tsxUrl).href);
  }
  if (images.size === 0) throw new Error('Tiled tileset: no <tile><image> entries found');
  return images;
}
