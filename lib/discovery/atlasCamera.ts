import type { AtlasFlowNode } from './atlasGraph';

/**
 * Camera maths for the native atlas.
 *
 * The web atlas gets pan, zoom and fit-view from React Flow, which is web-only.
 * Native has to do it by hand, so the arithmetic lives here on its own rather
 * than tangled into a gesture handler where it cannot be tested.
 */

export type AtlasCamera = {
  /** Canvas-space offset applied before scaling. */
  x: number;
  y: number;
  scale: number;
};

export type Viewport = { width: number; height: number };

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2.5;

export function clampZoom(
  scale: number,
  minimum: number = MIN_ZOOM,
  maximum: number = MAX_ZOOM
): number {
  // Only NaN is meaningless — it comes from a pinch that began with the two
  // touches already together, dividing by a zero spread. An infinite scale is
  // merely enormous, and the clamp below handles it correctly on its own.
  if (Number.isNaN(scale)) return minimum;
  return Math.min(maximum, Math.max(minimum, scale));
}

/**
 * Frames every node with a margin, the way React Flow's `fitView` does.
 *
 * Falls back to a centred identity camera when there is nothing to frame —
 * an empty atlas must not produce NaN offsets from a zero-width bounding box.
 */
export function fitCameraToNodes(
  nodes: readonly Pick<AtlasFlowNode, 'position' | 'width' | 'height'>[],
  viewport: Viewport,
  padding = 0.14
): AtlasCamera {
  if (nodes.length === 0 || viewport.width <= 0 || viewport.height <= 0) {
    return { x: 0, y: 0, scale: 1 };
  }

  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const node of nodes) {
    left = Math.min(left, node.position.x);
    top = Math.min(top, node.position.y);
    right = Math.max(right, node.position.x + node.width);
    bottom = Math.max(bottom, node.position.y + node.height);
  }

  // A single node has zero extent in both axes; give it something to divide by.
  const contentWidth = Math.max(1, right - left);
  const contentHeight = Math.max(1, bottom - top);
  const usableWidth = viewport.width * (1 - padding * 2);
  const usableHeight = viewport.height * (1 - padding * 2);
  const scale = clampZoom(
    Math.min(usableWidth / contentWidth, usableHeight / contentHeight)
  );

  return {
    scale,
    x: viewport.width / 2 - (left + contentWidth / 2) * scale,
    y: viewport.height / 2 - (top + contentHeight / 2) * scale,
  };
}

/**
 * Zooms while holding one screen point still — the pinch focal point, or the
 * viewport centre for the zoom buttons. Without this the map slides away from
 * wherever the user's fingers are.
 */
export function zoomAbout(
  camera: AtlasCamera,
  factor: number,
  focus: { x: number; y: number }
): AtlasCamera {
  const scale = clampZoom(camera.scale * factor);
  // The scale may have been clamped, so derive the real ratio rather than
  // reusing `factor` — otherwise the focal point drifts at the zoom limits.
  const applied = scale / camera.scale;
  return {
    scale,
    x: focus.x - (focus.x - camera.x) * applied,
    y: focus.y - (focus.y - camera.y) * applied,
  };
}

/** Screen point → canvas point, for hit-testing a tap against node bounds. */
export function toCanvasPoint(
  camera: AtlasCamera,
  screen: { x: number; y: number }
): { x: number; y: number } {
  return {
    x: (screen.x - camera.x) / camera.scale,
    y: (screen.y - camera.y) / camera.scale,
  };
}

/** Distance between two active touches, for pinch tracking. */
export function touchDistance(
  touches: readonly { pageX: number; pageY: number }[]
): number {
  if (touches.length < 2) return 0;
  const [first, second] = touches;
  return Math.hypot(second.pageX - first.pageX, second.pageY - first.pageY);
}

/** Midpoint of two active touches — the focal point a pinch should hold. */
export function touchMidpoint(
  touches: readonly { pageX: number; pageY: number }[]
): { x: number; y: number } {
  if (touches.length < 2) return { x: 0, y: 0 };
  const [first, second] = touches;
  return {
    x: (first.pageX + second.pageX) / 2,
    y: (first.pageY + second.pageY) / 2,
  };
}

/**
 * Centres one node without changing zoom — what tapping a search result does.
 */
export function centreOnNode(
  camera: AtlasCamera,
  node: Pick<AtlasFlowNode, 'position' | 'width' | 'height'>,
  viewport: Viewport
): AtlasCamera {
  return {
    scale: camera.scale,
    x: viewport.width / 2 - (node.position.x + node.width / 2) * camera.scale,
    y: viewport.height / 2 - (node.position.y + node.height / 2) * camera.scale,
  };
}
