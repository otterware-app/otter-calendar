/**
 * ProcessDiagnostics - the server's child process tree, read with `ps`, and a
 * guarded way to signal one of those children (a stuck provider CLI, say).
 *
 * @module ProcessDiagnostics
 */
import type {
  ServerProcessDiagnosticsEntry,
  ServerProcessDiagnosticsResult,
  ServerProcessSignal,
  ServerSignalProcessResult,
} from "@t3tools/contracts";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import * as ProcessRunner from "../processRunner.ts";

export interface ProcessRow {
  readonly pid: number;
  readonly ppid: number;
  readonly pgid: number;
  readonly status: string;
  readonly cpuPercent: number;
  readonly rssBytes: number;
  readonly elapsed: string;
  readonly elapsedMs: number;
  readonly command: string;
}

const PS_COLUMNS = "pid=,ppid=,pgid=,stat=,pcpu=,rss=,etime=,command=";
// `ps` reports elapsed time in whole seconds, so a start time derived from it
// can drift by a second between two reads of the same process.
const START_TIME_TOLERANCE_MS = 2_000;

export class ProcessTreeReadError extends Schema.TaggedError<ProcessTreeReadError>()(
  "ProcessTreeReadError",
  { detail: Schema.String, cause: Schema.optional(Schema.Defect()) },
) {
  override get message(): string {
    return this.detail;
  }
}

export class ProcessDiagnostics extends Context.Service<
  ProcessDiagnostics,
  {
    readonly read: Effect.Effect<ServerProcessDiagnosticsResult>;
    readonly signal: (input: {
      readonly pid: number;
      readonly startTimeMs: number;
      readonly signal: ServerProcessSignal;
    }) => Effect.Effect<ServerSignalProcessResult>;
  }
>()("t3/diagnostics/ProcessDiagnostics") {}

