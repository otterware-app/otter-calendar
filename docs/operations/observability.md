# Observability

> For maintainers. Using the app? See [docs/user](../user/).

The server has one observability model:

- pretty logs go to stdout for humans;
- completed spans go to a local NDJSON trace file, which is always on;
- traces, metrics, and logs can also be exported over OTLP to a backend such as Grafana LGTM.

**Settings → Diagnostics** in the web and desktop app shows the environment's processes and a
summary of its trace file (failures, slow spans, span logs), and copies the logs folder path.

## Where things are

Runtime state lives in the state directory: `<home>/userdata` (`~/.otter-scaffold/userdata` by
default, or under `--base-dir` / `T3CODE_HOME`). A dev run from the main checkout uses
`~/.otter-scaffold/dev`; a dev run in a linked worktree uses `<worktree>/.t3/userdata`. Inside it:

| Path                       | Contents                                                 |
| -------------------------- | -------------------------------------------------------- |
| `logs/server.trace.ndjson` | Completed spans, rotated as `.1`, `.2`, …                |
| `logs/provider/`           | Native provider event logs, separate from the trace file |
| `logs/boot-service.log`    | stdout and stderr of the background service              |
| `server-runtime.json`      | The running server's pid and port                        |

An SSH-launched server writes its stdout and stderr to `~/.otter-scaffold/ssh-launch/<key>/server.log`
on the remote host. There is no other server log file: a log message reaches the trace file only
when it is emitted inside a span, where `Logger.tracerLogger` attaches it as a span event.

When an OTLP logs endpoint is configured, the server exports every log record with its trace and
span IDs instead, and the trace file stops carrying log messages.

## The trace file

Each line is an `effect-span` or `otlp-span` record with `name`, `traceId`, `spanId`,
`parentSpanId`, `durationMs`, `attributes`, and `events`; `effect-span` records also carry `exit`
(`Success`, `Failure`, or `Interrupted`). The schemas live in
[`packages/shared/src/observability.ts`](../../packages/shared/src/observability.ts).

`t3 trace summary` (`otter-scaffold trace summary` when installed) reads the file and its rotated
backups directly, so it works while the server is stalled or stopped. It prints counts, rates, and
latency percentiles per span name:

```bash
t3 trace summary --since 30m --limit 40
```

It reads `T3CODE_TRACE_FILE` if set, else the file under `--base-dir` or `T3CODE_HOME`. For a dev
run or a copied file, set `T3CODE_TRACE_FILE`.

A few `jq` starting points:

```bash
TRACE_FILE="${T3CODE_HOME:-$HOME/.otter-scaffold}/userdata/logs/server.trace.ndjson"

# Failed spans
jq -c 'select(.type == "effect-span" and .exit._tag != "Success") | {name, durationMs, exit, attributes}' "$TRACE_FILE"

# Slow spans
jq -c 'select(.durationMs > 1000) | {name, durationMs, traceId, spanId}' "$TRACE_FILE"

# One trace
jq -r 'select(.traceId == "TRACE_ID") | [.name, .spanId, (.parentSpanId // "-"), .durationMs] | @tsv' "$TRACE_FILE"
```

DPoP proof failures carry the `environment.dpop.failure_code` span attribute. A `time_window`
failure means a signed proof was too old or too far in the future: a clock problem on either
device, or a delayed request.

## Event loop stalls

[`EventLoopMonitor.ts`](../../apps/server/src/observability/EventLoopMonitor.ts) samples the event
loop every 30 s and records a `server.eventLoop.stall` span (level `Warn`, so it survives
`T3CODE_TRACE_MIN_LEVEL=Warn`) when the loop stalled for more than 2 s since the previous sample.
The span time is when the sample ran, not when the stall happened. `delayMaxMs` can undercount by up
to 1 s, a stall that ends just as a sample runs can be missed, and the first sample after launch is
skipped because migrations can block the loop on a large database. Sleep reads as delay on macOS,
so a sample counts only when the loop was busy for at least `delayMaxMs`.

CPU times and page faults cover the whole process over the sample window. Read them together:

- high `cpuSystemMs` with many page faults means memory pressure;
- high `cpuUserMs` with few page faults means JavaScript work or garbage collection;
- low CPU with few major faults points at synchronous disk I/O, such as SQLite or trace writes;
- many `involuntaryContextSwitches` mean other processes competed for the CPU.

## Export over OTLP

Run a local Grafana LGTM stack:

```bash
docker run --name lgtm -p 3000:3000 -p 4317:4317 -p 4318:4318 --rm -ti grafana/otel-lgtm
```

Then start the server or app from a shell with the endpoints set (Grafana is at
`http://localhost:3000`, login `admin` / `admin`):

