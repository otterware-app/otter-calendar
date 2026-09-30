import * as Schema from "effect/Schema";

import {
  EnvironmentId,
  ForwardCompatibleOptional,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";

/** Wire version for orchestration snapshots, streams, commands, and RPC payloads. */
export const ORCHESTRATION_PROTOCOL_VERSION = 2;
export const ORCHESTRATION_PROTOCOL_QUERY_PARAM = "orchestrationProtocol";
export const ORCHESTRATION_PROTOCOL_HEADER = "x-t3-orchestration-protocol";

export const ExecutionEnvironmentPlatformOs = Schema.Literals([
  "darwin",
  "linux",
  "windows",
  "unknown",
]);
export type ExecutionEnvironmentPlatformOs = typeof ExecutionEnvironmentPlatformOs.Type;

export const ExecutionEnvironmentPlatformArch = Schema.Literals(["arm64", "x64", "other"]);
export type ExecutionEnvironmentPlatformArch = typeof ExecutionEnvironmentPlatformArch.Type;

/**
 * The curated set of machine shapes and OS identities an environment can wear as its icon.
 * Servers detect one from the hardware they run on (`platform.machine`), and
 * the `environmentIcon` server setting lets a user pick one instead.
 */
export const ENVIRONMENT_MACHINE_KINDS = [
  "server",
  "cloud",
  "linux",
  "desktop",
  "laptop",
  "mac-mini",
  "mac-studio",
] as const;
export const EnvironmentMachineKind = Schema.Literals(ENVIRONMENT_MACHINE_KINDS);
export type EnvironmentMachineKind = typeof EnvironmentMachineKind.Type;
export const isEnvironmentMachineKind = Schema.is(EnvironmentMachineKind);

export const ExecutionEnvironmentPlatform = Schema.Struct({
  os: ExecutionEnvironmentPlatformOs,
  arch: ExecutionEnvironmentPlatformArch,
  /** Hardware shape detected at startup. Absent when the host gives no usable
      signal (containers, Windows, unknown DMI), on servers that predate it, or
      when a newer server names a kind this build cannot draw. */
  machine: ForwardCompatibleOptional(EnvironmentMachineKind),
});

/**
 * Where a new thread runs: the project's current checkout ("local") or a
 * fresh git worktree ("worktree"). Lives here (not settings.ts) so
 * orchestration contracts can reference it without an import cycle.
 */
export const ThreadEnvMode = Schema.Literals(["local", "worktree"]);
export type ThreadEnvMode = typeof ThreadEnvMode.Type;

/**
 * How a new worktree populates git submodules: every nested level, only the
 * ones this repository declares, or not at all.
 */
export const WorktreeSubmodules = Schema.Literals(["recursive", "top-level", "none"]);
export type WorktreeSubmodules = typeof WorktreeSubmodules.Type;
export type ExecutionEnvironmentPlatform = typeof ExecutionEnvironmentPlatform.Type;

/** How a server can replace itself with another version when asked over RPC.
    New servers only advertise the stable launcher-backed "boot-service" path;
    "respawn" remains decodable for compatibility with older servers. */
export const ServerSelfUpdateMethod = Schema.Literals(["boot-service", "respawn"]);
export type ServerSelfUpdateMethod = typeof ServerSelfUpdateMethod.Type;

/** What update path a client should offer for a server: one of the RPC
    self-update methods above, or "desktop-managed" when the backend's
    version belongs to the desktop app supervising it. The desktop app updates
    itself, so clients offer no remote update for these servers. */
export const ServerSelfUpdateCapability = Schema.Literals([
  "boot-service",
  "respawn",
  "desktop-managed",
]);
export type ServerSelfUpdateCapability = typeof ServerSelfUpdateCapability.Type;

export const ExecutionEnvironmentCapabilities = Schema.Struct({
  connectionProbe: Schema.optionalKey(Schema.Boolean),
  /** Server streams themes an environment publishes (`environmentThemesUpdated`). */
  environmentThemes: Schema.optionalKey(Schema.Boolean),
  /** The update path clients should offer for this server. Absent on
      servers that must be relaunched manually (dev checkouts, Windows
      foreground runs). */
  serverSelfUpdate: Schema.optionalKey(ServerSelfUpdateCapability),
  /** Server can stream self-update progress before acknowledging the
      restart. Clients fall back to server.updateServer when absent. */
  serverSelfUpdateProgress: Schema.optionalKey(Schema.Boolean),
  /** Server detects `platform.machine` and persists the `environmentIcon`
      setting. */
  environmentIcon: Schema.optionalKey(Schema.Boolean),
});
export type ExecutionEnvironmentCapabilities = typeof ExecutionEnvironmentCapabilities.Type;

export const ExecutionEnvironmentDescriptor = Schema.Struct({
  environmentId: EnvironmentId,
  label: TrimmedNonEmptyString,
  platform: ExecutionEnvironmentPlatform,
  serverVersion: TrimmedNonEmptyString,
  /** Absent on hosts from before explicit orchestration protocol negotiation. */
  orchestrationProtocolVersion: Schema.optionalKey(Schema.Int),
  capabilities: ExecutionEnvironmentCapabilities,
});
export type ExecutionEnvironmentDescriptor = typeof ExecutionEnvironmentDescriptor.Type;

export const RepositoryIdentityLocator = Schema.Struct({
  source: Schema.Literal("git-remote"),
  remoteName: TrimmedNonEmptyString,
  remoteUrl: TrimmedNonEmptyString,
});
export type RepositoryIdentityLocator = typeof RepositoryIdentityLocator.Type;

export const RepositoryIdentity = Schema.Struct({
  canonicalKey: TrimmedNonEmptyString,
  locator: RepositoryIdentityLocator,
  /** Repository browser URL resolved from the server's configured hosting account. */
  webUrl: Schema.optionalKey(TrimmedNonEmptyString),
  rootPath: Schema.optionalKey(TrimmedNonEmptyString),
  displayName: Schema.optionalKey(TrimmedNonEmptyString),
  provider: Schema.optionalKey(TrimmedNonEmptyString),
  owner: Schema.optionalKey(TrimmedNonEmptyString),
  name: Schema.optionalKey(TrimmedNonEmptyString),
});
export type RepositoryIdentity = typeof RepositoryIdentity.Type;

export const ScopedProjectRef = Schema.Struct({
  environmentId: EnvironmentId,
  projectId: ProjectId,
});
export type ScopedProjectRef = typeof ScopedProjectRef.Type;

export const ScopedThreadRef = Schema.Struct({
  environmentId: EnvironmentId,
  threadId: ThreadId,
});
export type ScopedThreadRef = typeof ScopedThreadRef.Type;
