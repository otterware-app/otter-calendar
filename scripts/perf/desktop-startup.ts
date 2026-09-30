#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalTimers:off globalConsole:off - A standalone benchmark driver, not app code.
/// <reference lib="dom" />
/**
 * Cold start of the packaged Linux desktop app: time from spawning the AppImage (fresh HOME, so no
 * caches) to the first painted calendar event, measured over CDP. The bundled server seeds the
 * standard demo dataset through `T3CODE_CALENDAR_DEMO`.
 *
 * Usage (after `vp run dist:desktop:linux`), on a machine with Xvfb:
 *
 *   xvfb-run -a -s "-screen 0 1600x1000x24" node scripts/perf/desktop-startup.ts \
 *     --app release/Otter-Calendar-<version>-x86_64.AppImage [--runs 3] [--screenshot out.png]
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeUtil from "node:util";

import { chromium, type Browser, type Page } from "playwright-core";

const { values: args } = NodeUtil.parseArgs({
  options: {
    app: { type: "string" },
    runs: { type: "string", default: "3" },
    demo: { type: "string", default: "standard" },
    port: { type: "string", default: "9339" },
    screenshot: { type: "string" },
  },
});

if (!args.app) throw new Error("Pass --app <path to the AppImage>");
const appImage = NodePath.resolve(args.app);
const debugPort = Number(args.port);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function run(index: number) {
  const home = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "otter-calendar-desktop-"));
  const started = performance.now();
  const child = NodeChildProcess.spawn(
    appImage,
    ["--appimage-extract-and-run", `--remote-debugging-port=${debugPort}`, "--no-sandbox"],
    {
      env: {
        ...process.env,
        HOME: home,
        T3CODE_CALENDAR_DEMO: args.demo,
        ELECTRON_RUN_AS_NODE: undefined,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let log = "";
  child.stdout.on("data", (chunk) => (log += chunk));
  child.stderr.on("data", (chunk) => (log += chunk));
  let browser: Browser | undefined;
  try {
    for (let attempt = 0; attempt < 240 && browser === undefined; attempt += 1) {
      try {
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
      } catch {
        await sleep(100);
      }
    }
    if (browser === undefined) throw new Error(`No CDP endpoint.\n${log.slice(-3000)}`);
    const cdpMs = performance.now() - started;
    let page: Page | undefined;
    for (let attempt = 0; attempt < 300 && page === undefined; attempt += 1) {
      page = browser
        .contexts()
        .flatMap((context) => context.pages())
        .find((candidate) => !candidate.url().startsWith("devtools"));
      if (page === undefined) await sleep(50);
    }
    if (page === undefined) throw new Error("No window.");
    let shellMs: number | null = null;
    let calendarMs: number | null = null;
    for (let attempt = 0; attempt < 1200 && calendarMs === null; attempt += 1) {
      const state = await page
        .evaluate(() => ({
          shell: document.querySelector("[data-calendar-page]") !== null,
          events: document.querySelectorAll("[data-event-key]").length,
        }))
        .catch(() => ({ shell: false, events: 0 }));
      if (state.shell && shellMs === null) shellMs = performance.now() - started;
      if (state.events > 0) calendarMs = performance.now() - started;
      else await sleep(25);
    }
    if (args.screenshot && index === 0) await page.screenshot({ path: args.screenshot });
    return {
      cdpMs: Math.round(cdpMs),
      calendarShellMs: shellMs && Math.round(shellMs),
      firstEventsMs: calendarMs && Math.round(calendarMs),
    };
  } finally {
    await browser?.close().catch(() => {});
    child.kill("SIGTERM");
    await sleep(1500);
    if (child.exitCode === null) child.kill("SIGKILL");
    NodeFS.rmSync(home, { recursive: true, force: true });
  }
}

const results = [];
for (let index = 0; index < Number(args.runs); index += 1) results.push(await run(index));
console.log(
  JSON.stringify({ app: NodePath.basename(appImage), demo: args.demo, runs: results }, null, 2),
);
