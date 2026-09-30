import { type StaticScreenProps, useNavigation } from "@react-navigation/native";
import { chunkWeeksForDays } from "@t3tools/client-runtime/calendar/chunks";
import {
  DayBucketCache,
  type SpanItem,
  type TimedSegment,
} from "@t3tools/client-runtime/calendar/days";
import {
  formatEventLabel,
  formatHourLabel,
  formatRelativeDay,
  formatShortDate,
  formatTime,
  formatTimeRange,
  type HourFormat,
} from "@t3tools/client-runtime/calendar/format";
import { layoutDayCached, type TimedPlacement } from "@t3tools/client-runtime/calendar/layout";
import type { Calendar, CalendarEventInstance, EnvironmentId } from "@t3tools/contracts";
import { type DayNumber, parseDayNumber, toZoned } from "@t3tools/shared/calendar/time";
import { memo, useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/AppText";
import { ErrorBanner } from "../../components/ErrorBanner";
import { ScreenHeader } from "../../components/ScreenHeader";
import { useActiveEnvironment } from "../../state/active-environment";
import { EnvironmentLoadingState } from "../connection/EnvironmentLoadingState";
import { NoEnvironmentState } from "../connection/NoEnvironmentState";
import { eventTone, readableTextColor, withAlpha } from "./eventPresentation";
import {
  type CalendarViewSettings,
  eventColor,
  useCalendarViewSettings,
  useMinuteClock,
  useToday,
  useVisibleInstances,
} from "./useCalendarView";

const HOUR_HEIGHT = 56;
/** Width of the hour labels on the left. */
const GUTTER = 52;
/** Room above midnight and below the last hour, so their labels are not clipped. */
const GRID_PADDING = 10;
const GRID_HEIGHT = 24 * HOUR_HEIGHT;
const MIN_BLOCK_HEIGHT = 22;
/** Short events are laid out as long as their smallest drawn block, so blocks never overlap. */
const MIN_VISUAL_MINUTES = Math.ceil((MIN_BLOCK_HEIGHT / HOUR_HEIGHT) * 60);
/** All-day events shown before "+N more". */
const ALL_DAY_LIMIT = 3;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const EMPTY_SEGMENTS: ReadonlyArray<TimedSegment> = [];

/** One day as a time grid; swipe or use the header arrows to change days. */
export function CalendarDayRouteScreen({ route }: StaticScreenProps<{ readonly date?: string }>) {
  const navigation = useNavigation();
  const { activeEnvironment } = useActiveEnvironment();
  const environmentId = activeEnvironment?.environmentId ?? null;

  if (environmentId === null) {
    return (
      <View collapsable={false} className="flex-1 bg-screen">
        <ScreenHeader title="Day" onBack={() => navigation.goBack()} />
        <NoEnvironmentState />
      </View>
    );
  }
  return (
    <CalendarDay key={environmentId} environmentId={environmentId} date={route.params?.date} />
  );
}

function CalendarDay(props: { readonly environmentId: EnvironmentId; readonly date?: string }) {
  const navigation = useNavigation();
  const settings = useCalendarViewSettings(props.environmentId);
  const today = useToday(settings.zone);
  const [day, setDay] = useState<DayNumber>(
    () => (props.date === undefined ? null : parseDayNumber(props.date)) ?? today,
  );
  const step = useCallback((direction: 1 | -1) => setDay((current) => current + direction), []);
  const relative = formatRelativeDay(day, today);

  return (
    <View collapsable={false} className="flex-1 bg-screen">
      <ScreenHeader
        title={formatShortDate(day)}
        subtitle={relative === formatShortDate(day) ? undefined : relative}
        onBack={() => navigation.goBack()}
        actions={[
          ...(day === today
            ? []
            : [
                {
                  accessibilityLabel: "Today",
                  icon: "calendar" as const,
                  onPress: () => setDay(today),
                },
              ]),
          { accessibilityLabel: "Previous day", icon: "chevron.left", onPress: () => step(-1) },
          { accessibilityLabel: "Next day", icon: "chevron.right", onPress: () => step(1) },
        ]}
        optionsVersion={[day, today]}
      />
      {settings.ready ? (
        <DayTimeline
          environmentId={props.environmentId}
          settings={settings}
          day={day}
          isToday={day === today}
          onStep={step}
        />
      ) : (
        <EnvironmentLoadingState
          environmentId={props.environmentId}
          resourceName="calendar"
          error={null}
        />
      )}
    </View>
  );
}

function DayTimeline(props: {
  readonly environmentId: EnvironmentId;
  readonly settings: CalendarViewSettings;
  readonly day: DayNumber;
  readonly isToday: boolean;
  readonly onStep: (direction: 1 | -1) => void;
}) {
  const { environmentId, settings, day, onStep } = props;
  const { zone, preferences, calendars, calendarById } = settings;
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const weeks = useMemo(() => chunkWeeksForDays(day, day, zone), [day, zone]);
  // The days around, so swiping to them shows their events at once.
  const prefetch = useMemo(() => chunkWeeksForDays(day - 3, day + 3, zone), [day, zone]);
  const visible = useVisibleInstances(environmentId, weeks, prefetch, calendars);
  // The cache hands back a day's previous segment array while it is unchanged, so its layout
  // (cached by that array) and the memoized blocks survive updates elsewhere in the week.
  const [bucketCache] = useState(() => new DayBucketCache(14));
  const buckets = useMemo(
    () => bucketCache.bucket(visible.instances, [day], zone, preferences.showDeclined),
    [bucketCache, visible.instances, day, zone, preferences.showDeclined],
  );
  const placements = useMemo(
    () =>
      layoutDayCached(buckets.timed[0] ?? EMPTY_SEGMENTS, { minVisualMinutes: MIN_VISUAL_MINUTES }),
    [buckets],
  );

  // Where the grid opens: the current hour today, else the start of the working day or the first
  // event, whichever is earlier. Later days keep the scroll position, like a paper calendar.
  const [initialOffset] = useState(() => {
    const minutes = props.isToday
      ? toZoned(Date.now(), zone).minutes - 90
      : Math.min(
          preferences.workingHours.start,
          placements[0]?.segment.startMinutes ?? Number.POSITIVE_INFINITY,
        ) - 30;
    return Math.max(0, (minutes / 60) * HOUR_HEIGHT);
  });

  const openEvent = useCallback(
    (instance: CalendarEventInstance) =>
      navigation.navigate("CalendarEvent", {
        environmentId,
        calendarId: instance.calendarId,
        eventId: instance.eventId,
      }),
    [environmentId, navigation],
  );

  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-24, 24])
        .failOffsetY([-16, 16])
        // Leave the screen edge to the system's back gesture.
        .hitSlop({ left: -32 })
        .onEnd((event) => {
          if (event.translationX <= -56 || event.velocityX <= -600) onStep(1);
          else if (event.translationX >= 56 || event.velocityX >= 600) onStep(-1);
        }),
    [onStep],
  );

  return (
    <GestureDetector gesture={swipe}>
      <View collapsable={false} className="flex-1">
        {visible.error === null ? null : (
          <View className="px-5 pt-3">
            <ErrorBanner message={visible.error} />
          </View>
        )}
        <AllDayStrip
          key={day}
          spans={buckets.spans}
          calendarById={calendarById}
          pendingKeys={visible.pendingKeys}
          onPress={openEvent}
        />
        <ScrollView
          className="flex-1"
          contentOffset={{ x: 0, y: initialOffset }}
          contentContainerStyle={{
            height: GRID_HEIGHT + 2 * GRID_PADDING + Math.max(insets.bottom, 12),
          }}
        >
          <HourLines hourFormat={preferences.hourFormat} />
          <View
            style={{
              position: "absolute",
              top: GRID_PADDING,
              left: GUTTER,
              right: 8,
              height: GRID_HEIGHT,
            }}
          >
            {placements.map((placement) => (
              <TimedBlock
                key={placement.segment.key}
                placement={placement}
                color={eventColor(placement.segment.instance, calendarById)}
                pending={visible.pendingKeys.has(placement.segment.key)}
                zone={zone}
                hourFormat={preferences.hourFormat}
                onPress={openEvent}
              />
            ))}
            {props.isToday ? <NowLine zone={zone} /> : null}
          </View>
          {!visible.loaded && placements.length === 0 ? (
            <View pointerEvents="none" className="absolute inset-x-0 top-24 items-center">
              <ActivityIndicator />
            </View>
          ) : null}
        </ScrollView>
      </View>
    </GestureDetector>
  );
}

