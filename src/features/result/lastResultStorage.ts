import { z } from 'zod';
import { SESSION_TIME_LIMITS } from '../../config/limits';

/**
 * The last *completed* match, kept locally so the result survives a
 * refresh. Abandoned matches are never written here.
 */
export interface LastMatchResult {
  /** total score of the run */
  score: number;
  /** seconds actually played (can be below the session minimum on death) */
  timePlayedSec: number;
  /** why the match ended */
  endReason: 'time' | 'death';
  /** ISO timestamp of when the match finished */
  finishedAt: string;
}

/** Versioned storage key — bump `@N` when the shape changes. */
const RESULT_STORAGE_KEY = 'pirate-battle/last-result@1';

/** Validation on read: anything that fails (corrupted or not an object) → null. */
const lastResultSchema = z.object({
  score: z.number().int().min(0),
  timePlayedSec: z.number().min(0).max(SESSION_TIME_LIMITS.maxSec),
  endReason: z.enum(['time', 'death']),
  finishedAt: z.iso.datetime(),
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
