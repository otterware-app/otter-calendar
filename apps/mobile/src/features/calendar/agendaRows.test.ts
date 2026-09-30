import { bucketInstances } from "@t3tools/client-runtime/calendar/days";
import type { CalendarEventInstance } from "@t3tools/contracts";
import { type DayNumber, fromZoned, parseDayNumber } from "@t3tools/shared/calendar/time";
import { describe, expect, it } from "vite-plus/test";

import { type AgendaRow, buildAgendaRows, reuseAgendaRows } from "./agendaRows";

const ZONE = "Europe/Berlin";

function day(value: string): DayNumber {
  const parsed = parseDayNumber(value);
  if (parsed === null) throw new Error(`Bad date ${value}`);
  return parsed;
}

function minutes(value: string): number {
  const [hours, mins] = value.split(":").map(Number);
  return hours! * 60 + mins!;
}

function timed(id: string, date: string, from: string, to: string, toDate = date) {
  return instance(id, {
    start: fromZoned(day(date), minutes(from), ZONE),
    end: fromZoned(day(toDate), minutes(to), ZONE),
  });
}

function allDay(id: string, from: string, toExclusive: string) {
  return instance(id, {
    start: day(from) * 86_400_000,
    end: day(toExclusive) * 86_400_000,
    allDay: true,
  });
}

function instance(
  id: string,
  fields: Partial<CalendarEventInstance> & { start: number; end: number },
): CalendarEventInstance {
  return {
    calendarId: "cal" as CalendarEventInstance["calendarId"],
    eventId: id,
    title: id,
    ...fields,
  };
}

function range(from: string, count: number): DayNumber[] {
  return Array.from({ length: count }, (_, index) => day(from) + index);
}

function describeRows(rows: ReadonlyArray<AgendaRow>): string[] {
  return rows.map((row) => {
    switch (row.kind) {
      case "day":
        return `# ${row.day - day("2026-09-30")}${row.isToday ? " today" : ""}`;
      case "empty":
        return "  (nothing)";
      case "event":
        return `  ${row.instance.eventId} ${row.timing}${row.spanDays === null ? "" : ` ${row.dayOfSpan}/${row.spanDays}`}`;
    }
  });
}

describe("buildAgendaRows", () => {
  it("groups events under their days, all-day first, and skips empty days except today", () => {
    const buckets = bucketInstances(
      [
        timed("standup", "2026-10-01", "09:00", "09:15"),
        allDay("offsite", "2026-10-01", "2026-10-02"),
        timed("lunch", "2026-10-01", "12:00", "13:00"),
        timed("review", "2026-10-03", "15:00", "16:00"),
      ],
      range("2026-09-30", 5),
      ZONE,
    );
    expect(describeRows(buildAgendaRows(buckets, day("2026-09-30")))).toEqual([
      "# 0 today",
      "  (nothing)",
      "# 1",
      "  offsite allDay",
      "  standup range",
      "  lunch range",
      "# 3",
      "  review range",
    ]);
  });

  it("repeats multi-day events on each day with where they start and end", () => {
    const buckets = bucketInstances(
      [
        allDay("trip", "2026-09-30", "2026-10-03"),
        // Under 24 hours, but across midnight: two clipped segments.
        timed("night", "2026-10-01", "22:00", "06:00", "2026-10-02"),
        // Over 24 hours: a span.
        timed("conference", "2026-10-01", "09:00", "17:00", "2026-10-03"),
      ],
      range("2026-09-30", 4),
      ZONE,
    );
    expect(describeRows(buildAgendaRows(buckets, day("2026-09-30")))).toEqual([
      "# 0 today",
      "  trip allDay 1/3",
      "# 1",
      "  trip allDay 2/3",
      "  conference from 1/3",
      "  night from",
      "# 2",
      "  trip allDay 3/3",
      "  conference allDay 2/3",
      "  night until",
      "# 3",
      "  conference until 3/3",
    ]);
  });

  it("says today is empty even when it is the only day", () => {
    const buckets = bucketInstances([], range("2026-09-30", 3), ZONE);
    expect(describeRows(buildAgendaRows(buckets, day("2026-09-30")))).toEqual([
      "# 0 today",
      "  (nothing)",
    ]);
  });
});

describe("reuseAgendaRows", () => {
  it("keeps unchanged rows and replaces changed ones", () => {
    const standup = timed("standup", "2026-10-01", "09:00", "09:15");
    const lunch = timed("lunch", "2026-10-01", "12:00", "13:00");
    const days = range("2026-09-30", 3);
    const first = reuseAgendaRows(
      new Map(),
      buildAgendaRows(bucketInstances([standup, lunch], days, ZONE), day("2026-09-30")),
    );
    const moved = { ...lunch, title: "Lunch with Ana" };
    const second = reuseAgendaRows(
      first.byKey,
      buildAgendaRows(bucketInstances([standup, moved], days, ZONE), day("2026-09-30")),
    );
    expect(second.rows).toHaveLength(first.rows.length);
    second.rows.forEach((row, index) => {
      if (row.kind === "event" && row.instance.eventId === "lunch") {
        expect(row).not.toBe(first.rows[index]);
        expect(row.instance.title).toBe("Lunch with Ana");
      } else {
        expect(row).toBe(first.rows[index]);
      }
    });
  });
});
