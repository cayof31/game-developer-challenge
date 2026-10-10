import type { GameConfig } from '../../config/gameConfig';
import type { Ship, Vec2 } from '../types';

/** Chasers pursue the player and explode on contact. */
export function createChaser(config: GameConfig, spawn: Vec2, id: number, angle: number): Ship {
  return {
    id,
    kind: 'chaser',
    position: { ...spawn },
    angle,
    hp: config.chaser.maxHp,
    maxHp: config.chaser.maxHp,
    alive: true,
    shootCooldown: 0,
    sideCooldown: 0,
  };
}
