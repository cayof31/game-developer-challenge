import type { GameConfig } from '../../config/gameConfig';
import type { Projectile, Ship } from '../types';

/**
 * Points awarded for a kill: only enemies destroyed by the player's
 * projectiles count. A chaser exploding against the player — or any
 * enemy-side hit — scores nothing.
 */
export function scoreForKill(config: GameConfig, projectile: Projectile, victim: Ship): number {
  const playerKill = projectile.owner === 'player' && victim.kind !== 'player';
  return playerKill ? config.match.pointsPerKill : 0;
}