/** `[[dd-]hh:]mm:ss` to milliseconds, or null when `ps` printed something else. */
export function parseElapsed(elapsed: string): number | null {
  const match = /^(?:(?:(\d+)-)?(\d+):)?(\d+):(\d+)$/.exec(elapsed);
  if (!match) return null;
  const [, days = "0", hours = "0", minutes = "0", seconds = "0"] = match;
  return (
    (((Number(days) * 24 + Number(hours)) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1_000
  );
}

export function parsePsRows(output: string): ReadonlyArray<ProcessRow> {
  const rowPattern =
    /^\s*(\d+)\s+(\d+)\s+(-?\d+)\s+(\S+)\s+(\d+(?:\.\d*)?|\.\d+)\s+(\d+)\s+(\S+)\s+(.+)$/;
  return output.split(/\r?\n/).flatMap((line) => {
    const match = rowPattern.exec(line);
    if (!match) return [];
    const [, pid, ppid, pgid, status, cpu, rssKiB, elapsed, command] = match;
    const elapsedMs = parseElapsed(elapsed ?? "");
    if (elapsedMs === null || !command || !status || !elapsed) return [];
    return [
      {
        pid: Number(pid),
        ppid: Number(ppid),
        pgid: Number(pgid),
        status,
        cpuPercent: Number(cpu),
        rssBytes: Number(rssKiB) * 1024,
        elapsed,
        elapsedMs,
        command: command.trim(),
      },
    ];
  });
}

/** Every descendant of `rootPid`, depth-first, with depth counted from its children. */
export function descendantEntries(
  rows: ReadonlyArray<ProcessRow>,
  rootPid: number,
  readAtMs: number,
): ReadonlyArray<ServerProcessDiagnosticsEntry> {
  const childrenByParent = new Map<number, ProcessRow[]>();
  for (const row of rows) {
    const children = childrenByParent.get(row.ppid) ?? [];
    children.push(row);
    childrenByParent.set(row.ppid, children);
  }
  const childrenOf = (pid: number) =>
    (childrenByParent.get(pid) ?? []).toSorted((left, right) => left.pid - right.pid);

  const entries: ServerProcessDiagnosticsEntry[] = [];
  const visited = new Set<number>([rootPid]);
  const stack = childrenOf(rootPid)
    .toReversed()
    .map((row) => ({ row, depth: 0 }));
  while (stack.length > 0) {
    const { row, depth } = stack.pop()!;
    if (visited.has(row.pid)) continue;
    visited.add(row.pid);
    const children = childrenOf(row.pid);
    entries.push({
      pid: row.pid,
      startTimeMs: Math.max(0, Math.floor((readAtMs - row.elapsedMs) / 1_000) * 1_000),
      ppid: row.ppid,
      pgid: Option.some(row.pgid),
      status: row.status,
      cpuPercent: row.cpuPercent,
      rssBytes: row.rssBytes,
      elapsed: row.elapsed,
      command: row.command,
      depth,
      childPids: children.map((child) => child.pid),
    });
    stack.push(...children.toReversed().map((child) => ({ row: child, depth: depth + 1 })));
  }
  return entries;
}

const make = Effect.gen(function* () {
  const runner = yield* ProcessRunner.ProcessRunner;
  const platform = yield* HostProcessPlatform;

  const readTree = Effect.gen(function* () {
    if (platform === "win32") {
      return yield* new ProcessTreeReadError({
        detail: "Process diagnostics are not available on Windows.",
      });
    }
    const readAt = yield* DateTime.now;
    const result = yield* runner
      .run({ command: "ps", args: ["-A", "-o", PS_COLUMNS], timeout: "5 seconds" })
      .pipe(
        Effect.mapError(
          (cause) => new ProcessTreeReadError({ detail: "Could not run ps.", cause }),
        ),
      );
    if (result.code !== 0) {
      return yield* new ProcessTreeReadError({
        detail: `ps exited with code ${String(result.code)}.`,
      });
    }
    return {
      readAt,
      processes: descendantEntries(
        parsePsRows(result.stdout),
        process.pid,
        DateTime.toEpochMillis(readAt),
      ).filter((entry) => !entry.command.includes(PS_COLUMNS)),
    };
  });

  const read: ProcessDiagnostics["Service"]["read"] = readTree.pipe(
    Effect.map(({ readAt, processes }): ServerProcessDiagnosticsResult => ({
      serverPid: process.pid,
      readAt,
      processCount: processes.length,
      totalRssBytes: processes.reduce((total, entry) => total + entry.rssBytes, 0),
      totalCpuPercent: processes.reduce((total, entry) => total + entry.cpuPercent, 0),
      processes,
      error: Option.none(),
    })),
    Effect.catch((error) =>
      DateTime.now.pipe(
        Effect.map((readAt): ServerProcessDiagnosticsResult => ({
          serverPid: process.pid,
          readAt,
          processCount: 0,
          totalRssBytes: 0,
          totalCpuPercent: 0,
          processes: [],
          error: Option.some({ message: error.message }),
        })),
      ),
    ),
  );

  const signal: ProcessDiagnostics["Service"]["signal"] = Effect.fn("ProcessDiagnostics.signal")(
    function* (input) {
      const refused = (message: string): ServerSignalProcessResult => ({
        pid: input.pid,
        signal: input.signal,
        signaled: false,
        message: Option.some(message),
      });
      if (input.pid === process.pid) {
        return refused("Refusing to signal the server process.");
      }
      // Re-read the tree so a recycled pid, or a process that is no longer
      // the server's descendant, is never signalled.
      const current = yield* Effect.result(readTree);
      if (current._tag === "Failure") {
        return refused(`Could not refresh process ${input.pid}: ${current.failure.message}`);
      }
      const selected = current.success.processes.find(
        (entry) =>
          entry.pid === input.pid &&
          Math.abs(entry.startTimeMs - input.startTimeMs) <= START_TIME_TOLERANCE_MS,
      );
      if (!selected) {
        return refused(`Process ${input.pid} is no longer a child of the server.`);
      }
      return yield* Effect.try({
        try: (): ServerSignalProcessResult => {
          process.kill(input.pid, input.signal);
          return {
            pid: input.pid,
            signal: input.signal,
            signaled: true,
            message: Option.none(),
          };
        },
        catch: (cause) =>
          cause instanceof Error ? cause.message : `Failed to signal process ${input.pid}.`,
      }).pipe(Effect.catch((message) => Effect.succeed(refused(message))));
    },
  );

  return ProcessDiagnostics.of({ read, signal });
});

export const layer = Layer.effect(ProcessDiagnostics, make).pipe(
  Layer.provide(ProcessRunner.layer),
);
