import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

const targetUrl = process.argv[2] ?? "http://127.0.0.1:4179/";
const viewportWidth = Number(process.argv[3] ?? "390");
const viewportHeight = Number(process.argv[4] ?? "844");
const screenshotPath = process.argv[5];
// The optional sixth argument selects one input contract. The seventh opts out
// of the synthetic functional smoke so the selected contract starts on a
// freshly loaded Saved Atlas map.
const inputMode = process.argv[6] ?? "all";
const inputOnly = process.argv[7] === "input-only";
const denseFixture = process.argv[8] === "dense";

// Which stages each input contract runs. The `pan-*` modes pan first and then
// drive one input contract in the same profile, so restoration is asserted
// against the camera the user panned to rather than the fit-view position the
// atlas opened at.
const panModes = new Set(["all", "pan", "pan-mouse", "pan-keyboard", "pan-touch"]);
const mouseModes = new Set(["all", "mouse", "pan-mouse"]);
const keyboardModes = new Set(["all", "keyboard", "pan-keyboard"]);
const touchModes = new Set(["all", "touch", "pan-touch"]);
const knownInputModes = new Set([
  ...panModes,
  ...mouseModes,
  ...keyboardModes,
  ...touchModes,
]);
if (!knownInputModes.has(inputMode)) {
  console.error(
    `Unknown input mode ${JSON.stringify(inputMode)}. Expected one of: ${[...knownInputModes]
      .sort()
      .join(", ")}`
  );
  process.exit(2);
}

const chromeBinary =
  process.env.CHROME_BIN ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseSavedItems = [
  {
    id: "arrival",
    category: "movies",
    title: "Arrival",
    subtitle: "Denis Villeneuve",
    meta: "2016 · Science fiction",
    savedAt: 30,
  },
  {
    id: "kindred",
    category: "books",
    title: "Kindred",
    subtitle: "Octavia E. Butler",
    meta: "1979 · Speculative fiction",
    savedAt: 20,
  },
  {
    id: "vespertine",
    category: "albums",
    title: "Vespertine",
    subtitle: "Björk",
    meta: "2001 · Electronic",
    savedAt: 10,
  },
];
const baseTrailEvents = [
  {
    id: "connect:movies:arrival->books:kindred:40",
    relationshipId: "movies:arrival->books:kindred",
    action: "connect",
    source: "movies:arrival",
    target: "books:kindred",
    occurredAt: 40,
    origin: "anonymous",
    reason: "Language across distance",
  },
];
const denseCategories = ["movies", "books", "albums", "artists"];
const savedItems = denseFixture
  ? [
      ...baseSavedItems,
      ...Array.from({ length: 197 }, (_, index) => {
        const category = denseCategories[index % denseCategories.length];
        return {
          id: `dense-${index}`,
          category,
          title: `Dense ${index}`,
          subtitle: `Hit region ${index}`,
          meta: `2026 · Dense ${category}`,
          savedAt: 1_000 - index,
        };
      }),
    ]
  : baseSavedItems;
const denseNodeIds = savedItems.map((item) => `${item.category}:${item.id}`);
const trailEvents = denseFixture
  ? [
      ...baseTrailEvents,
      ...Array.from({ length: 399 }, (_, index) => {
        const source = denseNodeIds[index % denseNodeIds.length];
        const target =
          denseNodeIds[(index * 37 + 11) % denseNodeIds.length];
        return {
          id: `connect:${source}->${target}:${100 + index}`,
          relationshipId: `${source}->${target}`,
          action: "connect",
          source,
          target,
          occurredAt: 100 + index,
          origin: "anonymous",
          reason: `Dense trail ${index}`,
        };
      }),
    ]
  : baseTrailEvents;

