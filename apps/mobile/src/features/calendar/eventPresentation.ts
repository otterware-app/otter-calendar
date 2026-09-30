import type {
  CalendarAttendee,
  CalendarEventDetails,
  CalendarEventInstance,
  CalendarResponseStatus,
} from "@t3tools/contracts";

// ── Colors ───────────────────────────────────────────────────────────

function channels(hex: string): readonly [number, number, number] | null {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (match === null) return null;
  return [parseInt(match[1]!, 16), parseInt(match[2]!, 16), parseInt(match[3]!, 16)];
}

const DARK_TEXT = "#1d1d1f";
const LIGHT_TEXT = "#ffffff";

function linear(channel: number): number {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/**
 * Text color for a block filled with `hex`: white on dark and saturated colors (like Google
 * Calendar, which keeps white text on its mid-tone palette), dark on pale ones.
 */
export function readableTextColor(hex: string): string {
  const rgb = channels(hex);
  if (rgb === null) return LIGHT_TEXT;
  const luminance = 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
  return luminance > 0.5 ? DARK_TEXT : LIGHT_TEXT;
}

/** `#rrggbb` with an alpha channel, for tinted fills of unanswered and declined events. */
export function withAlpha(hex: string, alpha: number): string {
  if (channels(hex) === null) return hex;
  const byte = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  return `${hex}${byte.toString(16).padStart(2, "0")}`;
}

/** How an event is drawn, from the user's own answer. */
export type EventTone = "solid" | "unanswered" | "tentative" | "declined";

export function eventTone(
  instance: Pick<CalendarEventInstance, "response" | "tentative">,
): EventTone {
  switch (instance.response) {
    case "declined":
      return "declined";
    case "needsAction":
      return "unanswered";
    case "tentative":
      return "tentative";
    default:
      return instance.tentative === true ? "tentative" : "solid";
  }
}

// ── Details ──────────────────────────────────────────────────────────

/** The instance fields of an event's details, for optimistic changes to the views. */
export function instanceFromDetails(details: CalendarEventDetails): CalendarEventInstance {
  return {
    calendarId: details.calendarId,
    eventId: details.eventId,
    title: details.title,
    start: details.start,
    end: details.end,
    ...(details.seriesId === undefined ? {} : { seriesId: details.seriesId }),
    ...(details.allDay === undefined ? {} : { allDay: details.allDay }),
    ...(details.tentative === undefined ? {} : { tentative: details.tentative }),
    ...(details.response === undefined ? {} : { response: details.response }),
    ...(details.color === undefined ? {} : { color: details.color }),
    ...(details.location === undefined ? {} : { location: details.location }),
    ...(details.free === undefined ? {} : { free: details.free }),
    ...(details.meet === undefined ? {} : { meet: details.meet }),
    ...(details.readOnly === undefined ? {} : { readOnly: details.readOnly }),
  };
}

/** Whether a change to this event should ask which occurrences it applies to. */
export function isRecurringEvent(details: CalendarEventDetails): boolean {
  return details.seriesId !== undefined || (details.recurrence?.length ?? 0) > 0;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * Google event descriptions are often HTML (`<br>`, links, lists). Shows them as plain text: line
 * breaks kept, links as their text followed by the URL when it differs, other tags dropped.
 */
export function plainDescription(description: string): string {
  if (!/<[a-z!/][^>]*>|&[a-z#0-9]+;/i.test(description)) return description.trim();
  return description
    .replace(
      /<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
      (_match, href: string, text: string) => {
        const label = text.replace(/<[^>]+>/g, "").trim();
        return label.length === 0 || label === href ? href : `${label} (${href})`;
      },
    )
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
      if (entity.startsWith("#")) {
        const code =
          entity[1] === "x" || entity[1] === "X"
            ? parseInt(entity.slice(2), 16)
            : parseInt(entity.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      return ENTITIES[entity.toLowerCase()] ?? match;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Attendees ────────────────────────────────────────────────────────

const RESPONSE_ORDER: Record<CalendarResponseStatus, number> = {
  accepted: 0,
  tentative: 1,
  needsAction: 2,
  declined: 3,
};

/** Guests (not rooms): the organizer first, then yes, maybe, not answered, no; by name within. */
export function sortedGuests(
  attendees: ReadonlyArray<CalendarAttendee>,
): ReadonlyArray<CalendarAttendee> {
  return attendees
    .filter((attendee) => attendee.resource !== true)
    .sort(
      (a, b) =>
        Number(b.organizer === true) - Number(a.organizer === true) ||
        RESPONSE_ORDER[a.responseStatus] - RESPONSE_ORDER[b.responseStatus] ||
        attendeeName(a).localeCompare(attendeeName(b)),
    );
}

export function attendeeName(attendee: Pick<CalendarAttendee, "displayName" | "email">): string {
  return attendee.displayName?.trim() || attendee.email;
}

/** "3 yes, 1 maybe, 2 awaiting" (only the counts that are not zero). */
export function responseSummary(guests: ReadonlyArray<CalendarAttendee>): string {
  const counts = { accepted: 0, tentative: 0, needsAction: 0, declined: 0 };
  for (const guest of guests) counts[guest.responseStatus]++;
  return [
    counts.accepted > 0 ? `${counts.accepted} yes` : null,
    counts.tentative > 0 ? `${counts.tentative} maybe` : null,
    counts.declined > 0 ? `${counts.declined} no` : null,
    counts.needsAction > 0 ? `${counts.needsAction} awaiting` : null,
  ]
    .filter((part) => part !== null)
    .join(", ");
}
