import type { GameConfig } from '../../config/gameConfig';
import type { InputState } from '../../input/inputState';
import { distance, normalizeAngle } from '../math';
import type { Ship } from '../types';

/**
 * Computes the controls of one enemy for this step:
 * - chaser: always turns toward the player and advances (contact = explosion);
 * - shooter: turns toward the player, advances until inside attack range,
 *   then stops and fires (cooldown handled by the weapon system).
 * Island avoidance is implicit: the collision grid pushes the ship out and
 * the AI keeps trying (a simple "stop against the island" for now).
 */
export function enemyControls(ship: Ship, player: Ship, config: GameConfig): InputState {
  const desired = Math.atan2(
    player.position.y - ship.position.y,
    player.position.x - ship.position.x,
  );
  const error = normalizeAngle(desired - ship.angle);
  const controls: InputState = {
    thrust: false,
    turnLeft: error < 0,
    turnRight: error > 0,
    fireFront: false,
    fireLeft: false,
    fireRight: false,
  };

  if (ship.kind === 'chaser') {
    controls.thrust = true;
    return controls;
  }

  // shooter
  const dist = distance(ship.position, player.position);
  controls.thrust = dist > config.shooter.attackRange;
  controls.fireFront = dist <= config.shooter.attackRange;
  return controls;
}
