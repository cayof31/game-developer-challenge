import {
  matchRecordSchema,
  pageSchema,
  type MatchRecord,
  type Page,
} from './contracts';
import { httpClient } from './httpClient';

/** GET /api/history options: which page, of what size, abortable. */
export interface HistoryQuery {
  page?: number;
  pageSize?: number;
  signal?: AbortSignal;
}

/**
 * GET /api/history — one page of a player's finished matches, newest
 * first, across every config. Response parsed against the contract, like
 * every other call through this client. The signal cancels the request
 * when a newer key supersedes it.
 */
export async function fetchHistory(
  playerId: string,
  { page, pageSize, signal }: HistoryQuery = {},
): Promise<Page<MatchRecord>> {
  const { data } = await httpClient.get('/history', {
    params: { playerId, page, pageSize },
    signal,
  });
  return pageSchema(matchRecordSchema).parse(data);
}
