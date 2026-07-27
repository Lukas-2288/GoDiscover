/**
 * Walks every web section across a device matrix and reports the four ways
 * this app breaks on a real phone or tablet.
 *
 * The web build disables body scrolling (`ScrollViewStyleReset` in
 * `app/+html.tsx` emits `body{overflow:hidden}`), which is the right call for a
 * full-height app shell but means any content taller than the viewport is
 * *unreachable* unless it sits inside a ScrollView. That failure is invisible
 * in a desktop browser and total on a phone, so it is the headline check here.
 *
 * Usage:
 *   node scripts/run-responsive-audit.mjs <export-dir> [--json]
 *
 * Exits non-zero when any cell fails, so this can gate a change.
 */
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { createServer as createSocketServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

const exportDir = process.argv[2];
const asJson = process.argv.includes("--json");
if (!exportDir) {
  console.error(
    "Usage: node scripts/run-responsive-audit.mjs <export-dir> [--json]"
  );
  process.exit(2);
}

const VIEWPORTS = [
  { name: "iPhone SE", width: 375, height: 667 },
  { name: "iPhone 15", width: 393, height: 852 },
  { name: "iPhone landscape", width: 852, height: 393 },
  { name: "iPad portrait", width: 768, height: 1024 },
  { name: "iPad landscape", width: 1024, height: 768 },
  { name: "Laptop", width: 1440, height: 900 },
];

// Each section names the control a user must be able to reach for the section
// to be usable at all. "Below the fold with nothing to scroll" is the failure
// this catches.
// `tab` matches the nav tablist only. Matching on text alone would hit the
// "GO / DISCOVER" wordmark before the Discover tab and silently audit the
// archive four times.
const SECTIONS = [
  { name: "archive", tab: "Archive", primary: ["Surprise me"] },
  {
    // The deck only fills when a category is chosen, so enter through the
    // archive tile rather than the tab — that is the real user path.
    name: "discover",
    tab: "Archive",
    enter: ["Explore Movies"],
    settleMs: 3_000,
    primary: ["Save to map", "Not for me", "Find similar"],
  },
  { name: "atlas", tab: "Saved Atlas", primary: ["Search saved atlas"] },
  { name: "account", tab: "Account", primary: ["Sign in"] },
];

const TOUCH_TARGET_MINIMUM = 44;
const IOS_ZOOM_FONT_SIZE = 16;

const MIME = {
  ".css": "text/css",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};

const server = createServer(async (request, response) => {
  const requested = decodeURIComponent(new URL(request.url, "http://x").pathname);
  const candidates = [
    path.join(exportDir, requested),
    path.join(exportDir, `${requested}.html`),
    path.join(exportDir, "index.html"),
  ];
  for (const candidate of candidates) {
    try {
      if ((await stat(candidate)).isFile()) {
        response.writeHead(200, {
          "Content-Type": MIME[path.extname(candidate)] ?? "application/octet-stream",
        });
        createReadStream(candidate).pipe(response);
        return;
      }
    } catch {
      // Try the next candidate.
    }
  }
  response.writeHead(404).end("not found");
});
const siteUrl = await new Promise((resolve) => {
  server.listen(0, "127.0.0.1", () => {
    resolve(`http://127.0.0.1:${server.address().port}/`);
  });
});

const chromeBinary =
  process.env.CHROME_BIN ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const debuggingPort = await openPort();
const profileDirectory = await mkdtemp(
  path.join(tmpdir(), "godiscover-responsive-")
);
const chrome = spawn(
  chromeBinary,
  [
    "--headless=new",
    "--disable-background-networking",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--no-sandbox",
    `--remote-debugging-port=${debuggingPort}`,
    `--user-data-dir=${profileDirectory}`,
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "ignore"] }
);

let socket;
const failures = [];
const rows = [];

