import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useGameStore } from '../../bridge/gameStore';
import { pressTouch, releaseTouch } from '../../input/touchInput';
import type { TouchControl } from '../../input/touchInput';
import './TouchControls.css';

const CONTROLS = '/assets/png/default/ui/controls';

interface ControlButtonProps {
  control: TouchControl;
  label: string;
  icon: string;
}

/**
 * One momentary on-screen control. It tracks every pointer on it separately
 * (several fingers may hold the same button) and talks to the shared touch
 * state through press/release — never through click, so holding one button
 * while pressing another just works.
 */
function ControlButton({ control, label, icon }: ControlButtonProps) {
  const pointersRef = useRef<Set<number>>(new Set());
  const [active, setActive] = useState(false);

  // A pointerup can go missing (the pause dialog goes inert, the window
  // blurs): any status change away from running drops the held pointers so
  // the button never stays visually stuck. Releasing the shared state on
  // unmount covers leaving the match mid-press.
  useEffect(() => {
    const unsubscribe = useGameStore.subscribe((state, previous) => {
      if (state.status !== previous.status && state.status !== 'running') {
        pointersRef.current.clear();
        setActive(false);
      }
    });
    return () => {
      unsubscribe();
      releaseTouch(control);
    };
  }, [control]);

  const handleDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault(); // no compat mouse events, no text selection
    pointersRef.current.add(event.pointerId);
    pressTouch(control);
    setActive(true);
  };

  const handleRelease = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!pointersRef.current.delete(event.pointerId)) return; // not ours
    if (pointersRef.current.size > 0) return; // another finger still holds
    releaseTouch(control);
    setActive(false);
  };

  return (
    <button
      type="button"
      tabIndex={-1} // pointer-only: keyboard players use the keyboard scheme
      className={active ? 'touch-btn touch-btn--active' : 'touch-btn'}
      aria-label={label}
      onPointerDown={handleDown}
      onPointerUp={handleRelease}
      onPointerCancel={handleRelease}
      onPointerLeave={handleRelease}
    >
      <img src={icon} alt="" />
    </button>
  );
}

/**
 * The mobile control pad: turn left / thrust / turn right on the left,
 * broadside left / fire forward / broadside right on the right. The pad
 * sits inside the arena's letterboxed area and never blocks the canvas
 * outside its buttons.
 */
export function TouchControls() {
  return (
    <div className="touch-controls" role="group" aria-label="Touch controls">
      <div className="touch-controls__cluster">
        <ControlButton control="turnLeft" label="Turn left" icon={`${CONTROLS}/icon_turn_left.png`} />
        <ControlButton control="thrust" label="Thrust" icon={`${CONTROLS}/icon_forward.png`} />
        <ControlButton
          control="turnRight"
          label="Turn right"
          icon={`${CONTROLS}/icon_turn_right.png`}
        />
      </div>
      <div className="touch-controls__cluster">
        <ControlButton
          control="fireLeft"
          label="Fire left broadside"
          icon={`${CONTROLS}/icon_fire_left.png`}
        />
        <ControlButton
          control="fireFront"
          label="Fire forward"
          icon={`${CONTROLS}/icon_fire_front.png`}
        />
        <ControlButton
          control="fireRight"
          label="Fire right broadside"
          icon={`${CONTROLS}/icon_fire_right.png`}
        />
      </div>
    </div>
  );
}

export default TouchControls;
