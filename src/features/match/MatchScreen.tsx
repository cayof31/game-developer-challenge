import { useEffect, useState } from 'react';
import { useGameStore } from '../../bridge/gameStore';
import { gameConfig, withOptions } from '../../config/gameConfig';
import { usePageVisibility } from '../../hooks/usePageVisibility';
import { loadOptions } from '../options/optionsStorage';
import { saveLastResult } from '../result/lastResultStorage';
import { A11yStatus } from './A11yStatus';
import { Hud } from './Hud';
import { LoadingOverlay } from './LoadingOverlay';
import { PauseDialog } from './PauseDialog';
import { TouchControls } from './TouchControls';
import { useGameSession } from './useGameSession';
import './MatchScreen.css';

interface MatchScreenProps {
  /** Main Menu action: the owner switches screens (this unmounts the game) */
  onExit: () => void;
  /** the match ended: the result was stored, now show the Result screen */
  onFinish: () => void;
}

/**
 * Hosts one match run. Restart remounts the session through the run key,
 * so React tears the previous game down via the same Strict-Mode-proven
 * effect cleanup and builds a fresh one (assets resolve from cache).
 */
export function MatchScreen({ onExit, onFinish }: MatchScreenProps) {
  const [runId, setRunId] = useState(0);
  return (
    <MatchSession
      key={runId}
      onExit={onExit}
      onFinish={onFinish}
      onRestart={() => setRunId((id) => id + 1)}
    />
  );
}

interface MatchSessionProps {
  onExit: () => void;
  onFinish: () => void;
  onRestart: () => void;
}

/**
 * One live match: the canvas host, the loading phases, the HUD inside the
 * arena area and the pause layer. Pause can come from the HUD button, the
 * Esc/P keys or a hidden/blurred page; resuming is always a click on the
 * dialog (Esc is blocked there), and the simulation clears input state on
 * the way back so nothing from the paused period leaks into combat.
 */
function MatchSession({ onExit, onFinish, onRestart }: MatchSessionProps) {
  const { phase, progress, error, retry, containerRef, pause, resume } = useGameSession();
  const status = useGameStore((state) => state.status);
  const pageActive = usePageVisibility();

  // Auto-pause: the tab hid or the window lost focus. Nothing ever
  // auto-resumes — coming back only re-shows the dialog.
  useEffect(() => {
    if (phase === 'ready' && !pageActive) pause();
  }, [phase, pageActive, pause]);

  // Manual pause by key: Esc or P. While paused this is a no-op — the
  // dialog swallows Esc and resuming requires clicking Resume.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'p' || event.key === 'P') pause();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pause]);

  // A finished match records its result (the Result screen reads storage
  // on mount, so the write happens before navigating) and leaves combat.
  // Abandoned matches never reach 'ended', so they are never written.
  useEffect(() => {
    if (phase !== 'ready' || status !== 'ended') return;
    const { score, timeLeftSec, endReason } = useGameStore.getState();
    // The same options the session was built with (storage cannot change
    // mid-match), so the recorded time matches the HUD countdown.
    const { match } = withOptions(gameConfig, loadOptions());
    saveLastResult({
      score,
      timePlayedSec: Math.max(0, Math.round(match.sessionTimeSec - timeLeftSec)),
      // the simulation always sets the reason together with 'ended'
      endReason: endReason ?? 'time',
      finishedAt: new Date().toISOString(),
    });
    onFinish();
  }, [phase, status, onFinish]);

  const paused = phase === 'ready' && status === 'paused';

  return (
    <div className="match-screen">
      <div ref={containerRef} className="match-screen__canvas" />
      <div className="match-screen__stage">
        {phase === 'ready' && (
          <>
            <Hud onPause={pause} />
            <TouchControls />
            <A11yStatus />
          </>
        )}
      </div>
      {phase !== 'ready' && (
        <LoadingOverlay phase={phase} progress={progress} error={error} onRetry={retry} />
      )}
      <PauseDialog open={paused} onResume={resume} onRestart={onRestart} onMainMenu={onExit} />
      {/* landscape is the supported orientation on mobile; shown by CSS in portrait */}
      <p className="rotate-warning">Rotate your device</p>
    </div>
  );
}

export default MatchScreen;
