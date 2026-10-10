# Tiled Map Integration — Design Spec

Date: 2026-10-10
Status: approved design (chat), pending spec review

## Goal

Replace the randomly generated circular islands with the hand-authored Tiled
map in `public/assets/map/arena.tmj`. The map has five layers, drawn in file
order (bottom → top): water, shore transition, islands, decoration, top.
Collision comes from the islands layer **only** (layer 3). The `.tmx` is the
same map in Tiled's XML format and stays as a human-readable parity copy —
only the `.tmj` is used at runtime.

## Verified map facts

- 60 × 34 tiles, 64 px each → world **3840 × 2176 px** (view stays 1920 × 1080).
- Tileset `teste.tsx` (external, at `public/assets/png/default/tiles/`):
  an image collection — 102 tiles: `tile_1..96.png` plus
  `../ship_parts/crew_1..6.png` (crew images are 22 × 20 / 22 × 22 px, not 64).
- Layers (file order = draw order):
  1. water — gid 73 in every cell;
  2. transition — 11 gids on water cells around islands;
  3. **islands (collision)** — 31 real gids, 247 solid cells (~12%);
  4. decoration — 28 gids, uses Tiled flip flags (V|D, H|V, H|D);
  5. top — 6 gids.
- World center cell (30, 17) is open water → `playerSpawn` stays the world
  center (1920, 1088), same behavior as today.

## Architecture / data flow

```
public/assets/map/arena.tmj ──fetch──┐
public/assets/png/default/tiles/teste.tsx ──fetch──┤
                                                   ▼
                              pure parser (src/game/map/tiled.ts)
                                                   ▼
                                        TiledMapDef (parsed once)
                              ┌────────────────────┼────────────────────┐
                              ▼                    ▼                    ▼
                     buildArena()          tile texture load      ArenaView sprites
                  (sim: bounds,          (Assets.load entries     (5 layer containers,
                   collision grid,        from used gids)          one Sprite per cell)
                   playerSpawn)
```

The map is a runtime asset (single source of truth: the file you edit in
Tiled), fetched and parsed once per session with the same cache-once /
clear-on-failure policy the texture loader already has.

## Components

### 1. `src/game/map/tiled.ts` — pure parser (no DOM, no Pixi)

```ts
export interface TiledLayer { readonly name: string; readonly cells: Int32Array; } // raw gids incl. flip flags, 0 = empty
export interface TiledMapDef {
  readonly cols: number; readonly rows: number; readonly tileSize: number;
  readonly widthPx: number; readonly heightPx: number;
  readonly layers: readonly TiledLayer[]; // draw order = file order
}
```

- `parseTiledMap(json: unknown): TiledMapDef` — validates `type: 'map'`,
  orthogonal orientation, finite, exactly 5 tile layers whose data length is
  `cols × rows`; throws a descriptive `Error` otherwise.
- Flip-flag helpers: `H = 0x80000000`, `V = 0x40000000`, `D = 0x20000000`,
  `tileGid(raw) = raw & 0x0FFFFFFF`.
- `parseTileset(xml: string, tsxUrl: string, firstGid: number): Map<number, string>`
  — extracts `<tile id><image source>` pairs from the XML and resolves each
  source against the TSX URL (so `../ship_parts/crew_1.png` resolves to
  `/assets/png/default/ship_parts/crew_1.png`); throws on malformed XML.
- After parsing both: every non-zero masked gid used by any layer must exist
  in the tileset map, else throw (typo/mismatch is a hard error, not a hole).

### 2. `src/game/arena/arena.ts`

```ts
export interface Arena {
  width: number;  // px, from the map
  height: number; // px, from the map
  playerSpawn: Vec2;                       // world center
  layers: readonly TiledLayer[];           // draw order, for the view
  collision: Uint8Array;                   // cols×rows, 1 = solid (layer 3)
}
```

- `buildArena(map: TiledMapDef): Arena` replaces `createArena`; no RNG.
- Keep `clampToArena` / `isInsideArena` unchanged (they read width/height).
- Grid predicates used by systems + view tests: `solidAt(arena, x, y)` (world
  px) and a circle-vs-solid-cells query used by spawn and collision.

### 3. Systems

- `collisionSystem(ship, arena, radius)`: iterate only the cells overlapping
  the ship's AABB (clamped to the grid); for each solid cell push the ship
  along the cell's contact normal (center inside a cell → push along the
  axis of least penetration); then `clampToArena` as today.
