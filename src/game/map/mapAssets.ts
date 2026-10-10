import { Assets } from 'pixi.js';
import type { Texture } from 'pixi.js';
import { parseTileset, parseTiledMap, tileGid, type TiledMapDef } from './tiled';

/** Map + tile textures, parsed and loaded once per session. */
export type ArenaAssetsResult =
  | {
      readonly status: 'loaded';
      readonly map: TiledMapDef;
      readonly texturesByGid: ReadonlyMap<number, Texture>;
    }
  | { readonly status: 'error'; readonly message: string };

const MAP_URL = '/assets/map/arena.tmj';
const TILESET_URL = '/assets/png/default/tiles/teste.tsx';
const TILE_ALIAS_PREFIX = 'map-tile-';

/**
 * Pure core: parses both Tiled texts and builds the texture-load entries
 * for the distinct gids the map actually uses. Throws when a used gid has
 * no image in the tileset — a typo shows up as an error, never a hole.
 */
export function buildArenaAssets(
  tmjText: string,
  tsxText: string,
  tsxUrl: string,
): { map: TiledMapDef; entries: readonly { alias: string; src: string }[] } {
  const map = parseTiledMap(JSON.parse(tmjText));
  const images = parseTileset(tsxText, tsxUrl, map.firstGid);
  const usedGids = new Set<number>();
  for (const layer of map.layers) {
    for (const cell of layer.cells) {
      const gid = tileGid(cell);
      if (gid !== 0) usedGids.add(gid);
    }
  }
  const entries = [...usedGids]
    .sort((a, b) => a - b)
    .map((gid) => {
      const src = images.get(gid);
      if (src === undefined) {
        throw new Error(`Tiled map: tile gid ${gid} has no image in the tileset`);
      }
      return { alias: `${TILE_ALIAS_PREFIX}${gid}`, src };
    });
  return { map, entries };
}

let pending: Promise<ArenaAssetsResult> | null = null;

/**
 * Fetches the map and its tileset, parses them, and loads the textures of
 * every used gid. Cached once per session (a Strict-Mode double mount joins
 * the same load); on failure the cache clears so Retry starts fresh. Never
 * rejects — errors come back as `{ status: 'error' }`.
 */
export const loadArenaAssets = (): Promise<ArenaAssetsResult> => {
  if (pending) return pending;
  pending = (async (): Promise<ArenaAssetsResult> => {
    const [tmjResponse, tsxResponse] = await Promise.all([fetch(MAP_URL), fetch(TILESET_URL)]);
    if (!tmjResponse.ok) {
      throw new Error(`Map fetch failed: ${MAP_URL} (${tmjResponse.status})`);
    }
    if (!tsxResponse.ok) {
      throw new Error(`Tileset fetch failed: ${TILESET_URL} (${tsxResponse.status})`);
    }
    const tsxUrl = new URL(TILESET_URL, location.href).href;
    const built = buildArenaAssets(await tmjResponse.text(), await tsxResponse.text(), tsxUrl);
    await Assets.load(built.entries.map((entry) => ({ alias: entry.alias, src: entry.src })));
    const texturesByGid = new Map<number, Texture>();
    for (const { alias } of built.entries) {
      texturesByGid.set(Number(alias.slice(TILE_ALIAS_PREFIX.length)), Assets.get<Texture>(alias));
    }
    return { status: 'loaded', map: built.map, texturesByGid };
  })().catch((error: unknown) => {
    pending = null; // failed → the next call starts a new attempt
    return { status: 'error', message: error instanceof Error ? error.message : String(error) };
  });
  return pending;
};