try {
  const target = await waitForPageTarget(debuggingPort);
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let commandId = 0;
  const pending = new Map();
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (!message.id) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request?.reject(new Error(message.error.message));
    else request?.resolve(message.result);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++commandId;
      pending.set(id, { reject, resolve });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const outcome = await send("Runtime.evaluate", {
      awaitPromise: true,
      returnByValue: true,
      expression,
    });
    if (outcome.exceptionDetails) {
      throw new Error(
        outcome.exceptionDetails.exception?.description ??
          outcome.exceptionDetails.text
      );
    }
    return outcome.result.value;
  };

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 1,
  });
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: pageBootstrap(),
  });

  for (const viewport of VIEWPORTS) {
    await send("Emulation.setDeviceMetricsOverride", {
      deviceScaleFactor: 1,
      height: viewport.height,
      mobile: viewport.width <= 768,
      screenHeight: viewport.height,
      screenWidth: viewport.width,
      width: viewport.width,
    });
    await send("Page.navigate", { url: siteUrl });
    await settle(1_800);

    for (const section of SECTIONS) {
      if (!(await clickTab(send, evaluate, section.tab))) {
        throw new Error(`Could not reach the ${section.tab} tab`);
      }
      for (const step of section.enter ?? []) {
        if (!(await clickLabel(send, evaluate, step))) {
          throw new Error(`Could not click "${step}" for section ${section.name}`);
        }
      }
      await settle(section.settleMs ?? 900);

      const measurement = await evaluate(
        `(${measureInPage.toString()})(${JSON.stringify({
          primary: section.primary,
          touchTargetMinimum: TOUCH_TARGET_MINIMUM,
          zoomFontSize: IOS_ZOOM_FONT_SIZE,
        })})`
      );
      const row = { viewport: viewport.name, section: section.name, ...measurement };
      rows.push(row);
      collectFailures(row, failures);
    }
  }
} finally {
  socket?.close();
  chrome.kill();
  server.close();
  await rm(profileDirectory, { force: true, recursive: true }).catch(() => {});
}

if (asJson) {
  console.log(JSON.stringify({ failures, rows }, null, 2));
} else {
  report(rows, failures);
}
process.exit(failures.length > 0 ? 1 : 0);

// --- helpers -------------------------------------------------------------

function pageBootstrap() {
  // Deterministic providers keep the audit reproducible and offline: the layout
  // is what is under test, not the catalogue. The atlas is seeded so it renders
  // a populated map rather than its empty state.
  const savedItems = [
    { id: "arrival", category: "movies", title: "Arrival", subtitle: "Denis Villeneuve", meta: "2016", savedAt: 30 },
    { id: "kindred", category: "books", title: "Kindred", subtitle: "Octavia E. Butler", meta: "1979", savedAt: 20 },
    { id: "vespertine", category: "albums", title: "Vespertine", subtitle: "Björk", meta: "2001", savedAt: 10 },
  ];
  return `
    (() => {
      if (location.protocol === "http:" || location.protocol === "https:") {
        localStorage.clear();
        localStorage.setItem(
          "godiscover:saved-items:v1",
          ${JSON.stringify(JSON.stringify(savedItems))}
        );
      }
      const titles = ["Arrival","Moonlight","Parasite","Whiplash","Dune","Her","Roma","Coco","Up","Alien"];
      const movie = (index) => ({
        id: 1000 + index,
        title: titles[index % titles.length] + (index >= 10 ? " " + index : ""),
        overview: "A deterministic stand-in used for the responsive audit. It is deliberately long enough to push a detail panel past a short viewport, because that is exactly the failure this audit exists to catch.",
        release_date: (2010 + (index % 12)) + "-01-01",
        vote_average: 7 + (index % 3),
        poster_path: null,
        backdrop_path: null,
        genre_ids: index % 2 === 0 ? [28] : [99],
        original_language: "en",
      });
      const realFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const href = typeof input === "string" ? input : input.url;
        if (href.includes("api.themoviedb.org")) {
          const page = Number(new URL(href).searchParams.get("page") ?? 1);
          return new Response(JSON.stringify({
            page,
            total_pages: 20,
            results: Array.from({ length: 20 }, (_, k) => movie((page - 1) * 20 + k)),
          }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        if (href.includes("openlibrary.org")) {
          return new Response(JSON.stringify({
            docs: Array.from({ length: 20 }, (_, k) => ({
              key: "/works/OL" + k, title: "Book " + k, author_name: ["An Author"],
              first_publish_year: 1990 + k, cover_i: null, ratings_average: 4.1,
              subject: ["Fiction"],
            })),
            numFound: 20,
          }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        if (href.includes("discogs.com")) {
          return new Response(JSON.stringify({ results: [] }), { status: 200 });
        }
        if (href.includes("supabase")) {
          return new Response(JSON.stringify({}), { status: 200 });
        }
        return realFetch(input, init);
      };
    })();
  `;
}

/**
 * Runs inside the page. Everything it needs must be self-contained.
 */
