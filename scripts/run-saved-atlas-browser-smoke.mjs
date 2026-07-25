import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

const targetUrl = process.argv[2] ?? "http://127.0.0.1:4179/";
const viewportWidth = Number(process.argv[3] ?? "390");
const viewportHeight = Number(process.argv[4] ?? "844");
const screenshotPath = process.argv[5];
const chromeBinary =
  process.env.CHROME_BIN ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const savedItems = [
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
const trailEvents = [
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
      localStorage.clear();
      localStorage.setItem(
        "godiscover:saved-items:v1",
        ${JSON.stringify(JSON.stringify(savedItems))}
      );
      localStorage.setItem(
        "godiscover:discovery-map-edges:v1",
        ${JSON.stringify(JSON.stringify({ version: 2, events: trailEvents }))}
      );
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

  const smoke = await send("Runtime.evaluate", {
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
  result.interactions = await runInputSmoke(send, viewportWidth, viewportHeight);
  result.checks.mousePan = result.interactions.mousePan;
  result.checks.mouseOrbitAndRestore = result.interactions.mouseOrbitAndRestore;
  result.checks.keyboardOrbitAndRestore = result.interactions.keyboardOrbitAndRestore;
  result.checks.touchOrbitAndRestore = result.interactions.touchOrbitAndRestore;
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

async function runInputSmoke(send, width, height) {
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
  const restoreExpectedSurface = async () => {
    if (expectedSurface !== "rail") {
      return (await click(closeDetails)) && (await waitFor(`!(${expectedSurfacePresent})`));
    }
    return (await click(back)) &&
      (await waitFor(`!document.querySelector(${JSON.stringify(back)}) && Boolean(document.querySelector('[aria-label="Arrival details"]'))`)) &&
      (await click(closeDetails)) &&
      (await waitFor(`!document.querySelector('[aria-label="Arrival details"]')`));
  };
  if (await waitFor(`Boolean(document.querySelector(${JSON.stringify(closeDetails)}))`)) {
    await click(closeDetails);
    await waitFor(`!document.querySelector(${JSON.stringify(closeDetails)})`);
  }
  if (await waitFor(`Boolean(document.querySelector(${JSON.stringify(back)}))`)) {
    await click(back);
    await waitFor(`!document.querySelector(${JSON.stringify(back)})`);
  }
  const paneCenter = await centerOf(pane);
  let mousePan = false;
  if (paneCenter) {
    const before = await send("Runtime.evaluate", { returnByValue: true, expression: 'document.querySelector(".react-flow__viewport")?.style.transform ?? ""' });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: paneCenter.x, y: paneCenter.y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: paneCenter.x + 40, y: paneCenter.y + 24, button: "left", buttons: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: paneCenter.x + 40, y: paneCenter.y + 24, button: "left", clickCount: 1 });
    const after = await send("Runtime.evaluate", { returnByValue: true, expression: 'document.querySelector(".react-flow__viewport")?.style.transform ?? ""' });
    mousePan = Boolean(after.result.value) && after.result.value !== before.result.value;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  const mouseOrbitAndRestore = (await click(arrival)) && (await waitFor(expectedSurfacePresent)) && (await restoreExpectedSurface());
  await send("Runtime.evaluate", { expression: 'document.querySelector("[role=application]")?.focus()' });
  await key("ArrowRight");
  await key("Enter");
  const keyboardOrbitAndRestore = (await waitFor(expectedSurfacePresent)) && (await key("Escape"), await waitFor(`!(${expectedSurfacePresent}) && !document.querySelector('[aria-label="Arrival details"]')`));
  const touchOrbitAndRestore = (await touch(arrival)) && (await waitFor(expectedSurfacePresent)) && (await restoreExpectedSurface());
  return {
    expectedSurface,
    mousePan,
    mouseOrbitAndRestore,
    keyboardOrbitAndRestore,
    touchOrbitAndRestore,
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
