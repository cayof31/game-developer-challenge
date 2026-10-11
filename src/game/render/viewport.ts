import { clamp } from '../math';
import type { Vec2 } from '../types';

/**
 * Pure viewport math for the logical world (the Tiled map's world) seen through the
 * logical view window (config.view). The renderer feeds a host size in and
 * gets the world container's scale/position back — no DOM, no Pixi, fully
 * testable.
 */

export interface ViewportTransform {
  /** uniform scale applied to the world container */
  readonly scale: number;
  /** view-to-host offset in screen px (letterbox margins) */
  readonly x: number;
  readonly y: number;
}

/**
 * Scales the view uniformly to fit the host (contain) and centers it —
 * letterbox bars appear on whichever axis has spare room, including when
 * the host is smaller than the view (the whole view stays visible).
 */
export function computeLetterbox(
  hostWidth: number,
  hostHeight: number,
  viewWidth: number,
  viewHeight: number,
): ViewportTransform {
  const scale = Math.min(hostWidth / viewWidth, hostHeight / viewHeight);
  return {
    scale,
    x: (hostWidth - viewWidth * scale) / 2,
    y: (hostHeight - viewHeight * scale) / 2,
  };
}

/**
 * Keeps the camera center inside the world so the view never shows the
 * area beyond the map edges (the world must be at least view-sized).
 */
export function clampCamera(
  camera: Vec2,
  visibleWidth: number,
  visibleHeight: number,
  worldWidth: number,
  worldHeight: number,
): Vec2 {
  return {
    x: clamp(camera.x, visibleWidth / 2, worldWidth - visibleWidth / 2),
    y: clamp(camera.y, visibleHeight / 2, worldHeight - visibleHeight / 2),
  };
}

