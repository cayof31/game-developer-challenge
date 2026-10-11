import { z } from 'zod';

/**
 * API contracts: the single source of truth for what crosses the wire.
 * Zod schemas validate at the boundary; the TS types are inferred from
 * them, so schema and type can never drift apart.
 */

/** How a match ended: the session clock ran out, or the player died. */
export const endReasonSchema = z.enum(['time', 'death']);
export type EndReason = z.infer<typeof endReasonSchema>;

/** The match rules a finished match was played under (the options in effect). */
export const matchConfigSchema = z.object({
  sessionTimeSec: z.number().positive(),
  spawnIntervalSec: z.number().positive(),
});
export type MatchConfig = z.infer<typeof matchConfigSchema>;

/**
 * A finished match. The match `id` is generated on the client
 * (crypto.randomUUID()) when the match ends — it is the idempotency
 * key: retrying a submission with the same id can never duplicate a
 * record on the server.
 */
export const matchRecordSchema = z.object({
  id: z.uuid(),
  playerId: z.uuid(),
  playerName: z.string().min(1),
  /** ISO-8601 instant the match finished */
  playedAt: z.iso.datetime(),
  score: z.number().int().min(0),
  /** effective duration in seconds (a death ends the session early) */
  durationSeconds: z.number().min(0),
  endReason: endReasonSchema,
  config: matchConfigSchema,
});
export type MatchRecord = z.infer<typeof matchRecordSchema>;

/**
 * The POST body is the full client-built record — including the
 * client-generated id that keys idempotency.
 */
export const submitMatchRequestSchema = matchRecordSchema;
export type SubmitMatchRequest = z.infer<typeof submitMatchRequestSchema>;

/** One page of a paginated list. */
export interface Page<T> {
  items: T[];
  /** total number of items across every page */
  total: number;
  /** 1-based page index */
  page: number;
  pageSize: number;
}

/** Schema factory for any paginated payload. */
export function pageSchema<S extends z.ZodType>(item: S) {
  return z.object({
    items: z.array(item),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
  });
}

/** One row of the all-time ranking. */
export const rankingEntrySchema = z.object({
  /** 1-based position in the ranking */
  rank: z.number().int().min(1),
  playerId: z.uuid(),
  playerName: z.string().min(1),
  score: z.number().int().min(0),
  playedAt: z.iso.datetime(),
});
export type RankingEntry = z.infer<typeof rankingEntrySchema>;

/** The localStorage surface this module needs (injectable for tests). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Versioned storage key — bump `@N` whenever the format changes. */
const PLAYER_ID_STORAGE_KEY = 'pirate-battle/playerId@1';

/**
 * The local player id: generated once (crypto.randomUUID()) and kept in
 * localStorage, so every finished match across sessions shares one
 * identity. A missing or corrupt stored value is replaced. Returns null
 * only when storage itself is unavailable (e.g. blocked cookies).
 */
export function getLocalPlayerId(storage?: StorageLike): string | null {
  try {
    const store = storage ?? globalThis.localStorage;
    const stored = store.getItem(PLAYER_ID_STORAGE_KEY);
    if (stored !== null && matchRecordSchema.shape.playerId.safeParse(stored).success) {
      return stored;
    }
    const id = crypto.randomUUID();
    store.setItem(PLAYER_ID_STORAGE_KEY, id);
    return id;
  } catch {
    return null;
  }
}
