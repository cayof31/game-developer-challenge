import { createInputState, type InputState } from './inputState';

/** Which on-screen control a touch button maps to. */
export type TouchControl = keyof InputState;

// What fingers currently hold: written by the pointer handlers in
// TouchControls, read once per frame by the game loop and pushed into the
// simulation with setInput. Kept outside React so several buttons can press
// and release independently at the same time.
const state = createInputState();

/** A finger (or mouse button) went down on the control. */
export function pressTouch(control: TouchControl): void {
  state[control] = true;
}

/** The last pointer left the control (up, cancel or leave). */
export function releaseTouch(control: TouchControl): void {
  state[control] = false;
}

/**
 * Drop everything — called when the page loses focus or the match pauses,
 * so a button can never stay "stuck" down after a lost pointerup.
 */
export function releaseAllTouch(): void {
  for (const control of Object.keys(state) as TouchControl[]) {
    state[control] = false;
  }
}

/** Immutable snapshot for the game loop (the sim never sees the live object). */
export function readTouchInput(): InputState {
  return { ...state };
}
