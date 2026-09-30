#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalTimers:off globalConsole:off - A standalone benchmark driver, not app code.
/// <reference lib="dom" />
/**
 * Calendar performance run: starts a production server (built web app) on an isolated home seeded
 * with the massive demo dataset, pairs a headless Chromium, and measures what users feel:
 * time to first render of each view, paging between weeks and months (cold and warm), agenda
 * scrolling, drag frame times, heap after navigation, and WebSocket payload sizes.
 *
 * Usage (from the repository root, after `vp run build` in apps/web):
 *
 *   ~/.local/bin/heavy 6G -- node scripts/perf/calendar-perf.ts [--demo massive:7] [--port 13990]
 *     [--base-dir /tmp/otter-calendar-perf] [--keep-home] [--out scripts/perf/results/latest.json]
 *
 * Methodology notes live in docs/performance.md.
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeUtil from "node:util";
import * as NodeZlib from "node:zlib";

import { chromium, type CDPSession, type Page } from "playwright-core";

const { values: args } = NodeUtil.parseArgs({
  options: {
    demo: { type: "string", default: "massive:7" },
    port: { type: "string", default: "13990" },
    "base-dir": { type: "string", default: "/tmp/otter-calendar-perf" },
    "keep-home": { type: "boolean", default: false },
    out: { type: "string", default: "scripts/perf/results/latest.json" },
    headed: { type: "boolean", default: false },
    /** Hide all but this many calendars (through the sidebar), for a less dense scenario. */
    "visible-calendars": { type: "string" },
  },
});

const repoRoot = NodePath.resolve(import.meta.dirname, "../..");
const baseDir = NodePath.resolve(args["base-dir"]);
const port = Number(args.port);
const origin = `http://127.0.0.1:${port}`;

type Stats = { count: number; mean: number; p50: number; p95: number; max: number };

function stats(values: ReadonlyArray<number>): Stats {
  const sorted = [...values].sort((a, b) => a - b);
  const pick = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  const mean = sorted.reduce((sum, value) => sum + value, 0) / Math.max(1, sorted.length);
  return {
    count: sorted.length,
    mean: round(mean),
    p50: round(pick(0.5)),
    p95: round(pick(0.95)),
    max: round(sorted.at(-1) ?? 0),
  };
}

const round = (value: number) => Math.round(value * 10) / 10;

// ── Server ───────────────────────────────────────────────────────────

async function startServer(): Promise<{
  child: NodeChildProcess.ChildProcess;
  pairingUrl: string;
  log: () => string;
}> {
  if (!NodeFS.existsSync(NodePath.join(repoRoot, "apps/web/dist/index.html"))) {
    throw new Error("Build the web app first: cd apps/web && vp run build");
  }
  if (!args["keep-home"]) NodeFS.rmSync(baseDir, { recursive: true, force: true });
  NodeFS.mkdirSync(baseDir, { recursive: true });
  let output = "";
  const child = NodeChildProcess.spawn(
    process.execPath,
    [
      NodePath.join(repoRoot, "apps/server/src/bin.ts"),
      "--base-dir",
      baseDir,
      "--port",
      String(port),
      "--host",
      "127.0.0.1",
      "--no-browser",
    ],
    {
      cwd: repoRoot,
      env: { ...process.env, T3CODE_CALENDAR_DEMO: args.demo, NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const pairingUrl = await new Promise<string>((resolve, reject) => {
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      const match = /(https?:\/\/[^\s"']+\/pair[^\s"']*)/.exec(output);
      if (match) resolve(match[1]!);
    };
    child.stdout!.on("data", onData);
    child.stderr!.on("data", onData);
    child.once("exit", (code) =>
      reject(new Error(`Server exited (${code}):\n${output.slice(-4000)}`)),
    );
    setTimeout(
      () => reject(new Error(`No pairing URL after 60 s:\n${output.slice(-4000)}`)),
      60_000,
    );
  });
  return { child, pairingUrl, log: () => output };
}

// ── Page helpers ─────────────────────────────────────────────────────

/** Resolves after the view shows no loading marker and two frames have painted. */
async function settled(page: Page, timeoutMs = 30_000): Promise<void> {
  await page.waitForFunction(
    () => {
      const root = document.querySelector("[data-calendar-page]");
      return root !== null && !root.hasAttribute("data-calendar-loading");
    },
    undefined,
    { timeout: timeoutMs, polling: "raf" },
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function installObservers(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __perf: {
        longTasks: Array<{ start: number; duration: number }>;
        frames: Array<number>;
        recording: boolean;
        keys: Array<number>;
      };
    };
    if (w.__perf) return;
    w.__perf = { longTasks: [], frames: [], recording: false, keys: [] };
    // Event Timing (what INP measures): from the key press to the next paint after handling it.
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === "keydown") w.__perf.keys.push(entry.duration);
      }
    }).observe({
      type: "event",
      durationThreshold: 16,
      buffered: false,
    } as PerformanceObserverInit);
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        w.__perf.longTasks.push({ start: entry.startTime, duration: entry.duration });
      }
    }).observe({ type: "longtask", buffered: false });
    let last = performance.now();
    const loop = (now: number) => {
      if (w.__perf.recording) w.__perf.frames.push(now - last);
      last = now;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}

