import type { InputState } from '../../input/inputState';
import { vectorFromAngle } from '../math';
import type { Ship, Vec2 } from '../types';

export interface WeaponParams {
  /** seconds between front shots */
  frontCooldownSec: number;
  /** seconds between broadsides (left and right share it) */
  sideCooldownSec: number;
  /** projectiles per broadside */
  sideShotCount: number;
  /** spacing between parallel broadside shots (px) */
  sideShotOffset: number;
  /** distance from the ship center where the front shot is born (px) */
  muzzleDistance: number;
}

/**
 * Ticks the weapon cooldowns and fires on input, one volley per ready weapon:
 * - front: a single projectile along the facing angle;
 * - sides: `sideShotCount` parallel projectiles perpendicular to the facing
 *   direction — left is angle − PI/2, right is angle + PI/2 — spaced
 *   `sideShotOffset` apart along the ship's axis.
 * The `spawn` callback creates the projectile (owner and stats chosen by caller).
 */
export function weaponSystem(
  ship: Ship,
  input: InputState,
  dt: number,
  params: WeaponParams,
  spawn: (position: Vec2, angle: number) => void,
): void {
  ship.shootCooldown = Math.max(0, ship.shootCooldown - dt);
  ship.sideCooldown = Math.max(0, ship.sideCooldown - dt);

  if (input.fireFront && ship.shootCooldown <= 0) {
    const muzzle = vectorFromAngle(ship.angle, params.muzzleDistance);
    spawn(
      { x: ship.position.x + muzzle.x, y: ship.position.y + muzzle.y },
      ship.angle,
    );
    ship.shootCooldown = params.frontCooldownSec;
  }

  if ((input.fireLeft || input.fireRight) && ship.sideCooldown <= 0) {
    if (input.fireLeft) {
      fireBroadside(ship, -Math.PI / 2, params, spawn);
    }
    if (input.fireRight) {
      fireBroadside(ship, Math.PI / 2, params, spawn);
    }
    ship.sideCooldown = params.sideCooldownSec;
  }
}

function fireBroadside(
  ship: Ship,
  sideOffsetAngle: number,
  params: WeaponParams,
  spawn: (position: Vec2, angle: number) => void,
): void {
  const angle = ship.angle + sideOffsetAngle;
  const axis = vectorFromAngle(ship.angle, 1);
  const middle = (params.sideShotCount - 1) / 2;
  for (let i = 0; i < params.sideShotCount; i += 1) {
    const offset = (i - middle) * params.sideShotOffset;
    spawn(
      { x: ship.position.x + axis.x * offset, y: ship.position.y + axis.y * offset },
      angle,
    );
  }
}