const HourLines = memo(function HourLines(props: { readonly hourFormat: HourFormat }) {
  return (
    <>
      {HOURS.map((hour) => {
        const top = GRID_PADDING + hour * HOUR_HEIGHT;
        return (
          <View key={hour} pointerEvents="none">
            {hour === 0 ? null : (
              <Text
                className="text-right text-xs text-foreground-muted"
                style={{ position: "absolute", top: top - 8, left: 0, width: GUTTER - 8 }}
              >
                {formatHourLabel(hour, props.hourFormat)}
              </Text>
            )}
            <View
              className="bg-separator"
              style={{
                position: "absolute",
                top,
                left: GUTTER,
                right: 0,
                height: StyleSheet.hairlineWidth,
              }}
            />
          </View>
        );
      })}
    </>
  );
});

function NowLine(props: { readonly zone: string }) {
  const now = useMinuteClock();
  const top = (toZoned(now, props.zone).minutes / 60) * HOUR_HEIGHT;
  return (
    <View
      pointerEvents="none"
      className="flex-row items-center"
      style={{ position: "absolute", top: top - 4, left: -4, right: 0, height: 8, zIndex: 1000 }}
    >
      <View className="size-2 rounded-full bg-danger-foreground" />
      <View className="h-0.5 flex-1 bg-danger-foreground" />
    </View>
  );
}

