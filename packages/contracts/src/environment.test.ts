import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { ExecutionEnvironmentDescriptor } from "./environment.ts";

const decodeDescriptor = Schema.decodeUnknownSync(ExecutionEnvironmentDescriptor);

const descriptor = {
  environmentId: "environment-1",
  label: "Local",
  platform: { os: "darwin", arch: "arm64" },
  serverVersion: "0.0.32",
  capabilities: {},
} as const;

describe("ExecutionEnvironmentDescriptor", () => {
  it("treats a missing self-update capability as a server that cannot update remotely", () => {
    expect(decodeDescriptor(descriptor).capabilities.serverSelfUpdate).toBeUndefined();
  });

  it("preserves the advertised self-update path", () => {
    expect(
      decodeDescriptor({
        ...descriptor,
        capabilities: { serverSelfUpdate: "boot-service", serverSelfUpdateProgress: true },
      }).capabilities,
    ).toEqual({ serverSelfUpdate: "boot-service", serverSelfUpdateProgress: true });
  });
});
