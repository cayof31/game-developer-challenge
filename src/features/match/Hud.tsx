import { useGameStore } from "../../bridge/gameStore";
import "./Hud.css";

const HUD = "/assets/png/default/ui/hud";
const CONTROLS = "/assets/png/default/ui/controls";

// Health bar color bands, mirroring the ship views (presentation).
const AMBER_THRESHOLD = 0.6;
const RED_THRESHOLD = 0.3;

function formatTime(totalSec: number): string {
  const seconds = Math.max(0, Math.ceil(totalSec));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

interface HudProps {
  /** wired to the pause dialog in a later step */
  onPause: () => void;
}

/**
 * Combat HUD: score, hull, remaining time and the pause button. It sits
 * absolutely over the canvas inside the arena's letterboxed area (the
 * stage element tracks the same contain-scale box as the renderer, and the
 * padding adds the mobile safe areas).
 *
 * Every value subscribes with its own selector — a clock tick re-renders
 * the clock, not the score. No aria-live here: ticking values must never
 * announce (the a11y status layer owns the few events worth announcing).
 */
export function Hud({ onPause }: HudProps) {
  const score = useGameStore((state) => state.score);
  const timeLeftSec = useGameStore((state) => state.timeLeftSec);
  const hp = useGameStore((state) => state.hp);
  const maxHp = useGameStore((state) => state.maxHp);

  const ratio = maxHp > 0 ? Math.min(1, Math.max(0, hp / maxHp)) : 0;
  const fill =
    ratio > AMBER_THRESHOLD ? "green" : ratio > RED_THRESHOLD ? "amber" : "red";

  return (
    <div className="hud" role="group" aria-label="Match status">
      <div className="hud__side">
        <div className="hud__health">
          <img className="hud__heart" src={`${HUD}/icon_heart.png`} alt="" />
          <span className="hud__bar">
            <img
              className="hud__bar-frame"
              src={`${HUD}/health_frame.png`}
              alt=""
            />
            <span
              className="hud__bar-fill"
              style={{ width: `${ratio * 100}%` }}
            >
              <img src={`${HUD}/health_fill_${fill}.png`} alt="" />
            </span>
          </span>
          <span className="hud__sr">{Math.round(ratio * 100)}% hull</span>
        </div>
      </div>
      <div className="hud__side hud__side--right">
        <div className="hud__counter">
          <img className="hud__icon" src={`${HUD}/icon_score.png`} alt="" />
          <span className="hud__sr">Score</span>
          <span className="hud__value">{score}</span>
        </div>
        <div className="hud__counter">
          <img className="hud__icon" src={`${HUD}/icon_time.png`} alt="" />
          <span className="hud__sr">Time</span>
          <span className="hud__value">{formatTime(timeLeftSec)}</span>
        </div>
        <button
          type="button"
          className="hud__pause"
          aria-label="Pause"
          onClick={onPause}
        >
          <img src={`${CONTROLS}/icon_pause.png`} alt="" />
        </button>
      </div>
    </div>
  );
}

export default Hud;