async function record<T>(page: Page, run: () => Promise<T>) {
  await page.evaluate(() => {
    const w = window as unknown as {
      __perf: {
        longTasks: Array<unknown>;
        frames: Array<number>;
        recording: boolean;
        keys: Array<number>;
      };
    };
    w.__perf.longTasks = [];
    w.__perf.frames = [];
    w.__perf.keys = [];
    w.__perf.recording = true;
  });
  const result = await run();
  const captured = await page.evaluate(() => {
    const w = window as unknown as {
      __perf: {
        longTasks: Array<{ duration: number }>;
        frames: Array<number>;
        recording: boolean;
        keys: Array<number>;
      };
    };
    w.__perf.recording = false;
    return {
      longTasks: w.__perf.longTasks.map((task) => task.duration),
      frames: w.__perf.frames.slice(1),
      keys: [...w.__perf.keys],
    };
  });
  return {
    result,
    /** Key press to next paint (Event Timing; entries under 16 ms are not reported). */
    keyToPaintMs: stats(captured.keys),
    frames: stats(captured.frames),
    droppedFrames: captured.frames.filter((frame) => frame > 20).length,
    longTasks: {
      count: captured.longTasks.length,
      totalMs: round(captured.longTasks.reduce((a, b) => a + b, 0)),
      max: round(Math.max(0, ...captured.longTasks)),
    },
  };
}

async function heapMb(cdp: CDPSession): Promise<number> {
  await cdp.send("HeapProfiler.collectGarbage");
  const { usedSize } = (await cdp.send("Runtime.getHeapUsage")) as { usedSize: number };
  return round(usedSize / 1024 / 1024);
}

// ── Run ──────────────────────────────────────────────────────────────

