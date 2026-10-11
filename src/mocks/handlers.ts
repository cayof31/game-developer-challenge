import { delay, http, HttpResponse } from 'msw';
import {
  submitMatchRequestSchema,
  type MatchRecord,
  type Page,
  type RankingEntry,
} from '../api/contracts';
import { configKeyOf, getHistory, getRanking, insertIfAbsent, records } from './db';
import { getScenario, nextLatencyMs, submitOutcome } from './scenarios';

/**
 * MSW handlers over the in-memory mock db — the app's whole "backend".
 * Every route validates its input against the contracts and answers
 * with the contract shapes from api/contracts.ts. The active scenario
 * (mocks/scenarios.ts) is read on EVERY request: latency, forced
 * failures and the empty/paginated variants apply immediately.
 */

/** Default pagination when the query string doesn't say otherwise. */
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;

const badRequest = (message: string) => HttpResponse.json({ message }, { status: 400 });
const unavailable = (what: string) =>
  HttpResponse.json({ message: `scenario: ${what} unavailable` }, { status: 500 });

/**
 * A response the client never receives: the interceptor keeps the
 * request pending until the client gives up (axios timeout).
 */
const neverAnswer = (): Promise<never> => new Promise<never>(() => {});

/**
 * Matches a pathname on any origin — relative string paths only resolve
 * inside a browser Service Worker, while this works both there and in
 * Node checks.
 */
function isPath(pathname: string) {
  return ({ request }: { request: Request }) => new URL(request.url).pathname === pathname;
}

/** Reads a positive numeric query param; null when missing or invalid. */
function numParam(params: URLSearchParams, name: string): number | null {
  const raw = params.get(name);
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Pagination from the query string; null when a provided value is invalid. */
function pagination(
  params: URLSearchParams,
): { page: number; pageSize: number } | null {
  const page = params.has('page') ? numParam(params, 'page') : DEFAULT_PAGE;
  const pageSize = params.has('pageSize') ? numParam(params, 'pageSize') : DEFAULT_PAGE_SIZE;
  return page !== null && pageSize !== null ? { page, pageSize } : null;
}

/**
 * GET /api/ranking?page=&pageSize=&sessionTime=&spawnInterval=
 * The two config params select which option set is being compared —
 * matches from other configs never enter this ranking.
 */
const rankingHandler = http.get(isPath('/api/ranking'), async ({ request }) => {
  await delay(nextLatencyMs('ranking'));
  const scenario = getScenario();
  if (scenario.failRanking) return unavailable('ranking');
  const params = new URL(request.url).searchParams;
  const sessionTimeSec = numParam(params, 'sessionTime');
  const spawnIntervalSec = numParam(params, 'spawnInterval');
  if (sessionTimeSec === null || spawnIntervalSec === null) {
    return badRequest('sessionTime and spawnInterval must be positive numbers');
  }
  const paging = pagination(params);
  if (paging === null) return badRequest('page and pageSize must be positive numbers');
  if (scenario.emptyLists) {
    return HttpResponse.json({
      items: [],
      total: 0,
      page: paging.page,
      pageSize: paging.pageSize,
    } satisfies Page<RankingEntry>);
  }
  const configKey = configKeyOf({ sessionTimeSec, spawnIntervalSec });
  // the scenario can force the number of pages: pick the page size that
  // makes the list report about `scenario.pages` pages
  let pageSize = paging.pageSize;
  if (scenario.pages !== null) {
    pageSize = Math.max(1, Math.ceil(getRanking(1, 1, configKey).total / scenario.pages));
  }
  const ranking: Page<RankingEntry> = getRanking(paging.page, pageSize, configKey);
  return HttpResponse.json(ranking);
});

/**
 * GET /api/history?playerId=&page=&pageSize=
 * One player's finished matches, newest first, across every config.
 */
const historyHandler = http.get(isPath('/api/history'), async ({ request }) => {
  await delay(nextLatencyMs('history'));
  const scenario = getScenario();
  if (scenario.failHistory) return unavailable('match history');
  const params = new URL(request.url).searchParams;
  const playerId = params.get('playerId');
  if (playerId === null || playerId === '') {
    return badRequest('playerId is required');
  }
  const paging = pagination(params);
  if (paging === null) return badRequest('page and pageSize must be positive numbers');
  if (scenario.emptyLists) {
    return HttpResponse.json({
      items: [],
      total: 0,
      page: paging.page,
      pageSize: paging.pageSize,
    } satisfies Page<MatchRecord>);
  }
  let pageSize = paging.pageSize;
  if (scenario.pages !== null) {
    pageSize = Math.max(1, Math.ceil(getHistory(playerId, 1, 1).total / scenario.pages));
  }
  const history: Page<MatchRecord> = getHistory(playerId, paging.page, pageSize);
  return HttpResponse.json(history);
});

/**
 * POST /api/matches — submits a finished match. The body is the full
 * client-built record; its client-generated id keys idempotency: a new
 * record answers 201, an already-known id answers 200 with the stored
 * record. Both statuses carry the same body, so the client can treat
 * them identically. The active scenario decides what happens instead,
 * when it misbehaves.
 */
const submitHandler = http.post(isPath('/api/matches'), async ({ request }) => {
  await delay(nextLatencyMs('matches'));
  const outcome = submitOutcome();
  if (outcome === 'timeout') return neverAnswer();
  if (outcome === 'network') return HttpResponse.error();
  if (outcome === '4xx') return badRequest('scenario: the submission was rejected');
  if (outcome === '500') return unavailable('submit');
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('body must be valid JSON');
  }
  const parsed = submitMatchRequestSchema.safeParse(body);
  if (!parsed.success) return badRequest('invalid match record');
  const record = parsed.data;
  if (outcome === 'timeout-after-write') {
    // the record lands, but the answer never arrives — a resend of the
    // same id finds the existing record and clears
    insertIfAbsent(record);
    return neverAnswer();
  }
  const isNew = !records.some((r) => r.id === record.id);
  const stored: MatchRecord = insertIfAbsent(record);
  return HttpResponse.json(stored, { status: isNew ? 201 : 200 });
});

export const handlers = [rankingHandler, historyHandler, submitHandler];
