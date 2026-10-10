import type { MatchState } from '../game/types';

/**
 * The slice of the match the React side (HUD, pause, result) reads.
 */
export interface MatchView {
  score: number;
  timeLeftSec: number;
  /** player hull points; the HUD bar reads the pair */
  hp: number;
  maxHp: number;
  status: MatchState['status'];
  /** why the match ended, null while it runs (the result flow reads it) */
  endReason: MatchState['endReason'];
}

/**
 * The clock is allowed to republish at this cadence (~250 ms per the
 * spec) — score/health/status publish the frame they change. A frame
 * where nothing changed publishes nothing; this is never per-frame.
 */
const TIME_PUBLISH_INTERVAL_SEC = 0.25;

/**
 * Decides *when* the simulation's per-frame snapshot reaches React: on any
 * state change (score, player health, status) or at the time cadence above
 * while the clock actually moves. Feed it once per frame.
 */
export class MatchPublisher {
  private readonly publishFn: (view: MatchView) => void;
  private last: MatchView | null = null;
  private sinceTimePublishSec = 0;

  constructor(publish: (view: MatchView) => void) {
    this.publishFn = publish;
  }

  /** Call once per frame with the fresh snapshot and the clamped frame delta. */
  push(snapshot: MatchState, deltaSec: number): void {
    const player = snapshot.ships.find((ship) => ship.kind === 'player');
    const view: MatchView = {
      score: snapshot.score,
      timeLeftSec: snapshot.timeLeft,
      hp: player?.hp ?? 0,
      maxHp: player?.maxHp ?? 0,
      status: snapshot.status,
      endReason: snapshot.endReason,
    };

    if (!this.last) {
      // first frame always publishes, so React never renders a stale zero
      this.publishFn(view);
      this.last = view;
      return;
    }

    const stateChanged =
      view.score !== this.last.score ||
      view.hp !== this.last.hp ||
      view.status !== this.last.status ||
      view.endReason !== this.last.endReason;
    const timeMoved = view.timeLeftSec !== this.last.timeLeftSec;
    this.sinceTimePublishSec += deltaSec;
    // epsilon absorbs the fixed-step float sum (15 × 1/60 lands a hair
    // under 0.25 and would otherwise miss the exact tick)
    const cadenceDue = this.sinceTimePublishSec >= TIME_PUBLISH_INTERVAL_SEC - 1e-9;

    if (stateChanged || (timeMoved && cadenceDue)) {
      this.publishFn(view);
      this.last = view;
      if (cadenceDue) this.sinceTimePublishSec = 0;
    }
  }
}
