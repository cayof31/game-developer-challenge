import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '../queryKeys';
import { fetchRanking, type RankingQuery } from '../rankingApi';

/**
 * One page of the ranking for the current options. Page lives in the
 * query key — a late answer for an old page lands in that page's own
 * cache entry and can never overwrite a newer one — and the request
 * carries the query's abort signal, so flipping pages quickly cancels
 * the superseded request. `keepPreviousData` keeps the previous page on
 * screen while the next loads: pagination without flicker.
 */
export function useRanking(query: RankingQuery) {
  return useQuery({
    queryKey: queryKeys.ranking(query.sessionTimeSec, query.spawnIntervalSec, query.page ?? 1),
    queryFn: ({ signal }) => fetchRanking(query, signal),
    placeholderData: keepPreviousData,
  });
}
