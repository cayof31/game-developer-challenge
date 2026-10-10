import type { GameConfig } from '../../config/gameConfig';
import type { Ship, Vec2 } from '../types';

/** Shooters approach the player and fire from inside their attack range. */
export function createShooter(config: GameConfig, spawn: Vec2, id: number, angle: number): Ship {
  return {
    id,
    kind: 'shooter',
    position: { ...spawn },
    angle,
    hp: config.shooter.maxHp,
    maxHp: config.shooter.maxHp,
    alive: true,
    shootCooldown: 0,
    sideCooldown: 0,
  };
}
