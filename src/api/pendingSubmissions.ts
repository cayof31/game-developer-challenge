import axios from 'axios';
import { z } from 'zod';
import { matchRecordSchema, type MatchRecord } from './contracts';
import { httpClient } from './httpClient';
import { queryClient } from './queryClient';
import { queryKeys } from './queryKeys';

/**
 * The pending-submissions queue: finished matches that still need to
 * reach the API, persisted in localStorage and indexed by match id, so
 * a tab closed mid-send never loses a record. A record enters the queue
 * before its first send, leaves it on success, waits in it across
 * retryable failures (network, timeout, 5xx — retried on an exponential
 * schedule) and parks in `failed` on a 4xx: repeating those is
 * pointless, so a rejected record waits for the manual "Try again"
 * instead. The queue holds any number of items and sends each one
 * separately.
 */

export type SubmissionState = 'pending' | 'sending' | 'failed';

export interface PendingSubmission {
  record: MatchRecord;
  state: SubmissionState;
  /** failed attempts so far — drives the escalating retry schedule */
  attempts: number;
  /** why the server rejected the record; set in the `failed` state */
  error?: string;
}

/** Versioned storage key — bump `@N` when the shape changes. */
const STORAGE_KEY = 'pirate-battle/pending-submissions@1';

const submissionSchema = z.object({
  record: matchRecordSchema,
  state: z.enum(['pending', 'sending', 'failed']),
  attempts: z.number().int().min(0),
  error: z.string().optional(),
});

/** One queued submission per match id. */
type SubmissionQueue = Record<string, PendingSubmission>;

/** Reads the persisted queue; malformed data simply starts empty. */
function hydrate(): SubmissionQueue {
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return {};
    const parsed = z.record(z.string(), submissionSchema).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

let queue: SubmissionQueue = hydrate();

/** Persists the whole queue; never throws (storage may be blocked/full). */
function persist(): void {
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // storage unavailable — the in-memory queue still serves this session
  }
}

const listeners = new Set<() => void>();

/** Replaces the queue, persists it and wakes every subscriber. */
function commit(next: SubmissionQueue): void {
  queue = next;
  persist();
  for (const listener of listeners) listener();
}

/** Observes the whole queue — any change wakes every subscriber. */
export function subscribeSubmissions(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The queued submission for a match id, if it still needs attention. */
export function getSubmission(id: string): PendingSubmission | null {
  return queue[id] ?? null;
}

/** Queues a record; an id already queued (any state) is left alone. */
export function enqueueSubmission(record: MatchRecord): void {
  if (queue[record.id] !== undefined) return;
  commit({ ...queue, [record.id]: { record, state: 'pending', attempts: 0 } });
}

/** POST with the same contract discipline as every other API call. */
async function postMatch(record: MatchRecord): Promise<void> {
  const { data } = await httpClient.post('/matches', record);
  matchRecordSchema.parse(data);
}

/** Retryable: no response at all (network/timeout) or a 5xx. A 4xx is final. */
function isRetryable(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return true; // unexpected — keep the record
  return error.response === undefined || error.response.status >= 500;
}

/** Exponential backoff: 1s, 2s, 4s, … capped at ~30s. */
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 30_000;

/** One failure waits the base step, two wait double, and so on. */
function retryDelayMs(attempts: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** Math.max(attempts - 1, 0), RETRY_MAX_MS);
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
/** Ids currently in flight — no id ever flies twice at once. */
const inFlight = new Set<string>();

function scheduleRetry(id: string): void {
  const entry = queue[id];
  if (entry === undefined || entry.state !== 'pending') return;
  const previous = timers.get(id);
  if (previous !== undefined) clearTimeout(previous);
  const delay = retryDelayMs(entry.attempts);
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id);
      // fire-and-forget: the queue records the outcome either way
      void sendPending(id).catch(() => {});
    }, delay),
  );
}

/**
 * Sends one queued record now: claims the entry (pending → sending) and
 * joins the in-flight lock, so the same id never flies twice at once —
 * overlapping triggers (timers, focus, connection, clicks) collapse into
 * one POST. It removes the record on success — also refreshing both
 * lists, on every success path, scheduled or manual — and on failure
 * either re-queues it with the escalating retry or parks it as `failed`
 * when the server said no for good. The queue keeps the record either
 * way; the rejection is rethrown so callers can observe the attempt.
 */
export async function sendPending(id: string): Promise<void> {
  const entry = queue[id];
  if (entry === undefined || entry.state !== 'pending' || inFlight.has(id)) return;
  inFlight.add(id);
  commit({ ...queue, [id]: { ...entry, state: 'sending' } });
  try {
    await postMatch(entry.record);
    const next = { ...queue };
    delete next[id];
    commit(next);
    void queryClient.invalidateQueries({ queryKey: queryKeys.rankingPrefix });
    void queryClient.invalidateQueries({ queryKey: queryKeys.historyPrefix });
  } catch (error) {
    const current = queue[id];
    if (current !== undefined) {
      if (isRetryable(error)) {
        commit({ ...queue, [id]: { ...current, state: 'pending', attempts: current.attempts + 1 } });
        scheduleRetry(id);
      } else {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        commit({
          ...queue,
          [id]: {
            ...current,
            state: 'failed',
            attempts: current.attempts + 1,
            error:
              status === undefined
                ? 'The server rejected the submission.'
                : `The server rejected the submission (${status}).`,
          },
        });
      }
    }
    throw error;
  } finally {
    inFlight.delete(id);
  }
}

/** The manual "Try again" button: a failed entry goes back into circulation. */
export function retrySubmission(id: string): void {
  const entry = queue[id];
  if (entry === undefined || entry.state !== 'failed') return;
  const previous = timers.get(id);
  if (previous !== undefined) clearTimeout(previous);
  commit({ ...queue, [id]: { ...entry, state: 'pending', error: undefined } });
  // fire-and-forget: the Result screen reads the outcome from the queue
  void sendPending(id).catch(() => {});
}

/**
 * Walks the queue and resends every waiting item — one POST each,
 * nothing batched; a 4xx-rejected entry is left for the manual button.
 * Runs on app open, when the connection returns and when the page
 * regains focus; overlapping flushes are harmless, the in-flight lock
 * keeps an id from flying twice.
 */
export function flushSubmissions(): void {
  for (const [id, entry] of Object.entries(queue)) {
    if (entry.state !== 'pending') continue;
    // fire-and-forget: each entry records its own outcome in the queue
    void sendPending(id).catch(() => {});
  }
}

/** Forgets every queued submission (the debug Reset): emptied, persisted, announced. */
export function clearSubmissions(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  commit({});
}

// Boot recovery: a tab closed mid-send leaves a stale `sending` entry —
// it never got an answer, so it returns to circulation, and every
// pending entry has its retry scheduled again.
{
  let recovered: SubmissionQueue | null = null;
  for (const [id, entry] of Object.entries(queue)) {
    if (entry.state === 'sending') {
      recovered ??= { ...queue };
      recovered[id] = { ...entry, state: 'pending' };
    }
  }
  if (recovered !== null) commit(recovered);
}
for (const id of Object.keys(queue)) scheduleRetry(id);
