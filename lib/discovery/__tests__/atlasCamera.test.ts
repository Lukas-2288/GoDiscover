import {
  MAX_ZOOM,
  MIN_ZOOM,
  centreOnNode,
  clampZoom,
  fitCameraToNodes,
  toCanvasPoint,
  touchDistance,
  touchMidpoint,
  zoomAbout,
} from "../atlasCamera";

const node = (x: number, y: number, width = 100, height = 100) => ({
  position: { x, y },
  width,
  height,
});

const VIEWPORT = { width: 400, height: 800 };

describe("clampZoom", () => {
  it("holds the zoom inside its limits", () => {
    expect(clampZoom(10)).toBe(MAX_ZOOM);
    expect(clampZoom(0.01)).toBe(MIN_ZOOM);
    expect(clampZoom(1)).toBe(1);
  });

  // A pinch that starts with the two touches already together divides by zero.
  it("falls back to the minimum rather than propagating NaN", () => {
    expect(clampZoom(Number.NaN)).toBe(MIN_ZOOM);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(MAX_ZOOM);
  });
});

describe("fitCameraToNodes", () => {
  it("centres the content it is framing", () => {
    const nodes = [node(0, 0), node(400, 200)];
    const camera = fitCameraToNodes(nodes, VIEWPORT);

    // Content spans x 0..500, y 0..300, so its centre is (250, 150).
    const centreX = 250 * camera.scale + camera.x;
    const centreY = 150 * camera.scale + camera.y;
    expect(centreX).toBeCloseTo(VIEWPORT.width / 2, 5);
    expect(centreY).toBeCloseTo(VIEWPORT.height / 2, 5);
  });

  it("leaves a margin rather than butting content against the edge", () => {
    const nodes = [node(0, 0), node(900, 0)];
    const camera = fitCameraToNodes(nodes, VIEWPORT);
    const contentWidth = 1000 * camera.scale;
    expect(contentWidth).toBeLessThan(VIEWPORT.width);
  });

  // An empty atlas has a zero-width bounding box; dividing by it would put NaN
  // into a transform, which renders as nothing at all with no error.
  it("returns a usable camera when there is nothing to frame", () => {
    const camera = fitCameraToNodes([], VIEWPORT);
    expect(camera).toEqual({ x: 0, y: 0, scale: 1 });
  });

  it("survives a single node, whose extent is zero in both axes", () => {
    const camera = fitCameraToNodes([node(50, 50, 0, 0)], VIEWPORT);
    expect(Number.isFinite(camera.x)).toBe(true);
    expect(Number.isFinite(camera.y)).toBe(true);
    expect(Number.isFinite(camera.scale)).toBe(true);
  });

  it("does not fit to a viewport that has not been measured yet", () => {
    expect(fitCameraToNodes([node(0, 0)], { width: 0, height: 0 })).toEqual({
      x: 0,
      y: 0,
      scale: 1,
    });
  });
});

describe("zoomAbout", () => {
  // The whole point: without this the map slides out from under the fingers.
  it("holds the focal point still", () => {
    const camera = { x: -100, y: -50, scale: 1 };
    const focus = { x: 120, y: 300 };
    const before = toCanvasPoint(camera, focus);

    const zoomed = zoomAbout(camera, 1.8, focus);

    const after = toCanvasPoint(zoomed, focus);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
  });

  // If the factor were used directly the focal point would drift once the
  // zoom saturates, so the applied ratio is derived from the clamped scale.
  it("still holds the focal point when the zoom clamps", () => {
    const camera = { x: 0, y: 0, scale: MAX_ZOOM };
    const focus = { x: 200, y: 400 };
    const before = toCanvasPoint(camera, focus);

    const zoomed = zoomAbout(camera, 4, focus);

    expect(zoomed.scale).toBe(MAX_ZOOM);
    const after = toCanvasPoint(zoomed, focus);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
  });
});

describe("touch helpers", () => {
  it("measures spread and midpoint of a two-finger gesture", () => {
    const touches = [
      { pageX: 0, pageY: 0 },
      { pageX: 30, pageY: 40 },
    ];
    expect(touchDistance(touches)).toBe(50);
    expect(touchMidpoint(touches)).toEqual({ x: 15, y: 20 });
  });

  it("reports no spread for a single touch, so a drag is never read as a pinch", () => {
    expect(touchDistance([{ pageX: 10, pageY: 10 }])).toBe(0);
    expect(touchDistance([])).toBe(0);
  });
});

describe("centreOnNode", () => {
  it("centres the node without changing zoom", () => {
    const camera = { x: 0, y: 0, scale: 1.4 };
    const target = node(600, 400, 80, 120);

    const next = centreOnNode(camera, target, VIEWPORT);

    expect(next.scale).toBe(camera.scale);
    expect(640 * next.scale + next.x).toBeCloseTo(VIEWPORT.width / 2, 5);
    expect(460 * next.scale + next.y).toBeCloseTo(VIEWPORT.height / 2, 5);
  });
});