function blockTime(placement: TimedPlacement, zone: string, hourFormat: HourFormat): string {
  const { segment } = placement;
  const { instance } = segment;
  if (segment.continuesBefore && segment.continuesAfter) return "All day";
  if (segment.continuesBefore) return `Until ${formatTime(instance.end, zone, hourFormat)}`;
  if (segment.continuesAfter) return `From ${formatTime(instance.start, zone, hourFormat)}`;
  return formatTimeRange(instance.start, instance.end, zone, hourFormat);
}

/** Text style over a block: its own color on solid fills (the class color otherwise), struck through when declined. */
function blockTextStyle(colors: ReturnType<typeof blockColors>) {
  return {
    ...(colors.textColor === undefined ? {} : { color: colors.textColor }),
    ...(colors.tone === "declined" ? { textDecorationLine: "line-through" as const } : {}),
  };
}

function blockColors(instance: CalendarEventInstance, color: string) {
  const tone = eventTone(instance);
  if (tone === "solid") {
    return {
      tone,
      backgroundColor: color,
      borderColor: color,
      textColor: readableTextColor(color),
    };
  }
  return {
    tone,
    backgroundColor: withAlpha(color, tone === "declined" ? 0.1 : 0.16),
    borderColor: color,
    textColor: undefined,
  };
}

