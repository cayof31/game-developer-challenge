import type { GameConfig } from '../../config/gameConfig';
import type { Ship, Vec2 } from '../types';

/** The player is always ship id 1, starting at the arena spawn point. */
export function createPlayer(config: GameConfig, spawn: Vec2): Ship {
  return {
    id: 1,
    kind: 'player',
    position: { ...spawn },
    angle: 0,
    hp: config.player.maxHp,
    maxHp: config.player.maxHp,
    alive: true,
    shootCooldown: 0,
    sideCooldown: 0,
  };
}
