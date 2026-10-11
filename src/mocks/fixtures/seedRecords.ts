import type { EndReason, MatchConfig, MatchRecord } from '../../api/contracts';
import { insertIfAbsent } from '../db';
import { FIXTURE_PLAYERS } from './players';

/**
 * 28 seeded matches across three configs. The spread gives every ranking
 * multiple pages, and the deliberate ties exercise the ranking rules:
 * score desc → durationSeconds asc → playedAt asc → id asc.
 */
export const SEED_CONFIGS = {
  /** the out-of-the-box options */
  default: { sessionTimeSec: 120, spawnIntervalSec: 3 },
  /** shorter session, slower spawns */
  short: { sessionTimeSec: 60, spawnIntervalSec: 5 },
  /** marathon session */
  long: { sessionTimeSec: 180, spawnIntervalSec: 3 },
} satisfies Record<string, MatchConfig>;

type SeedRow = readonly [
  id: string,
  playerIndex: number,
  playedAt: string,
  score: number,
  durationSeconds: number,
  endReason: EndReason,
];

const DEFAULT_ROWS: readonly SeedRow[] = [
  ['aa000000-0000-4000-8000-000000000001', 0, '2026-09-01T09:00:00.000Z', 4, 120, 'time'],
  ['aa000000-0000-4000-8000-000000000002', 1, '2026-09-03T14:30:00.000Z', 7, 61.2, 'death'],
  ['aa000000-0000-4000-8000-000000000003', 2, '2026-09-05T11:15:00.000Z', 2, 120, 'time'],
  ['aa000000-0000-4000-8000-000000000004', 3, '2026-09-07T19:45:00.000Z', 11, 88.4, 'death'],
  ['aa000000-0000-4000-8000-000000000005', 4, '2026-09-09T08:20:00.000Z', 0, 34.7, 'death'],
  ['aa000000-0000-4000-8000-000000000006', 5, '2026-09-11T16:05:00.000Z', 9, 120, 'time'],
  ['aa000000-0000-4000-8000-000000000007', 6, '2026-09-13T12:40:00.000Z', 5, 72.9, 'death'],
  ['aa000000-0000-4000-8000-000000000008', 7, '2026-09-15T20:10:00.000Z', 12, 120, 'time'],
  ['aa000000-0000-4000-8000-000000000009', 0, '2026-09-18T10:00:00.000Z', 6, 45.3, 'death'],
  ['aa000000-0000-4000-8000-00000000000a', 1, '2026-09-21T13:25:00.000Z', 3, 120, 'time'],
  ['aa000000-0000-4000-8000-00000000000b', 2, '2026-09-24T17:55:00.000Z', 8, 97.6, 'death'],
  ['aa000000-0000-4000-8000-00000000000c', 3, '2026-09-27T09:35:00.000Z', 1, 18.2, 'death'],
  ['aa000000-0000-4000-8000-00000000000d', 2, '2026-09-30T15:50:00.000Z', 10, 120, 'time'],
  ['aa000000-0000-4000-8000-00000000000e', 5, '2026-10-02T11:05:00.000Z', 4, 66.1, 'death'],
  ['aa000000-0000-4000-8000-00000000000f', 6, '2026-10-04T18:15:00.000Z', 7, 120, 'time'],
  ['aa000000-0000-4000-8000-000000000010', 7, '2026-10-06T08:45:00.000Z', 2, 25.8, 'death'],
];

const SHORT_ROWS: readonly SeedRow[] = [
  ['bb000000-0000-4000-8000-000000000005', 5, '2026-09-16T09:00:00.000Z', 8, 50.1, 'death'],
  ['bb000000-0000-4000-8000-000000000006', 6, '2026-09-18T12:00:00.000Z', 7, 60, 'time'],
  // score-5 tie group: b4 < b1 (duration), b1 < b2/b3 (playedAt), b2 < b3 (id)
  ['bb000000-0000-4000-8000-0000000000b4', 0, '2026-09-22T10:00:00.000Z', 5, 39.9, 'death'],
  ['bb000000-0000-4000-8000-0000000000b1', 1, '2026-09-20T10:00:00.000Z', 5, 40, 'death'],
  ['bb000000-0000-4000-8000-0000000000b2', 2, '2026-09-21T10:00:00.000Z', 5, 40, 'death'],
  ['bb000000-0000-4000-8000-0000000000b3', 3, '2026-09-21T10:00:00.000Z', 5, 40, 'death'],
  ['bb000000-0000-4000-8000-000000000007', 6, '2026-09-25T12:00:00.000Z', 3, 60, 'time'],
  ['bb000000-0000-4000-8000-000000000008', 7, '2026-09-28T12:00:00.000Z', 1, 12.4, 'death'],
];

const LONG_ROWS: readonly SeedRow[] = [
  ['cc000000-0000-4000-8000-0000000000c1', 0, '2026-10-08T10:00:00.000Z', 6, 180, 'time'],
  ['cc000000-0000-4000-8000-0000000000c2', 1, '2026-10-07T09:00:00.000Z', 2, 91.5, 'death'],
  ['cc000000-0000-4000-8000-0000000000c3', 2, '2026-10-05T08:30:00.000Z', 9, 180, 'time'],
  ['cc000000-0000-4000-8000-0000000000c4', 3, '2026-10-03T21:15:00.000Z', 0, 7.3, 'death'],
];

/** The fixed uuid roster makes every fixture record fully reproducible. */
function playerAt(index: number): { playerId: string; playerName: string } {
  const player = FIXTURE_PLAYERS[index];
  if (player === undefined) throw new Error(`seedRecords: no fixture player at index ${index}`);
  return player;
}

function build(rows: readonly SeedRow[], config: MatchConfig): MatchRecord[] {
  return rows.map(([id, playerIndex, playedAt, score, durationSeconds, endReason]) => ({
    id,
    playerId: playerAt(playerIndex).playerId,
    playerName: playerAt(playerIndex).playerName,
    playedAt,
    score,
    durationSeconds,
    endReason,
    config,
  }));
}

/** The full fixture set (16 default + 8 short + 4 long). */
export const SEED_RECORDS: readonly MatchRecord[] = [
  ...build(DEFAULT_ROWS, SEED_CONFIGS.default),
  ...build(SHORT_ROWS, SEED_CONFIGS.short),
  ...build(LONG_ROWS, SEED_CONFIGS.long),
];

/**
 * Idempotently seeds the mock db: existing ids (already persisted from a
 * previous session) come back untouched, so calling this at every startup
 * never duplicates a record.
 */
export function seedRecords(): MatchRecord[] {
  return SEED_RECORDS.map((record) => insertIfAbsent(record));
}
