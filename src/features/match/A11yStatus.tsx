import { useEffect, useState } from 'react';
import { useGameStore } from '../../bridge/gameStore';
import './A11yStatus.css';

// Mirrors the red band from the HUD and ship views: "low health" territory.
const LOW_HEALTH_THRESHOLD = 0.3;

/**
 * The match's semantic layer: one polite live region that speaks only on
 * real events — start, pause/resume, low health, end. It never tracks the
 * clock or the score (those stay readable as plain HUD text without
 * aria-live), so a screen reader hears nothing between events.
 */
export function A11yStatus() {
  const [announcement, setAnnouncement] = useState('Match started.');

  useEffect(() => {
    const unsubscribe = useGameStore.subscribe((state, previous) => {
      if (state.status !== previous.status) {
        if (state.status === 'paused') {
          setAnnouncement('Match paused.');
        } else if (state.status === 'ended') {
          setAnnouncement(`Match ended. Final score ${state.score}.`);
        } else if (state.status === 'running' && previous.status === 'paused') {
          setAnnouncement('Match resumed.');
        }
        return; // a status event supersedes hp movement in the same snapshot
      }
      if (state.maxHp === 0 || previous.maxHp === 0) return; // pre-match placeholder
      const lowNow = state.hp / state.maxHp <= LOW_HEALTH_THRESHOLD;
      const wasLow = previous.hp / previous.maxHp <= LOW_HEALTH_THRESHOLD;
      if (lowNow && !wasLow) setAnnouncement('Low health.'); // crossing only, once
    });
    return unsubscribe;
  }, []);

  return (
    <div className="a11y-status" role="status" aria-live="polite">
      {announcement}
    </div>
  );
}

export default A11yStatus;
