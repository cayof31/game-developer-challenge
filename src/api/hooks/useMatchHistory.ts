import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchHistory } from '../historyApi';
import { queryKeys } from '../queryKeys';

/**
 * One page of a player's finished matches, newest first. Same shape as
 * useRanking: page in the query key (stale answers can't cross pages),
 * abort signal on the request, previous page kept visible while the
 * next one loads.
 */
export function useMatchHistory(playerId: string, page = 1) {
  return useQuery({
    queryKey: queryKeys.history(playerId, page),
    queryFn: ({ signal }) => fetchHistory(playerId, { page, signal }),
    placeholderData: keepPreviousData,
  });
}
