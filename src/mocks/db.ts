import { z } from 'zod';
import {
  matchRecordSchema,
  type MatchRecord,
  type Page,
  type RankingEntry,
} from '../api/contracts';

/**
 * The mock database behind MSW: an in-memory list of finished matches,
 * hydrated from localStorage at startup and persisted on every write, so
 * the mock server's data survives a reload during development.
 */

/** Versioned storage key — bump `@N` whenever the format changes. */
const RECORDS_STORAGE_KEY = 'pirate-battle/matches@1';

/** Reads the persisted records; malformed data simply starts empty. */
function hydrate(): MatchRecord[] {
  try {
    const raw = globalThis.localStorage.getItem(RECORDS_STORAGE_KEY);
    if (raw === null) return [];
    const parsed = z.array(matchRecordSchema).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/** Persists the whole list; never throws (storage may be blocked/full). */
function persist(): void {
  try {
    globalThis.localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // storage unavailable — the in-memory copy still serves this session
  }
}

/** The in-memory records. Mutate only through insertIfAbsent(). */
export const records: MatchRecord[] = hydrate();

/** Stable string key of a config, e.g. "120|3" — the ranking's config filter. */
export function configKeyOf(config: { sessionTimeSec: number; spawnIntervalSec: number }): string {
  return `${config.sessionTimeSec}|${config.spawnIntervalSec}`;
}

/** Inserts a record; an id that already exists is returned untouched. */
export function insertIfAbsent(record: MatchRecord): MatchRecord {
  const existing = records.find((r) => r.id === record.id);
  if (existing !== undefined) return existing;
  records.push(record);
  persist();
  return record;
}

/** Empties the db and its persistence — the debug Reset refills it with fixtures. */
export function clearRecords(): void {
  records.length = 0;
  persist();
}

/** Ties broken deterministically: score desc, duration asc, playedAt asc, id asc. */
function byRanking(a: MatchRecord, b: MatchRecord): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.durationSeconds !== b.durationSeconds) return a.durationSeconds - b.durationSeconds;
  if (a.playedAt !== b.playedAt) return a.playedAt < b.playedAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Newest first; id asc keeps equal timestamps deterministic. */
function byRecency(a: MatchRecord, b: MatchRecord): number {
  if (a.playedAt !== b.playedAt) return a.playedAt > b.playedAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** 1-based page bounds, clamped so garbage input still yields a valid page. */
function bounds(
  page: number,
  pageSize: number,
): { page: number; pageSize: number; from: number; to: number } {
  const p = Math.max(1, Math.trunc(page));
  const size = Math.max(1, Math.trunc(pageSize));
  return { page: p, pageSize: size, from: (p - 1) * size, to: p * size };
}

/**
 * The ranking for ONE config: only matches played under `configKey` are
 * compared — scores from different configs never mix. `rank` is the
 * position in the full sorted list, so it keeps counting across pages.
 */
export function getRanking(page: number, pageSize: number, configKey: string): Page<RankingEntry> {
  const sorted = records.filter((r) => configKeyOf(r.config) === configKey).sort(byRanking);
  const { from, to, page: p, pageSize: size } = bounds(page, pageSize);
  return {
    items: sorted.slice(from, to).map((record, index) => ({
      rank: from + index + 1,
      playerId: record.playerId,
      playerName: record.playerName,
      score: record.score,
      playedAt: record.playedAt,
    })),
    total: sorted.length,
    page: p,
    pageSize: size,
  };
}

/** One player's matches, newest first, across every config. */
export function getHistory(playerId: string, page: number, pageSize: number): Page<MatchRecord> {
  const sorted = records.filter((r) => r.playerId === playerId).sort(byRecency);
  const { from, to, page: p, pageSize: size } = bounds(page, pageSize);
  return { items: sorted.slice(from, to), total: sorted.length, page: p, pageSize: size };
}
