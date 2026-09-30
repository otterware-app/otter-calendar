import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";

import { descendantEntries, parseElapsed, parsePsRows } from "./ProcessDiagnostics.ts";

describe("ProcessDiagnostics", () => {
  it("parses every elapsed-time shape ps prints", () => {
    expect(parseElapsed("00:07")).toBe(7_000);
    expect(parseElapsed("12:34")).toBe((12 * 60 + 34) * 1_000);
    expect(parseElapsed("01:02:03")).toBe((3_600 + 2 * 60 + 3) * 1_000);
    expect(parseElapsed("2-01:02:03")).toBe(((2 * 24 + 1) * 3_600 + 2 * 60 + 3) * 1_000);
    expect(parseElapsed("n/a")).toBeNull();
  });

  it("builds the server's descendant tree from ps output", () => {
    const rows = parsePsRows(
      [
        "    1     0     1 Ss    0.0   1024 10-00:00:00 /sbin/init",
        "  100     1   100 Sl   12.5  20480    01:00:00 node server.js",
        "  200   100   100 Sl    3.0   4096       05:00 claude --print",
        "  300   200   100 S     0.0   2048       04:59 node mcp-helper.js",
        "  400   100   100 S     1.0   1024       00:10 codex app-server",
        "  500     1   500 S     0.0    512       00:01 unrelated",
        "garbage line",
      ].join("\n"),
    );
    const readAtMs = 1_000_000_000;

    const entries = descendantEntries(rows, 100, readAtMs);

    expect(entries.map((entry) => [entry.pid, entry.depth])).toEqual([
      [200, 0],
      [300, 1],
      [400, 0],
    ]);
    expect(entries[0]).toMatchObject({
      ppid: 100,
      pgid: Option.some(100),
      cpuPercent: 3,
      rssBytes: 4096 * 1024,
      elapsed: "05:00",
      command: "claude --print",
      childPids: [300],
      startTimeMs: readAtMs - 5 * 60 * 1_000,
    });
  });
});