```bash
export T3CODE_OTLP_TRACES_URL=http://localhost:4318/v1/traces
export T3CODE_OTLP_METRICS_URL=http://localhost:4318/v1/metrics
export T3CODE_OTLP_LOGS_URL=http://localhost:4318/v1/logs
export OTEL_RESOURCE_ATTRIBUTES=deployment.environment.name=development
vp run dev   # or vp run dev:desktop, or the installed CLI
```

For the packaged desktop app, launch its executable from that shell, for example
`"/Applications/Otter Scaffold.app/Contents/MacOS/Otter Scaffold"`; apps launched from Finder or the
Dock do not inherit shell variables. The server reads this configuration at start, so restart it
fully after a change. The endpoints can also be set in `settings.json` under `observability`
(`otlpTracesUrl`, `otlpMetricsUrl`, `otlpLogsUrl`).

Services report as `t3code-server` (the backend), `t3code-desktop` (the Electron main process,
traces and logs only), and `t3code-web` (browser spans, which the client sends to its server and
the server forwards). The names are fixed, all in the `t3code` namespace; tell installations apart
with resource attributes such as `deployment.environment.name`. The only metrics are
`t3_rpc_requests_total` and `t3_rpc_request_duration`.

### Environment variables

| Variable                                              | Default     | Meaning                                            |
| ----------------------------------------------------- | ----------- | -------------------------------------------------- |
| `T3CODE_TRACE_FILE`                                   | see above   | Trace file path                                    |
| `T3CODE_TRACE_MAX_BYTES`                              | `10485760`  | Size before rotation                               |
| `T3CODE_TRACE_MAX_FILES`                              | `10`        | Rotated files kept                                 |
| `T3CODE_TRACE_BATCH_WINDOW_MS`                        | `1000`      | Flush window                                       |
| `T3CODE_TRACE_MIN_LEVEL`                              | `Info`      | Minimum span level written                         |
| `T3CODE_TRACE_TIMING_ENABLED`                         | `true`      | Timing metadata on spans                           |
| `T3CODE_OTLP_TRACES_URL`, `_METRICS_URL`, `_LOGS_URL` | unset       | OTLP endpoints per signal                          |
| `T3CODE_OTLP_EXPORT_INTERVAL_MS`                      | `10000`     | Export interval                                    |
| `T3CODE_OTLP_HEADERS`                                 | unset       | Headers for all three exporters, `key=value` pairs |
| `T3CODE_OTLP_PROTOCOL`                                | `http/json` | `http/json` or `http/protobuf`                     |

The server and desktop app also read the standard `OTEL_EXPORTER_OTLP_{TRACES,METRICS,LOGS}_ENDPOINT`
and `OTEL_EXPORTER_OTLP_ENDPOINT` (with `/v1/<signal>` appended), with their own `_HEADERS` and
`_PROTOCOL` variables (default `http/protobuf`). Per signal, a non-blank `T3CODE_OTLP_*_URL` wins,
then an OTEL endpoint, then `settings.json`. An invalid endpoint, protocol, or header value turns
that signal off with a startup warning.

`T3CODE_OTEL_SDK_DISABLED` or `OTEL_SDK_DISABLED=true` turns off all OTLP export in the server and
desktop app; `T3CODE_OTEL_SDK_DISABLED=false` re-enables it on a machine that sets
`OTEL_SDK_DISABLED` globally. `OTEL_{TRACES,METRICS,LOGS}_EXPORTER=none` turns off one signal,
unless a `T3CODE_OTLP_*_URL` sets it. The local trace file and stdout are never affected.

## Adding tracing

- Put spans on boundaries: RPC methods, provider adapter calls, external processes, persistence
  writes, queue handoffs. `Effect.fn("name")` is usually the boundary already; helpers should
  inherit the active span.
- Put IDs and other high-cardinality detail on spans with `Effect.annotateCurrentSpan`, never on
  metric labels. Metric labels stay low-cardinality: operation kind, method, provider kind,
  outcome.
- Log inside spans so messages land in the trace. Attach counters and timers with `withMetrics`
  from [`Metrics.ts`](../../apps/server/src/observability/Metrics.ts).

## Heap snapshots

Send the server `SIGUSR2` to write a V8 heap snapshot to its logs directory as
`server-<pid>-<timestamp>.heapsnapshot`; open it in the Memory tab of Chrome DevTools. Use the pid
in `server-runtime.json`, and check it first: a stale file can name a different process, and the
desktop app or service launcher exits on `SIGUSR2`.

```bash
pid="$(jq .pid "${T3CODE_HOME:-$HOME/.otter-scaffold}/userdata/server-runtime.json")"
ps -p "$pid" -o command=
kill -USR2 "$pid"
```

The server pauses while it writes, which can take a minute for a large heap, and the write needs
about as much free memory as the heap. The file contains everything in memory, including tokens and
conversations: never share it, and delete it when you are done.
