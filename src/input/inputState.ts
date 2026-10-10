/** Unified control state written by keyboard and touch input. */
export interface InputState {
  /** move forward */
  thrust: boolean;
  /** rotate counter-clockwise on screen (angle decreases) */
  turnLeft: boolean;
  /** rotate clockwise on screen (angle increases) */
  turnRight: boolean;
  /** fire the front cannon */
  fireFront: boolean;
  /** fire the left broadside */
  fireLeft: boolean;
  /** fire the right broadside */
  fireRight: boolean;
}

export function createInputState(): InputState {
  return {
    thrust: false,
    turnLeft: false,
    turnRight: false,
    fireFront: false,
    fireLeft: false,
    fireRight: false,
  };
}

/** Union of two sources (keyboard + touch): held in either → held. */
export function mergeInputs(a: InputState, b: InputState): InputState {
  return {
    thrust: a.thrust || b.thrust,
    turnLeft: a.turnLeft || b.turnLeft,
    turnRight: a.turnRight || b.turnRight,
    fireFront: a.fireFront || b.fireFront,
    fireLeft: a.fireLeft || b.fireLeft,
    fireRight: a.fireRight || b.fireRight,
  };
}
