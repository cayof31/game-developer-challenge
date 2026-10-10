import { useEffect, useRef, useState } from 'react';
import { loadLastResult, type LastMatchResult } from './lastResultStorage';
import './ResultScreen.css';

/**
 * Fixed until the ranking/history API lands: this is the registration
 * field the later step will wire to the network.
 */
const REGISTRATION_STATUS = 'Not registered';

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
 * whenever a result is stored). The title takes focus on open for
 * screen-reader and keyboard users; score, time and reason are plain
 * readable text, never live.
 */
export function ResultScreen({ onPlayAgain, onMainMenu }: ResultScreenProps) {
  const [result] = useState(() => loadLastResult());
  const titleRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

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
              <dd>{REGISTRATION_STATUS}</dd>
            </div>
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
