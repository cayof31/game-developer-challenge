/**
 * Query key factory — the single place cache keys are built, so their
 * shape can never drift between the hook that fetches and the code that
 * invalidates. Page is part of every key: responses for different pages
 * land in different cache entries, so a late answer for an old page can
 * never overwrite a newer one.
 */
export const queryKeys = {
  /** Invalidation prefix: every ranking page, of every config. */
  rankingPrefix: ['ranking'] as const,
  /**
   * One option set's ranking. The middle element is the configKey — the
   * same `sessionTimeSec|spawnIntervalSec` bucket id the server ranks by.
   */
  ranking: (sessionTimeSec: number, spawnIntervalSec: number, page: number) =>
    ['ranking', `${sessionTimeSec}|${spawnIntervalSec}`, page] as const,
  /** Invalidation prefix: every history page, of every player. */
  historyPrefix: ['history'] as const,
  /** One player's match-history page. */
  history: (playerId: string, page: number) => ['history', playerId, page] as const,
};
