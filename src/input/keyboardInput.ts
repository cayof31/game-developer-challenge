import { createInputState, type InputState } from './inputState';

/**
 * Physical keys (e.code — layout independent: W stays W on AZERTY),
 * matching the scheme shown in the menu's Controls help.
 */
const KEY_BINDINGS: Readonly<Record<string, keyof InputState>> = {
  KeyW: 'thrust',
  ArrowUp: 'thrust',
  KeyA: 'turnLeft',
  ArrowLeft: 'turnLeft',
  KeyD: 'turnRight',
  ArrowRight: 'turnRight',
  Space: 'fireFront',
  KeyQ: 'fireLeft',
  KeyE: 'fireRight',
};

// What the keys currently hold: written by the window listeners, merged
// with the touch state once per frame by the game session.
const state = createInputState();

/** Drop everything — no key may stay "stuck" (pause, blur, leaving). */
export function releaseAllKeyboard(): void {
  for (const control of Object.keys(state) as (keyof InputState)[]) {
    state[control] = false;
  }
}

/** Immutable snapshot for the game loop. */
export function readKeyboardInput(): InputState {
  return { ...state };
}

/**
 * Capture the game keys while isActive() is true: captured keys are
 * preventDefault-ed (no page scroll or browser default for the scheme).
 * While inactive — the pause dialog owns the keyboard — they pass through
 * untouched, so Enter/Space still activate its buttons. The returned
 * detach removes both listeners and releases anything held: listeners
 * exist only while the match screen is the active gameplay context.
 */
export function attachKeyboard(target: Window, isActive: () => boolean): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    const control = KEY_BINDINGS[event.code];
    if (!control) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return; // keep browser shortcuts
    if (!isActive()) return; // paused: the dialog gets the keys instead
    event.preventDefault();
    state[control] = true;
  };
  const onKeyUp = (event: KeyboardEvent) => {
    const control = KEY_BINDINGS[event.code];
    if (!control) return;
    state[control] = false; // releases unconditionally — a missed one would stick
  };
  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  return () => {
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('keyup', onKeyUp);
    releaseAllKeyboard();
  };
}
