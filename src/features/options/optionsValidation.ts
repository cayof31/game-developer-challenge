import { SESSION_TIME_LIMITS, SPAWN_INTERVAL_LIMITS } from '../../config/limits';

/**
 * Field-level validation for the Options form, used both while typing and
 * as the final gate before saving. Returns the error message, or null when
 * the raw input is valid.
 */

export function validateSessionTime(raw: string): string | null {
  const value = Number(raw);
  const valid =
    raw.trim() !== '' &&
    Number.isInteger(value) &&
    value >= SESSION_TIME_LIMITS.minSec &&
    value <= SESSION_TIME_LIMITS.maxSec;
  return valid
    ? null
    : `Enter a whole number of seconds between ${SESSION_TIME_LIMITS.minSec} and ${SESSION_TIME_LIMITS.maxSec}.`;
}

export function validateSpawnInterval(raw: string): string | null {
  const value = Number(raw);
  const valid =
    raw.trim() !== '' &&
    Number.isFinite(value) &&
    value >= SPAWN_INTERVAL_LIMITS.minSec &&
    value <= SPAWN_INTERVAL_LIMITS.maxSec;
  return valid
    ? null
    : `Enter a number of seconds between ${SPAWN_INTERVAL_LIMITS.minSec} and ${SPAWN_INTERVAL_LIMITS.maxSec}.`;
}
