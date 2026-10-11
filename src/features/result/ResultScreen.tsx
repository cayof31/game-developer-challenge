import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '../../components/Button';
import { getSubmission, retrySubmission, subscribeSubmissions } from '../../api/pendingSubmissions';
import { loadLastResult, type LastMatchResult } from './lastResultStorage';
import './ResultScreen.css';

const END_REASON_LABEL: Record<LastMatchResult['endReason'], string> = {
  time: 'Time expired',
  death: 'Ship destroyed',
};

function formatTime(totalSec: number): string {
  const seconds = Math.max(0, Math.round(totalSec));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

interface ResultScreenProps {
  onPlayAgain: () => void;
  onMainMenu: () => void;
}

/**
 * The completed match's result: read from lastResultStorage when the
 * screen mounts, so it survives a refresh (the app reopens this screen
 * whenever a result is stored). Registration mirrors the pending queue
 * — the match was queued when it ended, so this screen only observes:
 * Saving… while it goes out, Pending, will retry while the queue waits
 * for a scheduled attempt, the error with a manual "Try again" when the
 * server rejected it, and Saved once the record landed and left the
 * queue.
 */
export function ResultScreen({ onPlayAgain, onMainMenu }: ResultScreenProps) {
  const [result] = useState(() => loadLastResult());
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  // the queue is the source of truth for the submission's fate
  const submission = useSyncExternalStore(
    subscribeSubmissions,
    () => (result === null ? null : getSubmission(result.id)),
    () => (result === null ? null : getSubmission(result.id)),
  );

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const failed = submission?.state === 'failed';
  const statusText =
    submission === null
      ? 'Saved'
      : submission.state === 'sending' || submission.attempts === 0
        ? 'Saving…'
        : 'Pending, will retry';
  const statusClass =
    submission === null
      ? 'result__status result__status--saved'
      : submission.state !== 'sending' && submission.attempts > 0
        ? 'result__status result__status--pending'
        : 'result__status';

  return (
    <main className="screen">
      <section className="panel result">
        <h1 className="result__title" tabIndex={-1} ref={titleRef}>
          Result
        </h1>
        {result === null ? (
          <p className="result__empty">No completed match recorded yet.</p>
        ) : (
          <dl className="result__stats">
            <div className="result__row">
              <dt>Score</dt>
              <dd>{result.score}</dd>
            </div>
            <div className="result__row">
              <dt>Time played</dt>
              <dd>{formatTime(result.timePlayedSec)}</dd>
            </div>
            <div className="result__row">
              <dt>End reason</dt>
              <dd>{END_REASON_LABEL[result.endReason]}</dd>
            </div>
            <div className="result__row">
              <dt>Registration</dt>
              <dd>
                {failed ? (
                  <span className="result__registration">
                    
                    <Button variant="secondary" onClick={() => void retrySubmission(result.id)}>
                      Try again
                    </Button>
                  </span>
                ) : (
                  <span className={statusClass}>{statusText}</span>
                )}
              </dd>
            </div>
            {failed && (
              <span className="result__status result__status--failed">
                {submission?.error ?? 'The server rejected the submission.'}
              </span>
            )}
          </dl>
        )}
        <div className="result__actions">
          <button type="button" className="btn btn--primary" onClick={onPlayAgain}>
            Play Again
          </button>
          <button type="button" className="btn btn--secondary" onClick={onMainMenu}>
            Main Menu
          </button>
        </div>
      </section>
    </main>
  );
}

export default ResultScreen;
