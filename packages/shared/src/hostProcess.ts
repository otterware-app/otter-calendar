import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as NodeOS from "node:os";
import * as NodeSea from "node:sea";

export const HostProcessPlatform = Context.Reference<NodeJS.Platform>(
  "@t3tools/shared/hostProcess/HostProcessPlatform",
  {
    defaultValue: () => process.platform,
  },
);

export const HostProcessArchitecture = Context.Reference<NodeJS.Architecture>(
  "@t3tools/shared/hostProcess/HostProcessArchitecture",
  {
    defaultValue: () => process.arch,
  },
);

export const HostProcessHostname = Context.Reference<string>(
  "@t3tools/shared/hostProcess/HostProcessHostname",
  {
    defaultValue: () => NodeOS.hostname(),
  },
);

export const HostProcessEnvironment = Context.Reference<NodeJS.ProcessEnv>(
  "@t3tools/shared/hostProcess/HostProcessEnvironment",
  {
    defaultValue: () => process.env,
  },
);

export const HostProcessWorkingDirectory = Context.Reference<string>(
  "@t3tools/shared/hostProcess/HostProcessWorkingDirectory",
  {
    defaultValue: () => process.cwd(),
  },
);

export const HostProcessExecutablePath = Context.Reference<string>(
  "@t3tools/shared/hostProcess/HostProcessExecutablePath",
  {
    defaultValue: () => process.execPath,
  },
);

export const HostProcessArguments = Context.Reference<ReadonlyArray<string>>(
  "@t3tools/shared/hostProcess/HostProcessArguments",
  {
    defaultValue: () => process.argv,
  },
);

/**
 * The command the shell was given, before Node resolved it to the binary:
 * `t3` for a PATH lookup, `./t3` or the launcher symlink for an explicit
 * path. `process.argv[0]` and `execPath` are always the resolved binary.
 */
export const HostProcessInvokedAs = Context.Reference<string>(
  "@t3tools/shared/hostProcess/HostProcessInvokedAs",
  {
    defaultValue: () => process.argv0,
  },
);

/**
 * Whether this process is a Node single-executable rather than a script run
 * by a Node on the machine. Code that needs a sibling file or a Node to run
 * one branches on this: an executable hosts such things as hidden
 * subcommands of itself.
 */
export const HostProcessIsExecutable = Context.Reference<boolean>(
  "@t3tools/shared/hostProcess/HostProcessIsExecutable",
  {
    defaultValue: () => NodeSea.isSea(),
  },
);

/** Undefined on platforms without POSIX uids (Windows). */
export const HostProcessUserId = Context.Reference<number | undefined>(
  "@t3tools/shared/hostProcess/HostProcessUserId",
  {
    defaultValue: () => process.getuid?.(),
  },
);

export const isHostWindows = Effect.map(HostProcessPlatform, (platform) => platform === "win32");
