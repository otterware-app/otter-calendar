import {
  type CalendarOptimisticStore,
  createCalendarOptimisticStore,
} from "@t3tools/client-runtime/calendar/optimistic";
import {
  type CalendarInstanceMap,
  createCalendarEnvironmentAtoms,
  EMPTY_CALENDAR_INSTANCES,
} from "@t3tools/client-runtime/state/calendar";
import type { CalendarDirectory, EnvironmentId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/unstable/reactivity";

import { connectionAtomRuntime } from "../connection/runtime";

export const calendarEnvironment = createCalendarEnvironmentAtoms(connectionAtomRuntime);

function failureMessage(cause: Cause.Cause<unknown>): string {
  const error = Cause.squash(cause);
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "The calendar could not be loaded.";
}

// ── Directory parts ──────────────────────────────────────────────────
// Screens read the part of the directory they render. The shared reducer keeps unchanged parts
// identical, so a sync that only moves an account's `lastSyncedAt` does not re-render the agenda.

function directoryPart<A>(label: string, select: (directory: CalendarDirectory) => A) {
  return Atom.family((environmentId: EnvironmentId) =>
    Atom.make((get): A | null => {
      const result = get(calendarEnvironment.directory({ environmentId, input: {} }));
      const directory = Option.getOrNull(AsyncResult.value(result));
      return directory === null ? null : select(directory);
    }).pipe(Atom.withLabel(`mobile:calendar:${label}:${environmentId}`)),
  );
}

/** Null until the environment's directory arrives. */
export const calendarCalendarsAtom = directoryPart("calendars", (directory) => directory.calendars);
export const calendarAccountsAtom = directoryPart("accounts", (directory) => directory.accounts);
export const calendarPreferencesAtom = directoryPart(
  "preferences",
  (directory) => directory.preferences,
);

/** Why the directory failed to load, while it has nothing to show. */
export const calendarDirectoryErrorAtom = Atom.family((environmentId: EnvironmentId) =>
  Atom.make((get): string | null => {
    const result = get(calendarEnvironment.directory({ environmentId, input: {} }));
    return result._tag === "Failure" ? failureMessage(result.cause) : null;
  }).pipe(Atom.withLabel(`mobile:calendar:directory-error:${environmentId}`)),
);

// ── Week chunks ──────────────────────────────────────────────────────

export interface CalendarWeeksView {
  /** One map per requested week, in order; empty while a week is still loading. */
  readonly chunks: ReadonlyArray<CalendarInstanceMap>;
  /** Every requested week has sent its snapshot. */
  readonly loaded: boolean;
  readonly error: string | null;
}

interface CalendarWeeksKey {
  readonly environmentId: EnvironmentId;
  readonly weeks: ReadonlyArray<string>;
  readonly prefetch: ReadonlyArray<string>;
}

function sameChunks(
  left: ReadonlyArray<CalendarInstanceMap>,
  right: ReadonlyArray<CalendarInstanceMap>,
): boolean {
  return left.length === right.length && left.every((chunk, index) => chunk === right[index]);
}

const calendarWeeksFamily = Atom.family((key: string) => {
  const { environmentId, weeks, prefetch } = JSON.parse(key) as CalendarWeeksKey;
  return Atom.make((get): CalendarWeeksView => {
    // Mounted but not read: the neighbouring weeks load in the background, so paging to them is
    // instant, without re-rendering the view when they arrive.
    for (const week of prefetch) {
      get.mount(calendarEnvironment.week({ environmentId, input: { week } }));
    }
    const chunks: CalendarInstanceMap[] = [];
    let loaded = true;
    let error: string | null = null;
    for (const week of weeks) {
      const result = get(calendarEnvironment.week({ environmentId, input: { week } }));
      const chunk = Option.getOrNull(AsyncResult.value(result));
      if (chunk === null) loaded = false;
      chunks.push(chunk ?? EMPTY_CALENDAR_INSTANCES);
      if (result._tag === "Failure" && error === null) error = failureMessage(result.cause);
    }
    const previous = Option.getOrNull(get.self<CalendarWeeksView>());
    if (
      previous !== null &&
      previous.loaded === loaded &&
      previous.error === error &&
      sameChunks(previous.chunks, chunks)
    ) {
      return previous;
    }
    return { chunks, loaded, error };
  }).pipe(Atom.withLabel(`mobile:calendar:weeks:${key}`));
});

/**
 * The week chunks a view shows, read together, plus neighbours to prefetch. Chunks stay cached
 * (the shared family's idle TTL) after a view stops reading them, so paging back is instant.
 */
export function calendarWeeksAtom(input: CalendarWeeksKey): Atom.Atom<CalendarWeeksView> {
  return calendarWeeksFamily(
    JSON.stringify({
      environmentId: input.environmentId,
      weeks: input.weeks,
      prefetch: input.prefetch.filter((week) => !input.weeks.includes(week)),
    }),
  );
}

// ── Optimistic changes ───────────────────────────────────────────────

const optimisticStores = new Map<EnvironmentId, CalendarOptimisticStore>();

/** Pending RSVPs, deletes and visibility changes of one environment, shown before the server answers. */
export function calendarOptimisticStore(environmentId: EnvironmentId): CalendarOptimisticStore {
  let store = optimisticStores.get(environmentId);
  if (store === undefined) {
    store = createCalendarOptimisticStore();
    optimisticStores.set(environmentId, store);
  }
  return store;
}