- `projectileHitsIsland(projectile, arena, radius)`: same cell query.
- `findSpawnPoint(config, radius, player, arena, rng)`: the camera-relative
  ring and `spawnMinDistanceFromPlayer` stay; the island rejection becomes
  "no solid cell within `radius` of the candidate" — enemies spawn only in
  water, exactly like the player.
- `Simulation(config, seed, map: TiledMapDef)` builds the arena from the map;
  the internal `islands` array and `MatchState.islands` are removed (the
  snapshot's `arena` carries layers + collision). Enemy AI is unchanged —
  island avoidance remains implicit via push-out.

### 4. Rendering — `src/game/render/ArenaView.ts`

- Constructor: `(texturesByGid: Map<number, Texture>, arena: Arena)`.
- Builds one container per layer in file order (children render in that
  order), one `Sprite` per non-empty cell at `(col × tileSize, row × tileSize)`.
- Tiled flip flags H/V/D map to sprite transform (mirror x / mirror y /
  transpose + mirror); the three flipped cells of this map are verified
  visually.
- Images smaller than the tile size (crew: 22 × 20) align **bottom-left**
  inside the cell (Tiled default): `position = cell origin + (0, tileH − imgH)`.
- Stack unchanged: `arena → ships → projectiles → effects` in the world
  container. All five layers stay **below** gameplay objects — ships can
  never overlap island/decoration cells because collision keeps them off.
- The `TilingSprite` water and sand `Graphics` circles are deleted; the
  `tile-water` / `tile-sand` / `tile-grass` manifest aliases go with them.

### 5. Loading — `assetLoader.ts` + `useGameSession.ts`

- New `src/game/map/mapAssets.ts`: cached `loadArenaAssets()` fetches the
  TMJ and TSX, parses them, loads the textures of the ~73 used gids via
  `Assets.load` entries (`map-tile-<gid>` aliases), and returns
  `{ map, texturesByGid }`. Cache-once per session; on failure the pending
  cache clears so Retry starts a fresh attempt (same policy as
  `createAssetLoader`).
- `useGameSession`: `await loadGameAssets(...)` (unchanged) →
  `await loadArenaAssets()` (quick, sub-second; no extra progress
  granularity) → `renderer.init` with world size from the **map** →
  `new Simulation(config, seed, map)` → `ArenaView(texturesByGid, arena)`.
- Any fetch/parse/validation failure flows into the existing
  `error` + Retry UI.

### 6. Config — `gameConfig.ts`

- Delete the whole `arena` block (world size now comes from the map;
  island generation is gone): `islandCount`, `islandMinRadius`,
  `islandMaxRadius`, `islandPlacementAttempts`.
- Keep `view` and all `match.*` spawn/scoring keys; `withOptions` untouched.

## Error handling

- Network/404 on TMJ, TSX, or any tile PNG → error path + Retry (refetch).
- Malformed TMJ/TSX or wrong layer count/size → descriptive `Error` shown in
  the existing error UI.
- Layer gid not present in the tileset → hard error at load (no silent holes).

## Out of scope

- Tile animation, parallax, Tiled object layers, audio, HUD, options,
  pause/touch/keyboard, publisher — all unchanged. `.tmx` unused at runtime.

## Verification

- **Node (throwaway, bare tsc)**: parser validation failures; real TMJ
  parses to 60×34×5/3840×2176; real TSX resolves `97 → crew_1.png` and every
  used gid is covered; `buildArena` → 247 solids, spawn (1920,1088) clear
  with player radius; `collisionSystem` pushes a ship out of a known island
  cell; `projectileHitsIsland` true inside an island cell; `findSpawnPoint`
  (100 seeds, player at center and near edges) never within radius of a
  solid cell and still off-view; `Simulation` spawns an off-view enemy in
  water by the first interval.
- **Playwright (throwaway harness)**: map renders (water fills the world,
  islands/decoration/crew visible in a screenshot); driving into an island
  stops the ship at the shore (no pass-through); camera follows mid-map and
  clamps at the world edge with zero void pixels (16:9 viewport); a spawned
  enemy walks in from off-screen; 0 console errors; clock defaults intact.
- `npx tsc -b --pretty false` and `npx eslint src` exit 0 after cleanup;
  all throwaway files and the test server removed.