async function main() {
  const server = await startServer();
  const results: Record<string, unknown> = { demo: args.demo, startedAt: new Date().toISOString() };
  const browser = await chromium.launch({ headless: !args.headed });
  try {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      deviceScaleFactor: 1,
      timezoneId: "Europe/Berlin",
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    // CDP reports frames decompressed; the server negotiates permessage-deflate, so each frame is
    // also deflated here (per message, without context takeover: an upper bound on the wire).
    const frames: Array<{ at: number; bytes: number; wire: number; snapshot: boolean }> = [];
    cdp.on("Network.webSocketFrameReceived", (event: { response: { payloadData: string } }) => {
      const payload = event.response.payloadData;
      frames.push({
        at: Date.now(),
        bytes: Buffer.byteLength(payload),
        wire: NodeZlib.deflateRawSync(payload).length,
        snapshot: payload.includes('"snapshot"'),
      });
    });
    const wsBytesSince = (from: number) =>
      frames.filter((frame) => frame.at >= from).reduce((sum, frame) => sum + frame.bytes, 0);
    const wireBytesSince = (from: number) =>
      frames.filter((frame) => frame.at >= from).reduce((sum, frame) => sum + frame.wire, 0);

    // Pair, then wait until the demo accounts finished their first sync.
    const pairStart = Date.now();
    await page.goto(server.pairingUrl, { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/calendar/, { timeout: 60_000 });
    await page.waitForFunction(
      () => document.querySelectorAll("[data-event-key]").length > 0,
      undefined,
      {
        timeout: 180_000,
        polling: 500,
      },
    );
    await settled(page, 180_000);
    results.firstSyncAndRenderMs = Date.now() - pairStart;

    const keepVisible = args["visible-calendars"];
    if (keepVisible !== undefined) {
      const rows = page.locator("[data-calendar-row]");
      const count = await rows.count();
      for (let index = Number(keepVisible); index < count; index += 1) {
        await rows.nth(index).getByRole("checkbox").click();
      }
      await page.waitForTimeout(1500);
      await settled(page);
      results.visibleCalendars = Number(keepVisible);
    }
    await installObservers(page);

    const today = new Date().toISOString().slice(0, 10);

    // 1. Time to first render of each view: a full page load straight into the view.
    const firstRender: Record<string, unknown> = {};
    for (const view of ["week", "day", "custom", "month", "agenda"]) {
      const samples: Array<number> = [];
      const bytes: Array<number> = [];
      const wire: Array<number> = [];
      for (let run = 0; run < 3; run += 1) {
        const from = Date.now();
        await page.goto(`${origin}/calendar?view=${view}&date=${today}`, { waitUntil: "commit" });
        await page.waitForSelector(`[data-calendar-page][data-calendar-view="${view}"]`, {
          timeout: 30_000,
        });
        await settled(page);
        samples.push(await page.evaluate(() => performance.now()));
        bytes.push(wsBytesSince(from));
        wire.push(wireBytesSince(from));
      }
      firstRender[view] = {
        msFromNavigationStart: stats(samples),
        events: await page.locator("[data-event-key]").count(),
        wsBytes: stats(bytes),
        wsWireBytes: stats(wire),
      };
    }
    results.firstRender = firstRender;
    await installObservers(page);

    // 2. Paging: next/previous period in week and month views, cold (never visited) and warm.
    const paging: Record<string, unknown> = {};
    for (const view of ["week", "month"]) {
      await page.goto(`${origin}/calendar?view=${view}&date=${today}`, {
        waitUntil: "domcontentloaded",
      });
      await settled(page);
      await installObservers(page);
      const measure = async (key: string, steps: number) => {
        const times: Array<number> = [];
        const from = Date.now();
        const recorded = await record(page, async () => {
          for (let step = 0; step < steps; step += 1) {
            const before = await page.getAttribute("[data-calendar-page]", "data-calendar-date");
            const started = await page.evaluate(() => performance.now());
            await page.keyboard.press(key);
            await page.waitForFunction(
              (previous) => {
                const root = document.querySelector("[data-calendar-page]");
                return (
                  root?.getAttribute("data-calendar-date") !== previous &&
                  !root?.hasAttribute("data-calendar-loading")
                );
              },
              before,
              { polling: "raf", timeout: 30_000 },
            );
            const painted = await page.evaluate(
              () =>
                new Promise<number>((resolve) =>
                  requestAnimationFrame(() => requestAnimationFrame((t) => resolve(t))),
                ),
            );
            times.push(painted - started);
          }
        });
        return {
          perStepMs: stats(times),
          wsBytesPerStep: Math.round(wsBytesSince(from) / steps),
          wsWireBytesPerStep: Math.round(wireBytesSince(from) / steps),
          ...recorded,
          result: undefined,
        };
      };
      const steps = view === "week" ? 20 : 8;
      paging[view] = {
        coldForward: await measure("j", steps),
        warmBack: await measure("k", steps),
        warmForward: await measure("j", steps),
      };
    }
    results.paging = paging;

    // 3. Agenda scrolling: wheel through the list for a few seconds.
    await page.goto(`${origin}/calendar?view=agenda&date=${today}`, {
      waitUntil: "domcontentloaded",
    });
    await settled(page);
    await installObservers(page);
    const agendaBox = await page.locator('[data-calendar-surface="agenda"]').boundingBox();
    if (agendaBox) {
      await page.mouse.move(agendaBox.x + agendaBox.width / 2, agendaBox.y + agendaBox.height / 2);
      const from = Date.now();
      results.agendaScroll = {
        ...(await record(page, async () => {
          for (let step = 0; step < 120; step += 1) {
            await page.mouse.wheel(0, 240);
            await page.waitForTimeout(16);
          }
          for (let step = 0; step < 60; step += 1) {
            await page.mouse.wheel(0, -480);
            await page.waitForTimeout(16);
          }
        })),
        wsBytes: wsBytesSince(from),
        result: undefined,
      };
    }

    // 4. Drag: move an event across days and resize it, with frame timing during the gesture.
    await page.goto(`${origin}/calendar?view=week&date=${today}`, {
      waitUntil: "domcontentloaded",
    });
    await settled(page);
    await installObservers(page);
    const block = page
      .locator('[data-calendar-surface="timegrid"] [data-event-key]:not([data-readonly])')
      .first();
    await block.scrollIntoViewIfNeeded();
    const box = await block.boundingBox();
    if (box) {
      const startX = box.x + box.width / 2;
      const startY = box.y + Math.min(10, box.height / 2);
      results.dragMove = {
        ...(await record(page, async () => {
          await page.mouse.move(startX, startY);
          await page.mouse.down();
          for (let step = 1; step <= 90; step += 1) {
            await page.mouse.move(startX + step * 4, startY + Math.sin(step / 8) * 120);
          }
          await page.keyboard.press("Escape");
          await page.mouse.up();
        })),
        result: undefined,
      };
      // Resizing starts on the bottom few pixels of a block (there are no handle elements).
      const resizable = page
        .locator(
          '[data-calendar-surface="timegrid"] [data-event-key][data-timed]:not([data-readonly])',
        )
        .nth(3);
      const resizeBox = await resizable.boundingBox();
      if (resizeBox) {
        const hx = resizeBox.x + resizeBox.width / 2;
        const hy = resizeBox.y + resizeBox.height - 2;
        results.dragResize = {
          ...(await record(page, async () => {
            await page.mouse.move(hx, hy);
            await page.mouse.down();
            for (let step = 1; step <= 60; step += 1) await page.mouse.move(hx, hy + step * 3);
            await page.keyboard.press("Escape");
            await page.mouse.up();
          })),
          result: undefined,
        };
      }
      const empty = await page
        .locator('[data-calendar-surface="timegrid"] [data-day]')
        .first()
        .boundingBox();
      if (empty) {
        const x = empty.x + empty.width / 2;
        const y = empty.y + 40;
        results.dragCreate = {
          ...(await record(page, async () => {
            await page.mouse.move(x, y);
            await page.mouse.down();
            for (let step = 1; step <= 60; step += 1) await page.mouse.move(x + step, y + step * 3);
            await page.keyboard.press("Escape");
            await page.mouse.up();
          })),
          result: undefined,
        };
      }
    }

    // 5. Heap: after loading, then after paging through a year of weeks and back.
    await page.goto(`${origin}/calendar?view=week&date=${today}`, {
      waitUntil: "domcontentloaded",
    });
    await settled(page);
    const heapStart = await heapMb(cdp);
    for (let step = 0; step < 52; step += 1) {
      await page.keyboard.press("j");
      await settled(page);
    }
    const heapAfterYear = await heapMb(cdp);
    await page.keyboard.press("t");
    await settled(page);
    const heapAfterToday = await heapMb(cdp);
    results.heapMb = {
      start: heapStart,
      afterPagingAYear: heapAfterYear,
      afterReturningToToday: heapAfterToday,
    };

    // 6. WebSocket payloads: size of week snapshots.
    const snapshotFrames = frames.filter((frame) => frame.snapshot);
    results.webSocket = {
      frames: frames.length,
      totalKb: round(frames.reduce((sum, frame) => sum + frame.bytes, 0) / 1024),
      totalWireKb: round(frames.reduce((sum, frame) => sum + frame.wire, 0) / 1024),
      snapshotKb: stats(snapshotFrames.map((frame) => frame.bytes / 1024)),
      snapshotWireKb: stats(snapshotFrames.map((frame) => frame.wire / 1024)),
    };

    const eventTotals = await page.evaluate(
      () => document.querySelectorAll("[data-event-key]").length,
    );
    results.eventsOnScreenAtEnd = eventTotals;
  } finally {
    await browser.close().catch(() => {});
    server.child.kill("SIGTERM");
  }
  const out = NodePath.resolve(repoRoot, args.out);
  NodeFS.mkdirSync(NodePath.dirname(out), { recursive: true });
  NodeFS.writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
