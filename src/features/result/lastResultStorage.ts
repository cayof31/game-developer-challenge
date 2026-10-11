import { z } from 'zod';
import { SESSION_TIME_LIMITS } from '../../config/limits';
import { matchConfigSchema, type MatchConfig, type MatchRecord } from '../../api/contracts';

/**
 * No name entry exists in the app yet — the ranking highlights the
 * player by id, so the display name is a fixed label for now.
 */
export const PLAYER_NAME = 'Captain';

/**
 * The last *completed* match, kept locally so the result survives a
 * refresh. Abandoned matches are never written here.
 */
export interface LastMatchResult {
  /**
   * Client-generated id of the finished match: the idempotency key of
   * the submission, created when the match ends so re-submitting the
   * stored result (e.g. after a refresh) can never duplicate it.
   */
  id: string;
  /** total score of the run */
  score: number;
  /** seconds actually played (can be below the session minimum on death) */
  timePlayedSec: number;
  /** why the match ended */
  endReason: 'time' | 'death';
  /** ISO timestamp of when the match finished */
  finishedAt: string;
  /** the options in effect when the match ran (captured at match end) */
  config: MatchConfig;
}

/** Versioned storage key — bump `@N` when the shape changes. */
const RESULT_STORAGE_KEY = 'pirate-battle/last-result@2';

/** Validation on read: anything that fails (corrupted or not an object) → null. */
const lastResultSchema = z.object({
  id: z.uuid(),
  score: z.number().int().min(0),
  timePlayedSec: z.number().min(0).max(SESSION_TIME_LIMITS.maxSec),
  endReason: z.enum(['time', 'death']),
  finishedAt: z.iso.datetime(),
  config: matchConfigSchema,
});

/** The localStorage surface these storages need (injectable for tests). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Reads the last completed result; never throws. Missing, corrupted or
 * out-of-contract data comes back as `null` (no result recorded).
 */
export function loadLastResult(storage?: StorageLike): LastMatchResult | null {
  try {
    const store = storage ?? globalThis.localStorage;
    const raw = store.getItem(RESULT_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = lastResultSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Persists the last completed result; never throws. Only data that passes
 * the same contract as `loadLastResult` is written — an invalid result is
 * a bug at the call site and must not replace a valid stored one.
 */
export function saveLastResult(result: LastMatchResult, storage?: StorageLike): void {
  try {
    const parsed = lastResultSchema.safeParse(result);
    if (!parsed.success) return;
    const store = storage ?? globalThis.localStorage;
    store.setItem(RESULT_STORAGE_KEY, JSON.stringify(parsed.data));
  } catch {
    // storage unavailable/full — the result screen falls back to "no result"
  }
}

/** The submission as the API contract sees it, straight from the stored result. */
export function toMatchRecord(result: LastMatchResult, playerId: string): MatchRecord {
  return {
    id: result.id,
    playerId,
    playerName: PLAYER_NAME,
    playedAt: result.finishedAt,
    score: result.score,
    durationSeconds: result.timePlayedSec,
    endReason: result.endReason,
    config: result.config,
  };
}
