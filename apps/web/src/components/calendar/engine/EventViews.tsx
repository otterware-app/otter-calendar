import type { SpanItem } from "@t3tools/client-runtime/calendar/days";
import {
  formatTime,
  formatTimeRange,
  type HourFormat,
} from "@t3tools/client-runtime/calendar/format";
import type { TimedPlacement } from "@t3tools/client-runtime/calendar/layout";
import type { CalendarEventInstance } from "@t3tools/contracts";
import { memo, type CSSProperties } from "react";

import { eventStateAttributes, flag } from "./eventAppearance";

/**
 * Event elements. Each is memoized on primitive props plus a layout object whose identity the
 * layout caches keep stable, so an update re-renders only the events that changed. Clicks,
 * keys and drags are handled by the surface through `data-event-key`, never per element.
 */

export interface EventVisualProps {
  readonly color: string;
  readonly readOnly: boolean;
  readonly selected: boolean;
  readonly pending: boolean;
  readonly past: boolean;
  readonly timeZone: string;
  readonly hourFormat: HourFormat;
}

function title(instance: CalendarEventInstance): string {
  return instance.title || "(No title)";
}

function responseSuffix(instance: CalendarEventInstance): string {
  switch (instance.response) {
    case "declined":
      return ", declined";
    case "tentative":
      return ", maybe";
    case "needsAction":
      return ", not answered";
    default:
      return instance.tentative === true ? ", tentative" : "";
  }
}

/** A timed event in a day column, placed by minutes (CSS scales with `--hour-height`). */
export const TimedEventBlock = memo(function TimedEventBlock({
  placement,
  dayLabel,
  color,
  readOnly,
  selected,
  pending,
  past,
  timeZone,
  hourFormat,
}: EventVisualProps & { readonly placement: TimedPlacement; readonly dayLabel: string }) {
  const { segment, left, width, zIndex } = placement;
  const { instance, startMinutes, endMinutes } = segment;
  const time = formatTimeRange(instance.start, instance.end, timeZone, hourFormat);
  const style = {
    top: `calc(var(--hour-height) * ${startMinutes / 60})`,
    height: `calc(var(--hour-height) * ${(endMinutes - startMinutes) / 60})`,
    left: `${left * 100}%`,
    width: `calc(${width * 100}% - 2px)`,
    "--event-z": zIndex,
    "--event-color": color,
  } as CSSProperties;
  return (
    <div
      data-calendar-event=""
      data-timed=""
      data-event-key={segment.key}
      data-continues-before={flag(segment.continuesBefore)}
      data-continues-after={flag(segment.continuesAfter)}
      {...eventStateAttributes(instance, { past, selected, pending })}
      role="button"
      tabIndex={-1}
      aria-label={`${title(instance)}, ${dayLabel}, ${time}${instance.location ? `, ${instance.location}` : ""}${responseSuffix(instance)}`}
      style={style}
    >
      {!readOnly && !segment.continuesBefore ? <div data-resize="start" aria-hidden /> : null}
      <div data-event-body="">
        <span data-event-title="">{title(instance)}</span>
        <span data-event-time="">{time}</span>
        {instance.location ? <span data-event-location="">{instance.location}</span> : null}
      </div>
      {!readOnly && !segment.continuesAfter ? <div data-resize="end" aria-hidden /> : null}
    </div>
  );
});

/**
 * Horizontal position of a span within a lane of `columns` days, and its level. `top` is the
 * lane's top padding; levels stack by `--cal-bar-height` plus `--cal-bar-gap`.
 */
function spanStyle(item: SpanItem, level: number, columns: number, color: string): CSSProperties {
  const days = item.endIndex - item.startIndex + 1;
  return {
    left: `calc(${(item.startIndex / columns) * 100}% + 2px)`,
    width: `calc(${(days / columns) * 100}% - 4px)`,
    top: `calc(${level} * (var(--cal-bar-height) + var(--cal-bar-gap)))`,
    "--event-color": color,
  } as CSSProperties;
}

/** An all-day or multi-day event in the all-day lane or a month week row. */
export const EventBar = memo(function EventBar({
  item,
  level,
  columns,
  color,
  readOnly,
  selected,
  pending,
  past,
  timeZone,
  hourFormat,
}: EventVisualProps & {
  readonly item: SpanItem;
  readonly level: number;
  readonly columns: number;
}) {
  const { instance } = item;
  const time =
    item.kind === "allDay"
      ? null
      : item.continuesBefore
        ? null
        : formatTime(instance.start, timeZone, hourFormat);
  return (
    <div
      data-calendar-event=""
      data-bar=""
      data-event-key={item.key}
      data-continues-before={flag(item.continuesBefore)}
      data-continues-after={flag(item.continuesAfter)}
      {...eventStateAttributes(instance, { past, selected, pending })}
      role="button"
      tabIndex={-1}
      aria-label={`${title(instance)}, ${time === null ? "all day" : time}${responseSuffix(instance)}`}
      style={spanStyle(item, level, columns, color)}
    >
      {time !== null ? <span data-event-time="">{time}</span> : null}
      <span data-event-title="" className="min-w-0 truncate">
        {title(instance)}
      </span>
      {!readOnly && item.kind === "allDay" && !item.continuesAfter ? (
        <div data-resize="end" aria-hidden />
      ) : null}
    </div>
  );
});

/** A single-day timed event in a month cell: a dot, its start time and its title. */
export const EventChip = memo(function EventChip({
  item,
  level,
  columns,
  color,
  selected,
  pending,
  past,
  timeZone,
  hourFormat,
}: EventVisualProps & {
  readonly item: SpanItem;
  readonly level: number;
  readonly columns: number;
}) {
  const { instance } = item;
  const time = formatTime(instance.start, timeZone, hourFormat);
  return (
    <div
      data-calendar-event=""
      data-chip=""
      data-event-key={item.key}
      {...eventStateAttributes(instance, { past, selected, pending })}
      role="button"
      tabIndex={-1}
      aria-label={`${title(instance)}, ${time}${responseSuffix(instance)}`}
      style={spanStyle(item, level, columns, color)}
    >
      <span data-event-dot="" />
      <span className="shrink-0 text-muted-foreground tabular-nums">{time}</span>
      <span data-event-title="" className="min-w-0 truncate">
        {title(instance)}
      </span>
    </div>
  );
});
