/**
 * Thin CLI entry: loads the full CLI module graph only when this file is the
 * process entrypoint (not when a test or the bundle imports it).
 */
import { isEntrypoint } from "./entrypoint.ts";

if (
  isEntrypoint({
    moduleUrl: import.meta.url,
    entryPath: process.argv[1],
    runtimeMain: import.meta.main,
  })
) {
  const { runCli } = await import("./binCli.ts");
  runCli();
}
