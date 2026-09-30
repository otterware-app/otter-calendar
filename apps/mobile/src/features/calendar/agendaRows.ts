import type { DayBuckets, SpanItem, TimedSegment } from "@t3tools/client-runtime/calendar/days";
import { instanceDays } from "@t3tools/client-runtime/calendar/days";
import type { CalendarEventInstance } from "@t3tools/contracts";
import type { DayNumber } from "@t3tools/shared/calendar/time";

/**
 * How a row states its time: the event's own range, the whole day, or where a multi-day event
 * starts (`from`) or ends (`until`) on this day.
 */
export type AgendaTiming = "range" | "allDay" | "from" | "until";

export interface AgendaEventRow {
  readonly kind: "event";
  readonly key: string;
  readonly day: DayNumber;
  readonly instance: CalendarEventInstance;
  readonly timing: AgendaTiming;
  /** For events over several days: which day this is (1-based) and of how many. */
  readonly dayOfSpan: number | null;
  readonly spanDays: number | null;
}

export type AgendaRow =
  | {
      readonly kind: "day";
      readonly key: string;
      readonly day: DayNumber;
      readonly isToday: boolean;
    }
  | { readonly kind: "empty"; readonly key: string; readonly day: DayNumber }
  | AgendaEventRow;

function spanRow(span: SpanItem, day: DayNumber, timeZone: string): AgendaEventRow {
  const { firstDay, lastDay } = instanceDays(span.instance, timeZone);
  const spanDays = lastDay - firstDay + 1;
  let timing: AgendaTiming = "allDay";
  if (span.kind !== "allDay" && spanDays > 1) {
    if (day === firstDay) timing = "from";
    else if (day === lastDay) timing = "until";
  }
  return {
    kind: "event",
    key: `${day}:${span.key}`,
    day,
    instance: span.instance,
    timing,
    dayOfSpan: spanDays > 1 ? day - firstDay + 1 : null,
    spanDays: spanDays > 1 ? spanDays : null,
  };
}

function segmentRow(segment: TimedSegment, day: DayNumber): AgendaEventRow {
  const timing: AgendaTiming =
    segment.continuesBefore && segment.continuesAfter
      ? "allDay"
      : segment.continuesBefore
        ? "until"
        : segment.continuesAfter
          ? "from"
          : "range";
  return {
    kind: "event",
    key: `${day}:${segment.key}`,
    day,
    instance: segment.instance,
    timing,
    dayOfSpan: null,
    spanDays: null,
  };
}

/**
 * The agenda's rows for bucketed days: a header per day with events, then its all-day events and
 * its timed events in order. Days without events are left out, except today, which says so.
 */
export function buildAgendaRows(buckets: DayBuckets, today: DayNumber): AgendaRow[] {
  const rows: AgendaRow[] = [];
  buckets.days.forEach((day, index) => {
    const events: AgendaEventRow[] = [];
    for (const span of buckets.spans) {
      if (span.startIndex <= index && span.endIndex >= index) {
        events.push(spanRow(span, day, buckets.timeZone));
      }
    }
    for (const segment of buckets.timed[index] ?? []) events.push(segmentRow(segment, day));
    if (events.length === 0 && day !== today) return;
    rows.push({ kind: "day", key: `day:${day}`, day, isToday: day === today });
    if (events.length === 0) rows.push({ kind: "empty", key: `empty:${day}`, day });
    else rows.push(...events);
  });
  return rows;
}

function sameRow(a: AgendaRow, b: AgendaRow): boolean {
  if (a.kind !== b.kind || a.key !== b.key) return false;
  switch (a.kind) {
    case "day":
      return b.kind === "day" && a.isToday === b.isToday;
    case "empty":
      return true;
    case "event":
      return (
        b.kind === "event" &&
        a.instance === b.instance &&
        a.timing === b.timing &&
        a.dayOfSpan === b.dayOfSpan &&
        a.spanDays === b.spanDays
      );
  }
}

/**
 * `next` with every row that did not change replaced by its previous object, so memoized rows
 * skip rendering. Also returns the lookup for the next call.
 */
export function reuseAgendaRows(
  previous: ReadonlyMap<string, AgendaRow>,
  next: ReadonlyArray<AgendaRow>,
): { readonly rows: AgendaRow[]; readonly byKey: Map<string, AgendaRow> } {
  const byKey = new Map<string, AgendaRow>();
  const rows = next.map((row) => {
    const existing = previous.get(row.key);
    const kept = existing !== undefined && sameRow(existing, row) ? existing : row;
    byKey.set(kept.key, kept);
    return kept;
  });
  return { rows, byKey };
}
