import type { Calendar, CalendarEventInstance } from "@t3tools/contracts";
import type { CSSProperties } from "react";

/** Used when an instance's calendar is unknown (it is loading or was just removed). */
const FALLBACK_COLOR = "#8e8e93";

export function eventColor(
  instance: CalendarEventInstance,
  calendars: ReadonlyMap<string, Calendar>,
): string {
  return instance.color ?? calendars.get(instance.calendarId)?.color ?? FALLBACK_COLOR;
}

/** Whether the user may move or resize the event here. */
export function isEventReadOnly(
  instance: CalendarEventInstance,
  calendars: ReadonlyMap<string, Calendar>,
): boolean {
  if (instance.readOnly === true) return true;
  const role = calendars.get(instance.calendarId)?.accessRole;
  return role === "reader" || role === "freeBusyReader";
}

/** Boolean data attribute: present (`""`) when true, absent otherwise. */
export function flag(value: boolean): "" | undefined {
  return value ? "" : undefined;
}

export interface EventStateAttributes {
  readonly "data-response"?: string;
  readonly "data-tentative"?: "";
  readonly "data-free"?: "";
  readonly "data-past"?: "";
  readonly "data-selected"?: "";
  readonly "data-pending"?: "";
}

/** Data attributes engine.css styles event states with. */
export function eventStateAttributes(
  instance: CalendarEventInstance,
  state: { readonly past: boolean; readonly selected: boolean; readonly pending: boolean },
): EventStateAttributes {
  const attributes: {
    -readonly [K in keyof EventStateAttributes]: EventStateAttributes[K];
  } = {};
  if (instance.response !== undefined && instance.response !== "accepted") {
    attributes["data-response"] = instance.response;
  }
  if (instance.tentative === true) attributes["data-tentative"] = "";
  if (instance.free === true) attributes["data-free"] = "";
  if (state.past) attributes["data-past"] = "";
  if (state.selected) attributes["data-selected"] = "";
  if (state.pending) attributes["data-pending"] = "";
  return attributes;
}

export function eventColorStyle(color: string): CSSProperties {
  return { "--event-color": color } as CSSProperties;
}

export const EMPTY_KEYS: ReadonlySet<string> = new Set();