const TimedBlock = memo(function TimedBlock(props: {
  readonly placement: TimedPlacement;
  readonly color: string;
  readonly pending: boolean;
  readonly zone: string;
  readonly hourFormat: HourFormat;
  readonly onPress: (instance: CalendarEventInstance) => void;
}) {
  const { placement, zone, hourFormat } = props;
  const { segment } = placement;
  const { instance } = segment;
  const top = (segment.startMinutes / 60) * HOUR_HEIGHT;
  const height = Math.max(
    MIN_BLOCK_HEIGHT,
    ((segment.endMinutes - segment.startMinutes) / 60) * HOUR_HEIGHT,
  );
  const colors = blockColors(instance, props.color);
  const roomy = height >= 40;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={formatEventLabel(instance, zone, hourFormat)}
      onPress={() => props.onPress(instance)}
      style={{
        position: "absolute",
        top,
        height,
        left: `${placement.left * 100}%`,
        width: `${placement.width * 100}%`,
        zIndex: placement.zIndex,
        padding: 1,
        opacity: props.pending ? 0.55 : 1,
      }}
    >
      <View
        style={{
          flex: 1,
          overflow: "hidden",
          borderRadius: 6,
          borderWidth: colors.tone === "solid" ? 0 : 1,
          borderStyle: colors.tone === "tentative" ? "dashed" : "solid",
          borderColor: colors.borderColor,
          backgroundColor: colors.backgroundColor,
          paddingHorizontal: 5,
          paddingVertical: roomy ? 3 : 1,
        }}
      >
        <Text
          numberOfLines={roomy ? 2 : 1}
          className={
            colors.textColor === undefined
              ? "font-t3-bold text-xs text-foreground"
              : "font-t3-bold text-xs"
          }
          style={blockTextStyle(colors)}
        >
          {instance.title || "(No title)"}
        </Text>
        {roomy ? (
          <Text
            numberOfLines={1}
            className={colors.textColor === undefined ? "text-xs text-foreground-muted" : "text-xs"}
            style={
              colors.textColor === undefined
                ? undefined
                : { color: colors.textColor, opacity: 0.85 }
            }
          >
            {instance.location
              ? `${blockTime(placement, zone, hourFormat)} · ${instance.location}`
              : blockTime(placement, zone, hourFormat)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
});

function AllDayStrip(props: {
  readonly spans: ReadonlyArray<SpanItem>;
  readonly calendarById: ReadonlyMap<string, Calendar>;
  readonly pendingKeys: ReadonlySet<string>;
  readonly onPress: (instance: CalendarEventInstance) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (props.spans.length === 0) return null;
  const shown =
    expanded || props.spans.length <= ALL_DAY_LIMIT
      ? props.spans
      : props.spans.slice(0, ALL_DAY_LIMIT - 1);
  return (
    <View className="flex-row border-b border-separator py-1.5 pr-2">
      <Text
        className="pt-1 text-right text-xs text-foreground-muted"
        style={{ width: GUTTER - 8, marginRight: 8 }}
      >
        All day
      </Text>
      <View className="flex-1 gap-1">
        {shown.map((span) => (
          <AllDayChip
            key={span.key}
            instance={span.instance}
            color={eventColor(span.instance, props.calendarById)}
            pending={props.pendingKeys.has(span.key)}
            onPress={props.onPress}
          />
        ))}
        {shown.length < props.spans.length ? (
          <Pressable
            accessibilityRole="button"
            className="py-0.5 active:opacity-70"
            onPress={() => setExpanded(true)}
          >
            <Text className="text-xs font-t3-medium text-foreground-muted">
              {`+${props.spans.length - shown.length} more`}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const AllDayChip = memo(function AllDayChip(props: {
  readonly instance: CalendarEventInstance;
  readonly color: string;
  readonly pending: boolean;
  readonly onPress: (instance: CalendarEventInstance) => void;
}) {
  const { instance } = props;
  const colors = blockColors(instance, props.color);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${instance.title || "(No title)"}, all day`}
      onPress={() => props.onPress(instance)}
      style={{
        borderRadius: 6,
        borderWidth: colors.tone === "solid" ? 0 : 1,
        borderStyle: colors.tone === "tentative" ? "dashed" : "solid",
        borderColor: colors.borderColor,
        backgroundColor: colors.backgroundColor,
        paddingHorizontal: 6,
        paddingVertical: 3,
        opacity: props.pending ? 0.55 : 1,
      }}
    >
      <Text
        numberOfLines={1}
        className={
          colors.textColor === undefined
            ? "font-t3-bold text-xs text-foreground"
            : "font-t3-bold text-xs"
        }
        style={blockTextStyle(colors)}
      >
        {instance.title || "(No title)"}
      </Text>
    </Pressable>
  );
});