const debuggingPort = await openPort();
const profileDirectory = await mkdtemp(
  path.join(tmpdir(), "godiscover-atlas-chrome-")
);
const chrome = spawn(
  chromeBinary,
  [
    "--headless=new",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--no-sandbox",
    `--remote-debugging-port=${debuggingPort}`,
    `--user-data-dir=${profileDirectory}`,
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"] }
);
const chromeExited = new Promise((resolve) => chrome.once("exit", resolve));
let chromeErrors = "";
let socket;
chrome.stderr.on("data", (chunk) => {
  chromeErrors = `${chromeErrors}${chunk}`.slice(-4_000);
});

try {
  const target = await waitForTarget(debuggingPort);
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let commandId = 0;
  let pageLoaded;
  const pending = new Map();
  const runtimeExceptions = [];
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request?.reject(new Error(message.error.message));
      else request?.resolve(message.result);
      return;
    }
    if (message.method === "Page.loadEventFired") pageLoaded?.();
    if (message.method === "Runtime.exceptionThrown") {
      runtimeExceptions.push(
        message.params.exceptionDetails.exception?.description ??
          message.params.exceptionDetails.text
      );
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++commandId;
      pending.set(id, { reject, resolve });
      socket.send(JSON.stringify({ id, method, params }));
    });

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    deviceScaleFactor: 1,
    height: viewportHeight,
    mobile: viewportWidth <= 768,
    screenHeight: viewportHeight,
    screenWidth: viewportWidth,
    width: viewportWidth,
  });
  await send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 1,
  });
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      if (location.protocol === "http:" || location.protocol === "https:") {
        localStorage.clear();
        localStorage.setItem(
          "godiscover:saved-items:v1",
          ${JSON.stringify(JSON.stringify(savedItems))}
        );
        localStorage.setItem(
          "godiscover:discovery-map-edges:v1",
          ${JSON.stringify(JSON.stringify({ version: 2, events: trailEvents }))}
        );
      }
    `,
  });
  const loadEvent = new Promise((resolve) => {
    pageLoaded = resolve;
  });
  await send("Page.navigate", { url: targetUrl });
  await Promise.race([
    loadEvent,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timed out waiting for page load")), 15_000)
    ),
  ]);

  const smoke = inputOnly
    ? { result: { value: { checks: { inputOnlyOpened: true }, diagnostics: {} } } }
    : await send("Runtime.evaluate", {
        awaitPromise: true,
        returnByValue: true,
        expression: `(${runSmokeInPage.toString()})()`,
      });
  if (smoke.exceptionDetails) {
    throw new Error(
      smoke.exceptionDetails.exception?.description ??
        smoke.exceptionDetails.text
    );
  }
  const result = smoke.result.value;
  result.interactions = await runInputSmoke(
    send,
    viewportWidth,
    viewportHeight,
    inputOnly,
    denseFixture
  );
  if (inputOnly) {
    result.checks.inputOnlyOpened = result.interactions.atlasReady;
    result.checks.viewportStable = result.interactions.cleanupViewport.stable;
    result.checks[inputMode] = result.interactions.modePassed;
  } else {
    result.checks.mousePan = result.interactions.mousePan;
    result.checks.mouseOrbitAndRestore = result.interactions.mouseOrbitAndRestore;
    result.checks.keyboardOrbitAndRestore = result.interactions.keyboardOrbitAndRestore;
    result.checks.touchOrbitAndRestore = result.interactions.touchOrbitAndRestore;
  }
  if (denseFixture) {
    result.checks.denseRepresentativeHitTargets =
      result.interactions.denseRepresentativeHitTargets;
  }
  const fatalRuntimeExceptions = runtimeExceptions;
  result.checks.noFatalRuntimeErrors = fatalRuntimeExceptions.length === 0;
  if (screenshotPath) {
    const screenshot = await send("Page.captureScreenshot", {
      captureBeyondViewport: false,
      format: "png",
    });
    await writeFile(screenshotPath, screenshot.data, "base64");
  }
  const passed = Object.values(result.checks).every(Boolean);
  if (!passed) {
    throw new Error(
      `FAIL ${JSON.stringify({
        ...result,
        fatalRuntimeExceptions,
      })}`
    );
  }

  process.stdout.write(`PASS ${JSON.stringify(result)}\n`);
  await send("Browser.close");
} catch (error) {
  process.stderr.write(`${error.stack || error.message}\n`);
  if (chromeErrors) process.stderr.write(`Chrome stderr:\n${chromeErrors}\n`);
  chrome.kill("SIGTERM");
  process.exitCode = 1;
} finally {
  socket?.close();
  if (!chrome.killed) chrome.kill("SIGTERM");
  await Promise.race([
    chromeExited,
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (chrome.exitCode === null) chrome.kill("SIGKILL");
  await rm(profileDirectory, { force: true, recursive: true });
}

async function runInputSmoke(send, width, height, isInputOnly, isDenseFixture) {
  const diagnosticLabels = await send("Runtime.evaluate", {
    returnByValue: true,
    expression: '[...document.querySelectorAll("[aria-label]")].map((element) => element.getAttribute("aria-label")).filter(Boolean)',
  });
  const waitFor = async (expression, timeout = 5_000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const result = await send("Runtime.evaluate", {
        awaitPromise: true,
        returnByValue: true,
        expression,
      });
      if (result.result.value) return true;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return false;
  };
  const waitForViewportStable = async () => {
    let previous = null;
    let stableSamples = 0;
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const current = (await send("Runtime.evaluate", {
        returnByValue: true,
        expression: 'document.querySelector(".react-flow__viewport")?.style.transform ?? ""',
      })).result.value;
      stableSamples = current === previous ? stableSamples + 1 : 0;
      if (stableSamples >= 3) return { stable: true, transform: current };
      previous = current;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return { stable: false, transform: previous };
  };
  const readViewportTransform = async () =>
    (
      await send("Runtime.evaluate", {
        returnByValue: true,
        expression:
          'document.querySelector(".react-flow__viewport")?.style.transform ?? ""',
      })
    ).result.value;
  const restoredExactly = async (expectedTransform) =>
    waitFor(`(() => {
      const selected = document.querySelector('[data-testid^="atlas-artwork-"][aria-selected="true"]');
      const orbit = document.querySelector('[aria-label="Discovery Orbit"]');
      const back = document.querySelector('[aria-label="Back to atlas"]');
      const transform = document.querySelector(".react-flow__viewport")?.style.transform ?? "";
      return !selected && !orbit && !back && transform === ${JSON.stringify(expectedTransform)};
    })()`);
  const centerOf = async (selector) => {
    const result = await send("Runtime.evaluate", {
      returnByValue: true,
      expression: `(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      })()`,
    });
    return result.result.value;
  };
  const click = async (selector) => {
    const center = await centerOf(selector);
    if (!center) return false;
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: center.x, y: center.y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: center.x, y: center.y, button: "left", clickCount: 1 });
    return true;
  };
  const openAtlas = async () => {
    const tabReady = await waitFor(
      `Boolean([...document.querySelectorAll('[role="tab"]')].find((candidate) => candidate.textContent.includes('Saved Atlas')))`
    );
    if (!tabReady) return false;
    const result = await send("Runtime.evaluate", {
      returnByValue: true,
      expression: `(() => { const element = [...document.querySelectorAll('[role="tab"]')].find((candidate) => candidate.textContent.includes('Saved Atlas')); if (!element) return null; const rect = element.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; })()`,
    });
    const center = result.result.value;
    if (!center) return false;
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: center.x, y: center.y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: center.x, y: center.y, button: "left", clickCount: 1 });
    return waitFor('Boolean(document.querySelector(".saved-atlas-flow"))');
  };
  const touch = async (selector) => {
    const center = await centerOf(selector);
    if (!center) return false;
    await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: center.x, y: center.y, id: 1 }] });
    await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    return true;
  };
  const key = async (name) => {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: name, code: name });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: name, code: name });
  };
  const arrival = '[aria-label^="Arrival, movies"]';
  const back = '[aria-label="Back to atlas"]';
  const pane = ".react-flow__pane";
  const closeDetails = '[aria-label="Close details"]';
  const atlasReady = !isInputOnly || (await openAtlas());
  const expectedSurface = width < 700
    ? "sheet"
    : height > width
      ? "drawer"
      : "rail";
  const expectedSurfacePresent = expectedSurface === "sheet"
    ? 'Boolean(document.querySelector(\'[aria-modal="true"][aria-label="Arrival details"]\'))'
    : expectedSurface === "drawer"
      ? 'Boolean(document.querySelector(\'[aria-label="Arrival details"]\') && document.querySelector(\'[aria-label="Expand detail drawer"]\'))'
      : `Boolean(document.querySelector(${JSON.stringify(back)}) && document.querySelector('[aria-label="Arrival details"]'))`;
  const restoreExpectedSurface = async (expectedTransform) => {
    let exitTriggered = false;
    if (expectedSurface !== "rail") {
      exitTriggered = await click(closeDetails);
    } else {
      exitTriggered = await click(back);
    }
    return exitTriggered &&
      (await waitFor(`!(${expectedSurfacePresent})`)) &&
      (await restoredExactly(expectedTransform));
  };
  if (await waitFor(`Boolean(document.querySelector(${JSON.stringify(closeDetails)}))`)) {
    await click(closeDetails);
    await waitFor(`!document.querySelector(${JSON.stringify(closeDetails)})`);
  }
  if (await waitFor(`Boolean(document.querySelector(${JSON.stringify(back)}))`)) {
    await click(back);
    await waitFor(`!document.querySelector(${JSON.stringify(back)})`);
  }
  const cleanupViewport = await waitForViewportStable();
  const paneCenter = await centerOf(pane);
  let mousePan = false;
  if (paneCenter && panModes.has(inputMode)) {
    const before = await send("Runtime.evaluate", { returnByValue: true, expression: 'document.querySelector(".react-flow__viewport")?.style.transform ?? ""' });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: paneCenter.x, y: paneCenter.y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: paneCenter.x + 40, y: paneCenter.y + 24, button: "left", buttons: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: paneCenter.x + 40, y: paneCenter.y + 24, button: "left", clickCount: 1 });
    const after = await send("Runtime.evaluate", { returnByValue: true, expression: 'document.querySelector(".react-flow__viewport")?.style.transform ?? ""' });
    mousePan = Boolean(after.result.value) && after.result.value !== before.result.value;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  const mouseOverview = await waitForViewportStable();
  const mouseOrbitAndRestore = mouseModes.has(inputMode) &&
    mouseOverview.stable &&
    (await click(arrival)) &&
    (await waitFor(expectedSurfacePresent)) &&
    (await restoreExpectedSurface(mouseOverview.transform));
  let keyboardOrbitAndRestore = false;
  const keyboardOverview = await waitForViewportStable();
  if (keyboardModes.has(inputMode)) {
    await send("Runtime.evaluate", { expression: 'document.querySelector("[role=application]")?.focus()' });
    await key("ArrowRight");
    await key("Enter");
    keyboardOrbitAndRestore = (await waitFor(expectedSurfacePresent)) &&
      (await key("Escape"), await waitFor(`!(${expectedSurfacePresent})`)) &&
      (await restoredExactly(keyboardOverview.transform));
  }
  const touchOverview = await waitForViewportStable();
  const touchOrbitAndRestore = touchModes.has(inputMode) &&
    touchOverview.stable &&
    (await touch(arrival)) &&
    (await waitFor(expectedSurfacePresent)) &&
    (await restoreExpectedSurface(touchOverview.transform));
  let denseRepresentativeHitTargets = true;
  if (isDenseFixture) {
    const representatives = (
      await send("Runtime.evaluate", {
        returnByValue: true,
        expression: `(() => {
          const visible = [...document.querySelectorAll(".react-flow__node")]
            .map((node) => {
              const rect = node.getBoundingClientRect();
              const x = rect.left + rect.width / 2;
              const y = rect.top + rect.height / 2;
              const hit = document.elementFromPoint(x, y)?.closest(".react-flow__node");
              return {
                id: node.getAttribute("data-id"),
                x,
                y,
                visible: rect.width > 0 && rect.height > 0 &&
                  x >= 0 && x <= innerWidth && y >= 0 && y <= innerHeight &&
                  hit === node,
              };
            })
            .filter((candidate) => candidate.visible && candidate.id)
            .sort((left, right) => left.x - right.x || left.y - right.y);
          if (visible.length < 3) return [];
          return [visible[0], visible[Math.floor(visible.length / 2)], visible[visible.length - 1]];
        })()`,
      })
    ).result.value;
    denseRepresentativeHitTargets = representatives.length === 3;
    for (const representative of representatives) {
      const overview = await waitForViewportStable();
      await send("Input.dispatchMouseEvent", {
        type: "mousePressed",
        x: representative.x,
        y: representative.y,
        button: "left",
        clickCount: 1,
      });
      await send("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x: representative.x,
        y: representative.y,
        button: "left",
        clickCount: 1,
      });
      const selected = await waitFor(
        `Boolean(document.querySelector(${JSON.stringify(
          `[data-testid="atlas-artwork-${representative.id}"][aria-selected="true"]`
        )}))`
      );
      const exited =
        (await waitFor(
          `Boolean(document.querySelector(${JSON.stringify(closeDetails)}) || document.querySelector(${JSON.stringify(back)}))`
        )) &&
        ((await click(closeDetails)) || (await click(back))) &&
        (await restoredExactly(overview.transform));
      denseRepresentativeHitTargets =
        denseRepresentativeHitTargets && Boolean(selected) && Boolean(exited);
      if (!denseRepresentativeHitTargets) break;
    }
  }
  const modePassed = {
    pan: mousePan,
    mouse: mouseOrbitAndRestore,
    keyboard: keyboardOrbitAndRestore,
    touch: touchOrbitAndRestore,
    // Combined modes: the pan and the orbit happen in one profile, so the
    // restore target is the camera the user actually panned to rather than the
    // fit-view position the atlas opened at. Running pan on its own — as the
    // earlier matrix did — cannot catch a stale overview capture.
    "pan-mouse": mousePan && mouseOrbitAndRestore,
    "pan-keyboard": mousePan && keyboardOrbitAndRestore,
    "pan-touch": mousePan && touchOrbitAndRestore,
    all: mousePan && mouseOrbitAndRestore && keyboardOrbitAndRestore && touchOrbitAndRestore,
  }[inputMode];
  return {
    expectedSurface,
    inputMode,
    atlasReady,
    cleanupViewport,
    mousePan,
    mouseOrbitAndRestore,
    keyboardOrbitAndRestore,
    touchOrbitAndRestore,
    denseRepresentativeHitTargets,
    modePassed: Boolean(modePassed),
    overviewTransforms: {
      mouse: mouseOverview.transform,
      keyboard: keyboardOverview.transform,
      touch: touchOverview.transform,
    },
    diagnosticLabels: diagnosticLabels.result.value,
  };
}

async function runSmokeInPage() {
  const delay = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));
  const waitFor = async (check, timeout = 8000) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      const value = check();
      if (value) return value;
      await delay(50);
    }
    return null;
  };
  const setInputValue = (input, value) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    ).set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const checks = {};
  const diagnostics = {};

  const atlasTab = await waitFor(() =>
    [...document.querySelectorAll('[role="tab"]')].find((element) =>
      element.textContent.includes("Saved Atlas")
    )
  );
  checks.hydrated = Boolean(atlasTab);
  checks.atlasOpened = Boolean(
    await waitFor(() => {
      [...document.querySelectorAll('[role="tab"]')]
        .find((element) => element.textContent.includes("Saved Atlas"))
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return document.querySelector(".saved-atlas-flow");
    })
  );
  checks.edgeRendered = Boolean(
    await waitFor(() => document.querySelector(".react-flow__edge-path"), 2500)
  );
  checks.hiddenHandles =
    document.querySelectorAll(".react-flow__handle.source").length > 0 &&
    document.querySelectorAll(".react-flow__handle.target").length > 0;
  diagnostics.nodeCount = document.querySelectorAll(".react-flow__node").length;
  diagnostics.edgeGroupCount =
    document.querySelectorAll(".react-flow__edge").length;
  diagnostics.handleRects = [
    ...document.querySelectorAll(".react-flow__handle"),
  ].slice(0, 4).map((handle) => {
    const rect = handle.getBoundingClientRect();
    return {
      className: handle.className,
      height: rect.height,
      left: rect.left,
      top: rect.top,
      width: rect.width,
    };
  });

  checks.reasonLabel = Boolean(
    await waitFor(
      () => {
        document
          .querySelector('[aria-label^="Arrival, movies"]')
          ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        return [...document.querySelectorAll(".react-flow__edge-text")].find(
          (element) =>
            element.textContent.includes("Language across distance")
        );
      },
      1500
    )
  );

  checks.listOpened = Boolean(
    await waitFor(() => {
      document
        .querySelector('[role="tab"][aria-label="List"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return document.querySelector('[aria-label="Open Vespertine"]');
    })
  );
  const listSearch = document.querySelector(
    '[aria-label="Search saved atlas"]'
  );
  if (listSearch) setInputValue(listSearch, "bjork");
  await delay(200);
  checks.listDiacriticSearch = Boolean(
    document.querySelector('[aria-label="Open Vespertine"]')
  );

  if (listSearch) setInputValue(listSearch, "");
  document
    .querySelector('[role="tab"][aria-label="Map"]')
    ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  const mapSearch = await waitFor(() =>
    document.querySelector('[aria-label="Search saved atlas"]')
  );
  if (mapSearch) setInputValue(mapSearch, "bjork");
  checks.searchFocused = Boolean(
    await waitFor(
      () =>
        document.querySelector(
          '[data-testid="atlas-artwork-albums:vespertine"][aria-selected="true"]'
        ),
      1500
    )
  );
  diagnostics.searchedArtwork = document
    .querySelector('[data-testid="atlas-artwork-albums:vespertine"]')
    ?.outerHTML.slice(0, 800);

  return { checks, diagnostics };
}

async function openPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}

async function waitForTarget(port) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const target = targets.find((candidate) => candidate.type === "page");
      if (target) return target;
    } catch {
      // Chrome has not opened its debugging endpoint yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for Chrome DevTools");
}
