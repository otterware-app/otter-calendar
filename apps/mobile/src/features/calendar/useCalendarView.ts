import { useAtomValue } from "@effect/atom-react";
import {
  applyOptimisticCalendars,
  applyOptimisticInstances,
} from "@t3tools/client-runtime/calendar/optimistic";
import { mergeCalendarChunks } from "@t3tools/client-runtime/state/calendar";
import {
  type Calendar,
  type CalendarEventInstance,
  type CalendarPreferences,
  DEFAULT_CALENDAR_PREFERENCES,
  type EnvironmentId,
} from "@t3tools/contracts";
import {
  type DayNumber,
  endOfZonedDay,
  systemTimeZone,
  zonedDay,
} from "@t3tools/shared/calendar/time";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";

import {
  calendarCalendarsAtom,
  calendarOptimisticStore,
  calendarPreferencesAtom,
  calendarWeeksAtom,
} from "../../state/calendar";

const EMPTY_CALENDARS: ReadonlyArray<Calendar> = [];

/** Calendars not in the directory yet (a just-connected account) still get a color. */
export const FALLBACK_EVENT_COLOR = "#7c8594";

export interface CalendarViewSettings {
  readonly preferences: CalendarPreferences;
  /** The zone the calendar is shown in: the preference, else the device's. */
  readonly zone: string;
  /** Calendars with pending visibility changes applied. */
  readonly calendars: ReadonlyArray<Calendar>;
  readonly calendarById: ReadonlyMap<string, Calendar>;
  /** Whether the directory has arrived. */
  readonly ready: boolean;
}

/** The directory parts every calendar screen needs, with optimistic calendar changes applied. */
export function useCalendarViewSettings(environmentId: EnvironmentId): CalendarViewSettings {
  const directoryCalendars = useAtomValue(calendarCalendarsAtom(environmentId));
  const directoryPreferences = useAtomValue(calendarPreferencesAtom(environmentId));
  const store = calendarOptimisticStore(environmentId);
  const optimistic = useSyncExternalStore(store.subscribe, store.getState);
  const calendars = useMemo(
    () => applyOptimisticCalendars(directoryCalendars ?? EMPTY_CALENDARS, optimistic),
    [directoryCalendars, optimistic],
  );
  const calendarById = useMemo(
    () => new Map(calendars.map((calendar) => [calendar.calendarId, calendar] as const)),
    [calendars],
  );
  const preferences = directoryPreferences ?? DEFAULT_CALENDAR_PREFERENCES;
  const zone = preferences.timeZone ?? systemTimeZone();
  return useMemo(
    () => ({
      preferences,
      zone,
      calendars,
      calendarById,
      ready: directoryCalendars !== null && directoryPreferences !== null,
    }),
    [preferences, zone, calendars, calendarById, directoryCalendars, directoryPreferences],
  );
}

export interface VisibleInstances {
  /** Instances of the requested weeks, with pending changes applied and hidden calendars removed. */
  readonly instances: ReadonlyArray<CalendarEventInstance>;
  /** Keys with a change in flight, drawn as pending. */
  readonly pendingKeys: ReadonlySet<string>;
  readonly loaded: boolean;
  readonly error: string | null;
}

/**
 * Subscribes to the week chunks covering a view (and prefetches `prefetch`), merged by key. Only
 * this hook's caller re-renders when a chunk changes.
 */
export function useVisibleInstances(
  environmentId: EnvironmentId,
  weeks: ReadonlyArray<string>,
  prefetch: ReadonlyArray<string>,
  calendars: ReadonlyArray<Calendar>,
): VisibleInstances {
  // Keyed by content: callers may hand in a new array with the same weeks.
  const weeksKey = weeks.join(",");
  const prefetchKey = prefetch.join(",");
  const atom = useMemo(
    () =>
      calendarWeeksAtom({
        environmentId,
        weeks: splitKey(weeksKey),
        prefetch: splitKey(prefetchKey),
      }),
    [environmentId, weeksKey, prefetchKey],
  );
  const view = useAtomValue(atom);
  const store = calendarOptimisticStore(environmentId);
  const optimistic = useSyncExternalStore(store.subscribe, store.getState);
  const merged = useMemo(() => mergeCalendarChunks(view.chunks), [view.chunks]);
  const hiddenKey = calendars
    .filter((calendar) => !calendar.visible)
    .map((calendar) => calendar.calendarId)
    .join(",");
  const instances = useMemo(() => {
    const withChanges = applyOptimisticInstances(merged, optimistic);
    if (hiddenKey.length === 0) return withChanges;
    const hidden = new Set(hiddenKey.split(","));
    return withChanges.filter((instance) => !hidden.has(instance.calendarId));
  }, [merged, optimistic, hiddenKey]);
  return {
    instances,
    pendingKeys: optimistic.pendingKeys,
    loaded: view.loaded,
    error: view.error,
  };
}

function splitKey(key: string): ReadonlyArray<string> {
  return key.length === 0 ? [] : key.split(",");
}

/** Today in `zone`, updated at midnight and when the app returns to the foreground. */
export function useToday(zone: string): DayNumber {
  const [today, setToday] = useState(() => zonedDay(Date.now(), zone));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      const now = Date.now();
      const day = zonedDay(now, zone);
      setToday(day);
      if (timer !== undefined) clearTimeout(timer);
      // A little past midnight, so the new day is certainly there.
      timer = setTimeout(update, Math.max(1_000, endOfZonedDay(day, zone) - now + 1_000));
    };
    update();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") update();
    });
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      subscription.remove();
    };
  }, [zone]);
  return today;
}

/** The instant now, refreshed once a minute on the minute (for the current-time line). */
export function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      timer = setTimeout(
        () => {
          setNow(Date.now());
          schedule();
        },
        60_000 - (Date.now() % 60_000),
      );
    };
    schedule();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setNow(Date.now());
    });
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      subscription.remove();
    };
  }, []);
  return now;
}

/** The color an event is drawn in: its own, else its calendar's. */
export function eventColor(
  instance: CalendarEventInstance,
  calendarById: ReadonlyMap<string, Calendar>,
): string {
  return instance.color ?? calendarById.get(instance.calendarId)?.color ?? FALLBACK_EVENT_COLOR;
}
