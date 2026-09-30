/**
 * Codex rate-limit snapshots, as the adapter needs them to tell the user when a
 * usage-limited turn can run again.
 *
 * @module provider/CodexRateLimits
 */
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";

interface CodexRateLimitWindow {
  readonly usedPercent: number;
  readonly resetsAt?: number | null;
  readonly windowDurationMins?: number | null;
}

/** Structural view of the generated `RateLimitSnapshot`. */
export interface CodexRateLimitSnapshot {
  readonly limitId?: string | null;
  readonly planType?: string | null;
  readonly rateLimitReachedType?: string | null;
  readonly primary?: CodexRateLimitWindow | null;
  readonly secondary?: CodexRateLimitWindow | null;
}

/**
 * Codex sends `account/rateLimits/updated` as a partial view of the snapshot: a
 * field the update omits keeps the value observed earlier in the session, so a
 * later notification that only names the limit it reached must not drop the
 * windows an earlier one carried.
 */
export function mergeCodexRateLimits(
  previous: CodexRateLimitSnapshot | undefined,
  update: CodexRateLimitSnapshot,
): CodexRateLimitSnapshot | undefined {
  // Model-specific snapshots (such as Spark) describe a different allowance
  // and must not overwrite the main one.
  if (update.limitId && update.limitId !== "codex") return previous;
  if (!previous) return update;
  return {
    ...previous,
    ...(update.limitId !== undefined ? { limitId: update.limitId } : {}),
    ...(update.planType !== undefined ? { planType: update.planType } : {}),
    ...(update.rateLimitReachedType !== undefined
      ? { rateLimitReachedType: update.rateLimitReachedType }
      : {}),
    ...(update.primary !== undefined ? { primary: update.primary } : {}),
    ...(update.secondary !== undefined ? { secondary: update.secondary } : {}),
  };
}

function isoFromEpochSeconds(value: number | null | undefined): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  const dt = DateTime.make(value * 1000);
  return Option.isSome(dt) ? DateTime.formatIso(dt.value) : undefined;
}

/** When every exhausted window has reset, or null when that is unknown. */
export function codexUsageLimitResetAt(
  snapshot: CodexRateLimitSnapshot | undefined,
): string | null {
  if (!snapshot || (snapshot.limitId && snapshot.limitId !== "codex")) return null;
  const exhausted = [snapshot.primary, snapshot.secondary].filter(
    (window): window is CodexRateLimitWindow =>
      window != null && Number.isFinite(window.usedPercent) && window.usedPercent >= 100,
  );
  const resets = exhausted.map((window) => isoFromEpochSeconds(window.resetsAt));
  if (resets.length === 0 || resets.some((reset) => reset === undefined)) return null;
  return resets.reduce<string | null>(
    (latest, reset) =>
      latest === null || Date.parse(reset!) > Date.parse(latest) ? reset! : latest,
    null,
  );
}