function measureInPage({ primary, touchTargetMinimum, zoomFontSize }) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const isVisible = (element) => {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = getComputedStyle(element);
    if (style.visibility === "hidden" || style.display === "none") return false;
    if (Number(style.opacity) === 0) return false;
    return !element.closest('[aria-hidden="true"]');
  };

  const label = (element) =>
    (
      element.getAttribute("aria-label") ||
      element.textContent ||
      element.tagName
    )
      .trim()
      .slice(0, 60);

  // With body scrolling disabled, reaching content below the fold requires a
  // ScrollView somewhere above it. No scrollable ancestor means the content is
  // simply unreachable — the defect this audit is really looking for.
  const scrollableAncestor = (element) => {
    let node = element.parentElement;
    while (node) {
      const style = getComputedStyle(node);
      const scrolls =
        (style.overflowY === "auto" || style.overflowY === "scroll") &&
        node.scrollHeight > node.clientHeight + 1;
      if (scrolls) return node;
      node = node.parentElement;
    }
    return null;
  };

  const all = [...document.querySelectorAll("body *")].filter(isVisible);

  // The atlas is a pan-and-zoom canvas: its node layer is deliberately larger
  // than the window and React Flow clips it. Measuring its bounding box as
  // "overflow" reports a defect that does not exist. Reaching those nodes is
  // covered by run-saved-atlas-browser-smoke.mjs instead.
  const isPannableCanvas = (element) => Boolean(element.closest(".react-flow"));

  let worstOverflow = null;
  let worstUnreachable = null;
  for (const element of all) {
    if (isPannableCanvas(element)) continue;
    const rect = element.getBoundingClientRect();
    const overflowRight = Math.round(rect.right - viewportWidth);
    const overflowLeft = Math.round(-rect.left);
    const horizontal = Math.max(overflowRight, overflowLeft);
    if (horizontal > 1 && (!worstOverflow || horizontal > worstOverflow.px)) {
      worstOverflow = { px: horizontal, label: label(element) };
    }
    const below = Math.round(rect.bottom - viewportHeight);
    if (below > 1 && !scrollableAncestor(element)) {
      if (!worstUnreachable || below > worstUnreachable.px) {
        worstUnreachable = { px: below, label: label(element) };
      }
    }
  }

  const interactive = all.filter((element) => {
    const role = element.getAttribute("role");
    return (
      element.tagName === "INPUT" ||
      role === "button" ||
      role === "tab" ||
      role === "link"
    );
  });
  // A Pressable wrapping another Pressable would double-count; only the
  // innermost element is the real target.
  const leafTargets = interactive.filter(
    (element) => !interactive.some((other) => other !== element && element.contains(other))
  );

  const smallTargets = leafTargets
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      return (
        rect.height < touchTargetMinimum - 0.5 ||
        rect.width < touchTargetMinimum - 0.5
      );
    })
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        label: label(element),
        height: Math.round(rect.height),
        width: Math.round(rect.width),
      };
    });

  // iOS Safari zooms the whole page when an input under 16px takes focus, and
  // `shrink-to-fit=no` leaves no way back out.
  const zoomingInputs = [...document.querySelectorAll("input, textarea")]
    .filter(isVisible)
    .map((element) => ({
      label: label(element),
      fontSize: Math.round(parseFloat(getComputedStyle(element).fontSize)),
    }))
    .filter((entry) => entry.fontSize < zoomFontSize);

  const missingPrimary = [];
  const offscreenPrimary = [];
  for (const wanted of primary) {
    const match = all.find((element) => {
      const text = (
        element.getAttribute("aria-label") ||
        element.textContent ||
        ""
      ).trim();
      return text.toLowerCase().includes(wanted.toLowerCase());
    });
    if (!match) {
      missingPrimary.push(wanted);
      continue;
    }
    const rect = match.getBoundingClientRect();
    const outside =
      rect.bottom > viewportHeight + 1 ||
      rect.top < -1 ||
      rect.right > viewportWidth + 1 ||
      rect.left < -1;
    if (outside && !scrollableAncestor(match)) offscreenPrimary.push(wanted);
  }

  return {
    documentOverflowPx: Math.max(
      0,
      document.documentElement.scrollWidth - viewportWidth
    ),
    worstOverflow,
    worstUnreachable,
    smallTargets,
    zoomingInputs,
    missingPrimary,
    offscreenPrimary,
  };
}

