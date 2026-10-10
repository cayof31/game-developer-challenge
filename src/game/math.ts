import type { Vec2 } from './types';

/** Euclidean distance between two points (px). */
export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Keeps a value inside [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Wraps an angle to (-PI, PI]. */
export function normalizeAngle(angle: number): number {
  const twoPi = Math.PI * 2;
  return ((((angle + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
}

/** Unit direction of `angle` scaled by `length`. */
export function vectorFromAngle(angle: number, length = 1): Vec2 {
  return { x: Math.cos(angle) * length, y: Math.sin(angle) * length };
}
