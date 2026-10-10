import { z } from 'zod';
import { gameConfig } from '../../config/gameConfig';
import { SESSION_TIME_LIMITS, SPAWN_INTERVAL_LIMITS } from '../../config/limits';

/** The two player-facing options, as edited on the Options screen. */
export interface PlayerOptions {
  /** "Game session time" — active match duration, seconds */
  sessionTimeSec: number;
  /** "Enemy spawn time" — seconds between enemy spawns */
  spawnIntervalSec: number;
}

/** Out of the box: the gameplay defaults from the typed config. */
export const DEFAULT_OPTIONS: PlayerOptions = {
  sessionTimeSec: gameConfig.match.sessionTimeSec,
  spawnIntervalSec: gameConfig.match.spawnIntervalSec,
};

/**
 * Versioned storage key — bump `@N` whenever the shape changes; older data
 * simply stops matching the key and the defaults take over.
 */
const OPTIONS_STORAGE_KEY = 'pirate-battle/options@1';

/**
 * Validation on read: every field falls back to its own default when the
 * stored value is missing, malformed or out of the documented limits; a
 * structurally broken payload (not an object at all) falls back entirely.
 * Unknown keys are stripped.
 */
const optionsSchema = z
  .object({
    sessionTimeSec: z
      .number()
      .int()
      .min(SESSION_TIME_LIMITS.minSec)
      .max(SESSION_TIME_LIMITS.maxSec)
      .catch(DEFAULT_OPTIONS.sessionTimeSec),
    spawnIntervalSec: z
      .number()
      .min(SPAWN_INTERVAL_LIMITS.minSec)
      .max(SPAWN_INTERVAL_LIMITS.maxSec)
      .catch(DEFAULT_OPTIONS.spawnIntervalSec),
  })
  .catch(DEFAULT_OPTIONS);

/** The localStorage surface these storages need (injectable for tests). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Reads the saved options; never throws. Anything unreadable — missing key,
 * invalid JSON, wrong shape, out-of-range values, or a storage that throws
 * on access (e.g. blocked cookies) — comes back as the defaults.
 */
export function loadOptions(storage?: StorageLike): PlayerOptions {
  try {
    const store = storage ?? globalThis.localStorage;
    const raw = store.getItem(OPTIONS_STORAGE_KEY);
    if (raw === null) return DEFAULT_OPTIONS;
    return optionsSchema.parse(JSON.parse(raw));
  } catch {
    return DEFAULT_OPTIONS;
  }
}

/**
 * Persists the options; never throws. The value is validated first, so only
 * data that would also load correctly is ever written (invalid fields are
 * normalized to their defaults on the way in).
 */
export function saveOptions(options: PlayerOptions, storage?: StorageLike): void {
  try {
    const store = storage ?? globalThis.localStorage;
    store.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(optionsSchema.parse(options)));
  } catch {
    // storage unavailable/full — the match simply keeps the current options
  }
}