function collectFailures(row, sink) {
  const at = `${row.viewport} / ${row.section}`;
  if (row.worstOverflow) {
    // `body{overflow:hidden}` means content past the edge is usually cut off
    // rather than scrollable — lost either way, but worth naming separately.
    const kind =
      row.documentOverflowPx > 0 ? "scrolls sideways" : "cut off at the edge";
    sink.push(
      `${at}: ${row.worstOverflow.px}px ${kind} — "${row.worstOverflow.label}"`
    );
  }
  if (row.worstUnreachable) {
    sink.push(
      `${at}: ${row.worstUnreachable.px}px of content below the fold with nothing to scroll — "${row.worstUnreachable.label}"`
    );
  }
  if (row.missingPrimary.length > 0) {
    // Usually means navigation never landed on the section — a broken audit is
    // worse than a failing one, so it fails loudly rather than reporting clean.
    sink.push(
      `${at}: primary action not rendered at all — ${row.missingPrimary.join(", ")}`
    );
  }
  if (row.offscreenPrimary.length > 0) {
    sink.push(
      `${at}: primary action unreachable — ${row.offscreenPrimary.join(", ")}`
    );
  }
  if (row.smallTargets.length > 0) {
    const worst = row.smallTargets
      .slice(0, 3)
      .map((entry) => `"${entry.label}" ${entry.width}x${entry.height}`)
      .join(", ");
    sink.push(
      `${at}: ${row.smallTargets.length} touch target(s) under 44px — ${worst}`
    );
  }
  if (row.zoomingInputs.length > 0) {
    const worst = row.zoomingInputs
      .map((entry) => `"${entry.label}" ${entry.fontSize}px`)
      .join(", ");
    sink.push(`${at}: input under 16px will zoom iOS Safari — ${worst}`);
  }
}

function report(rows, failures) {
  const columns = [
    ["viewport", 18],
    ["section", 10],
    ["overflow", 9],
    ["unreachable", 12],
    ["targets<44", 11],
    ["zoom inputs", 11],
  ];
  console.log(columns.map(([name, width]) => name.padEnd(width)).join(""));
  console.log("-".repeat(columns.reduce((total, [, width]) => total + width, 0)));
  for (const row of rows) {
    console.log(
      [
        row.viewport.padEnd(18),
        row.section.padEnd(10),
        String(row.worstOverflow ? `${row.worstOverflow.px}px` : "-").padEnd(9),
        String(row.worstUnreachable ? `${row.worstUnreachable.px}px` : "-").padEnd(12),
        String(row.smallTargets.length || "-").padEnd(11),
        String(row.zoomingInputs.length || "-").padEnd(11),
      ].join("")
    );
  }
  console.log();
  if (failures.length === 0) {
    console.log(`PASS — ${rows.length} cells clean`);
    return;
  }
  console.log(`FAIL — ${failures.length} finding(s) across ${rows.length} cells:`);
  for (const failure of failures) console.log(`  · ${failure}`);
}

// Declarations, not consts: the top-level await above runs before the bottom of
// this module has evaluated.
function clickTab(send, evaluate, label) {
  return clickMatching(send, evaluate, "[role=tab]", label);
}

function clickLabel(send, evaluate, label) {
  return clickMatching(send, evaluate, "[aria-label],[role=button]", label);
}

async function clickMatching(send, evaluate, selector, label) {
  const hit = await evaluate(`(() => {
    const wanted = ${JSON.stringify(label.toLowerCase())};
    const element = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((candidate) => (candidate.getAttribute('aria-label') || candidate.textContent || '')
        .trim().toLowerCase().includes(wanted));
    if (!element) return null;
    // On a phone the archive tiles sit below the fold, so dispatching at the
    // element's current centre would click empty space outside the viewport.
    element.scrollIntoView({ block: "center", inline: "center" });
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return null;
    return { x, y };
  })()`);
  if (!hit) return false;
  for (const type of ["mousePressed", "mouseReleased"]) {
    await send("Input.dispatchMouseEvent", {
      button: "left",
      clickCount: 1,
      type,
      x: hit.x,
      y: hit.y,
    });
  }
  await settle(500);
  return true;
}

// A declaration, not a const: the top-level await above calls this before the
// bottom of the module has evaluated.
function settle(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openPort() {
  const probe = createSocketServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function waitForPageTarget(port) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      // Page/Runtime domains only exist on a page target, never the browser one.
      const page = targets.find(
        (candidate) => candidate.type === "page" && candidate.webSocketDebuggerUrl
      );
      if (page) return page;
    } catch {
      // Chrome has not opened its debugging endpoint yet.
    }
    await settle(100);
  }
  throw new Error("Timed out waiting for a Chrome page target");
}
