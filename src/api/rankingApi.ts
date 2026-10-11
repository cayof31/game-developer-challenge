import {
  pageSchema,
  rankingEntrySchema,
  type Page,
  type RankingEntry,
} from './contracts';
import { httpClient } from './httpClient';

/** Which option set to rank, and which page of it to load. */
export interface RankingQuery {
  sessionTimeSec: number;
  spawnIntervalSec: number;
  page?: number;
  pageSize?: number;
}

/**
 * GET /api/ranking — one page of the ranking for a given config. The
 * response is parsed against the contract, so a divergent server fails
 * here loudly instead of spreading bad data into the UI. The optional
 * signal cancels the request when a newer key supersedes it.
 */
export async function fetchRanking(
  query: RankingQuery,
  signal?: AbortSignal,
): Promise<Page<RankingEntry>> {
  const { data } = await httpClient.get('/ranking', {
    params: {
      sessionTime: query.sessionTimeSec,
      spawnInterval: query.spawnIntervalSec,
      page: query.page,
      pageSize: query.pageSize,
    },
    signal,
  });
  return pageSchema(rankingEntrySchema).parse(data);
}
