import { assert, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import * as ExternalLauncher from "./externalLauncher.ts";

function makeMockDetachedHandle(onUnref: () => void) {
  return ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(1),
    exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
    isRunning: Effect.succeed(true),
    kill: () => Effect.void,
    unref: Effect.sync(() => {
      onUnref();
      return Effect.void;
    }),
    stdin: Sink.drain,
    stdout: Stream.empty,
    stderr: Stream.empty,
    all: Stream.empty,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
  });
}

const testLayer = (input: {
  readonly platform: NodeJS.Platform;
  readonly env?: Record<string, string>;
  readonly onSpawn: (command: ChildProcess.StandardCommand) => void;
  readonly onUnref: () => void;
}) =>
  Layer.mergeAll(
    ExternalLauncher.layer.pipe(
      Layer.provide(
        Layer.succeed(
          ChildProcessSpawner.ChildProcessSpawner,
          ChildProcessSpawner.make((command) =>
            Effect.sync(() => {
              if (!ChildProcess.isStandardCommand(command)) {
                throw new Error("Expected a standard command");
              }
              input.onSpawn(command);
              return makeMockDetachedHandle(input.onUnref);
            }),
          ),
        ),
      ),
    ),
    Layer.succeed(HostProcessPlatform, input.platform),
    ConfigProvider.layer(ConfigProvider.fromEnv({ env: input.env ?? {} })),
  );

it.effect("launches the default browser through the platform command", () => {
  let spawned: ChildProcess.StandardCommand | undefined;
  let didUnref = false;
  return Effect.gen(function* () {
    const launcher = yield* ExternalLauncher.ExternalLauncher;

    yield* launcher.launchBrowser("https://example.com/some path");

    assert.ok(spawned);
    assert.equal(spawned.command, "xdg-open");
    assert.deepEqual(spawned.args, ["https://example.com/some path"]);
    assert.equal(spawned.options.detached, true);
    assert.equal(didUnref, true);
  }).pipe(
    Effect.provide(
      testLayer({
        platform: "linux",
        onSpawn: (command) => {
          spawned = command;
        },
        onUnref: () => {
          didUnref = true;
        },
      }),
    ),
  );
});

it.effect("launches through Windows PowerShell from WSL", () => {
  let spawned: ChildProcess.StandardCommand | undefined;
  return Effect.gen(function* () {
    const launcher = yield* ExternalLauncher.ExternalLauncher;

    yield* launcher.launchBrowser("https://example.com");

    assert.ok(spawned);
    assert.equal(spawned.command, "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe");
    assert.equal(spawned.args.at(-2), "-EncodedCommand");
  }).pipe(
    Effect.provide(
      testLayer({
        platform: "linux",
        env: { WSL_DISTRO_NAME: "Ubuntu" },
        onSpawn: (command) => {
          spawned = command;
        },
        onUnref: () => {},
      }),
    ),
  );
});
