import { useAtomValue } from "@effect/atom-react";
import { LegendList } from "@legendapp/list/react-native";
import { useNavigation } from "@react-navigation/native";
import { chunkWeeksForDays, neighbourChunkWeeks } from "@t3tools/client-runtime/calendar/chunks";
import { bucketInstances, instanceKey } from "@t3tools/client-runtime/calendar/days";
import {
  formatEventLabel,
  formatResponse,
  formatShortDate,
  formatTime,
  formatTimeRange,
  type HourFormat,
} from "@t3tools/client-runtime/calendar/format";
import type { CalendarAccount, CalendarEventInstance, EnvironmentId } from "@t3tools/contracts";
import { BRAND } from "@t3tools/shared/brand";
import { civilDate, type DayNumber, formatDayNumber } from "@t3tools/shared/calendar/time";
import { AsyncResult } from "effect/unstable/reactivity";
import { memo, useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SymbolView } from "../../components/AppSymbol";
import { AppText as Text } from "../../components/AppText";
import { EmptyState } from "../../components/EmptyState";
import { ErrorBanner } from "../../components/ErrorBanner";
import { RowPressable } from "../../components/RowPressable";
import { ScreenHeader } from "../../components/ScreenHeader";
import { cn } from "../../lib/cn";
import { useActiveEnvironment } from "../../state/active-environment";
import {
  calendarAccountsAtom,
  calendarDirectoryErrorAtom,
  calendarEnvironment,
} from "../../state/calendar";
import { atomCommandErrorMessage, useAtomCommand } from "../../state/use-atom-command";
import { environmentMenuItems } from "../connection/environmentMenu";
import { EnvironmentLoadingState } from "../connection/EnvironmentLoadingState";
import { NoEnvironmentState } from "../connection/NoEnvironmentState";
import {
  type AgendaEventRow,
  type AgendaRow,
  buildAgendaRows,
  reuseAgendaRows,
} from "./agendaRows";
import { eventTone } from "./eventPresentation";
import {
  type CalendarViewSettings,
  eventColor,
  useCalendarViewSettings,
  useToday,
  useVisibleInstances,
} from "./useCalendarView";

/** Days the agenda loads at first, from today. */
const INITIAL_DAYS = 28;
/** Days added when scrolling reaches the end, or earlier days on "Show earlier". */
const LATER_DAYS = 28;
const EARLIER_DAYS = 14;
/** How far ahead scrolling keeps loading on its own; past it, "Show later" asks first. */
const AUTO_LOAD_DAYS = 26 * 7;

/** Home: every visible calendar's events from today on, grouped by day. */
export function CalendarAgendaRouteScreen() {
  const navigation = useNavigation();
  const { environments, activeEnvironment, selectEnvironment } = useActiveEnvironment();
  const environmentId = activeEnvironment?.environmentId ?? null;
  // "Today" remounts the agenda: it starts at today again, scrolled to the top.
  const [epoch, setEpoch] = useState(0);

  return (
    <View collapsable={false} className="flex-1 bg-screen">
      <ScreenHeader
        title="Calendar"
        subtitle={environments.length > 1 ? activeEnvironment?.environmentLabel : undefined}
        actions={[
          ...(environmentId === null
            ? []
            : [
                {
                  accessibilityLabel: "Today",
                  icon: "calendar" as const,
                  onPress: () => setEpoch((value) => value + 1),
                },
                {
                  accessibilityLabel: "Day view",
                  icon: "calendar.day.timeline.left" as const,
                  onPress: () => navigation.navigate("CalendarDay", {}),
                },
              ]),
          {
            accessibilityLabel: "Agent",
            icon: "sparkles",
            onPress: () => navigation.navigate("AgentThreads"),
          },
        ]}
        menus={[
          {
            title: "More",
            icon: "ellipsis",
            items: [
              ...(environmentId === null
                ? []
                : [
                    {
                      id: "calendars",
                      title: "Calendars",
                      icon: "checklist",
                      onPress: () => navigation.navigate("CalendarCalendars"),
                    },
                  ]),
              ...environmentMenuItems({
                environments,
                activeEnvironmentId: environmentId,
                onSelect: selectEnvironment,
              }),
              {
                id: "settings",
                title: "Settings",
                icon: "gearshape",
                onPress: () => navigation.navigate("SettingsSheet"),
              },
            ],
          },
        ]}
        optionsVersion={[environmentId, environments.length]}
      />
      {environmentId === null ? (
        <NoEnvironmentState />
      ) : (
        <CalendarAgenda key={`${environmentId}:${epoch}`} environmentId={environmentId} />
      )}
    </View>
  );
}

function CalendarAgenda(props: { readonly environmentId: EnvironmentId }) {
  const settings = useCalendarViewSettings(props.environmentId);
  const accounts = useAtomValue(calendarAccountsAtom(props.environmentId));
  const directoryError = useAtomValue(calendarDirectoryErrorAtom(props.environmentId));

  if (!settings.ready || accounts === null) {
    return (
      <EnvironmentLoadingState
        environmentId={props.environmentId}
        resourceName="calendar"
        error={directoryError}
      />
    );
  }
  if (accounts.length === 0) {
    return <NoCalendarsState environmentId={props.environmentId} />;
  }
  return <AgendaList environmentId={props.environmentId} settings={settings} accounts={accounts} />;
}

interface AgendaRowsInput {
  readonly instances: ReadonlyArray<CalendarEventInstance>;
  readonly first: DayNumber;
  readonly last: DayNumber;
  readonly zone: string;
  readonly showDeclined: boolean;
  readonly today: DayNumber;
}

function sameAgendaInput(a: AgendaRowsInput, b: AgendaRowsInput): boolean {
  return (
    a.instances === b.instances &&
    a.first === b.first &&
    a.last === b.last &&
    a.zone === b.zone &&
    a.showDeclined === b.showDeclined &&
    a.today === b.today
  );
}

function presentAgenda(previous: ReadonlyMap<string, AgendaRow>, input: AgendaRowsInput) {
  const days: DayNumber[] = [];
  for (let day = input.first; day <= input.last; day++) days.push(day);
  const buckets = bucketInstances(input.instances, days, input.zone, input.showDeclined);
  return { input, ...reuseAgendaRows(previous, buildAgendaRows(buckets, input.today)) };
}

/** Agenda rows that keep their identity while their event is unchanged, so memoized rows skip. */
function useAgendaRows(input: AgendaRowsInput): ReadonlyArray<AgendaRow> {
  const [presented, setPresented] = useState(() => presentAgenda(new Map(), input));
  if (sameAgendaInput(presented.input, input)) return presented.rows;
  const next = presentAgenda(presented.byKey, input);
  setPresented(next);
  return next.rows;
}

function rowKey(row: AgendaRow): string {
  return row.key;
}

function rowType(row: AgendaRow): AgendaRow["kind"] {
  return row.kind;
}

function AgendaList(props: {
  readonly environmentId: EnvironmentId;
  readonly settings: CalendarViewSettings;
  readonly accounts: ReadonlyArray<CalendarAccount>;
}) {
  const { environmentId, settings } = props;
  const { zone, preferences, calendars, calendarById } = settings;
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const today = useToday(zone);
  const [range, setRange] = useState(() => ({ first: today, last: today + INITIAL_DAYS - 1 }));

  const weeks = useMemo(
    () => chunkWeeksForDays(range.first, range.last, zone),
    [range.first, range.last, zone],
  );
  const prefetch = useMemo(() => neighbourChunkWeeks(weeks, 1).after, [weeks]);
  const visible = useVisibleInstances(environmentId, weeks, prefetch, calendars);

  const rows = useAgendaRows({
    instances: visible.instances,
    first: range.first,
    last: range.last,
    zone,
    showDeclined: preferences.showDeclined,
    today,
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
  const openDay = useCallback(
    (day: DayNumber) => navigation.navigate("CalendarDay", { date: formatDayNumber(day) }),
    [navigation],
  );

  const sync = useAtomCommand(calendarEnvironment.sync);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(() => {
    setRefreshing(true);
    void sync({ environmentId, input: {} }).then(() => setRefreshing(false));
  }, [environmentId, sync]);

  const canAutoLoad = range.last - today < AUTO_LOAD_DAYS;
  const loadLater = useCallback(
    () => setRange((current) => ({ ...current, last: current.last + LATER_DAYS })),
    [],
  );
  const onEndReached = useCallback(() => {
    if (visible.loaded && canAutoLoad) loadLater();
  }, [canAutoLoad, loadLater, visible.loaded]);
  const loadEarlier = useCallback(
    () => setRange((current) => ({ ...current, first: current.first - EARLIER_DAYS })),
    [],
  );

  const hourFormat = preferences.hourFormat;
  const pendingKeys = visible.pendingKeys;
  const renderItem = useCallback(
    ({ item }: { readonly item: AgendaRow }) => {
      switch (item.kind) {
        case "day":
          return <AgendaDayHeader day={item.day} today={today} onPress={openDay} />;
        case "empty":
          return <AgendaEmptyDay />;
        case "event":
          return (
            <AgendaEventRowView
              row={item}
              color={eventColor(item.instance, calendarById)}
              pending={pendingKeys.has(instanceKey(item.instance))}
              zone={zone}
              hourFormat={hourFormat}
              onPress={openEvent}
            />
          );
      }
    },
    [calendarById, hourFormat, openDay, openEvent, pendingKeys, today, zone],
  );

  // A spinner only for the first load; later ranges load under the footer's spinner.
  const [firstLoadDone, setFirstLoadDone] = useState(false);
  if (visible.loaded && !firstLoadDone) setFirstLoadDone(true);
  if (!firstLoadDone && !visible.loaded && visible.error === null) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  const signedOut = props.accounts.filter((account) => account.status === "signed_out");

  return (
    <LegendList
      className="flex-1"
      data={rows}
      keyExtractor={rowKey}
      getItemType={rowType}
      renderItem={renderItem}
      estimatedItemSize={52}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
      // Earlier days are inserted above what is on screen; keep it in place.
      maintainVisibleContentPosition={{ data: true }}
      onEndReached={onEndReached}
      onEndReachedThreshold={1}
      refreshing={refreshing}
      onRefresh={refresh}
      ListHeaderComponent={
        <View className="gap-3 pt-2">
          {visible.error === null ? null : (
            <View className="px-5">
              <ErrorBanner message={visible.error} />
            </View>
          )}
          {signedOut.length === 0 ? null : (
            <View className="mx-5 rounded-2xl border border-warning-border bg-warning px-3.5 py-3">
              <Text className="font-t3-medium text-sm text-warning-foreground">
                {`${signedOut.map((account) => account.email).join(", ")} ${
                  signedOut.length === 1 ? "is" : "are"
                } signed out. Sign in again from the ${BRAND.displayName} desktop or web app.`}
              </Text>
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            className="items-center py-1 active:opacity-70"
            hitSlop={8}
            onPress={loadEarlier}
          >
            <Text className="text-sm font-t3-medium text-primary-text">Show earlier</Text>
          </Pressable>
        </View>
      }
      ListFooterComponent={
        !visible.loaded ? (
          <View className="items-center py-6">
            <ActivityIndicator />
          </View>
        ) : canAutoLoad ? null : (
          <Pressable
            accessibilityRole="button"
            className="items-center py-6 active:opacity-70"
            onPress={loadLater}
          >
            <Text className="text-sm font-t3-medium text-primary-text">Show later</Text>
          </Pressable>
        )
      }
    />
  );
}

const AgendaDayHeader = memo(function AgendaDayHeader(props: {
  readonly day: DayNumber;
  readonly today: DayNumber;
  readonly onPress: (day: DayNumber) => void;
}) {
  const { day, today } = props;
  const relative =
    day === today
      ? "Today"
      : day === today + 1
        ? "Tomorrow"
        : day === today - 1
          ? "Yesterday"
          : null;
  const year = civilDate(day).year;
  const date =
    year === civilDate(today).year ? formatShortDate(day) : `${formatShortDate(day)}, ${year}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Opens the day"
      className="flex-row items-baseline gap-1.5 px-5 pt-5 pb-1.5 active:opacity-70"
      onPress={() => props.onPress(day)}
    >
      {relative === null ? null : (
        <>
          <Text
            className={cn(
              "text-sm font-t3-bold",
              day === today ? "text-primary-text" : "text-foreground",
            )}
          >
            {relative}
          </Text>
          <Text className="text-sm text-foreground-muted">·</Text>
        </>
      )}
      <Text
        className={cn(
          "text-sm",
          relative === null ? "font-t3-bold text-foreground" : "text-foreground-muted",
        )}
      >
        {date}
      </Text>
    </Pressable>
  );
});

function AgendaEmptyDay() {
  return (
    <View className="py-2 pr-5 pl-9">
      <Text className="text-sm text-foreground-muted">Nothing planned</Text>
    </View>
  );
}

function agendaTimeLabel(row: AgendaEventRow, zone: string, hourFormat: HourFormat): string {
  const { instance } = row;
  switch (row.timing) {
    case "range":
      return formatTimeRange(instance.start, instance.end, zone, hourFormat);
    case "from":
      return `From ${formatTime(instance.start, zone, hourFormat)}`;
    case "until":
      return `Until ${formatTime(instance.end, zone, hourFormat)}`;
    case "allDay":
      return row.spanDays === null
        ? "All day"
        : `All day · Day ${row.dayOfSpan} of ${row.spanDays}`;
  }
}

const AgendaEventRowView = memo(function AgendaEventRowView(props: {
  readonly row: AgendaEventRow;
  readonly color: string;
  readonly pending: boolean;
  readonly zone: string;
  readonly hourFormat: HourFormat;
  readonly onPress: (instance: CalendarEventInstance) => void;
}) {
  const { row, color, zone, hourFormat } = props;
  const { instance } = row;
  const tone = eventTone(instance);
  const response = formatResponse(instance);
  const detail = [agendaTimeLabel(row, zone, hourFormat), instance.location]
    .filter((part) => part !== undefined && part.length > 0)
    .join(" · ");
  return (
    <RowPressable
      accessibilityRole="button"
      accessibilityLabel={formatEventLabel(instance, zone, hourFormat)}
      className="flex-row gap-3 px-5 py-2"
      style={props.pending ? { opacity: 0.55 } : undefined}
      onPress={() => props.onPress(instance)}
    >
      <View
        style={{
          width: 4,
          borderRadius: 2,
          backgroundColor: tone === "solid" ? color : "transparent",
          borderColor: color,
          borderWidth: tone === "solid" ? 0 : 1.5,
          borderStyle: tone === "tentative" ? "dashed" : "solid",
        }}
      />
      <View className="min-w-0 flex-1 py-0.5">
        <Text
          numberOfLines={1}
          className={cn(
            "text-base font-t3-medium",
            tone === "declined" ? "text-foreground-muted" : "text-foreground",
          )}
          style={tone === "declined" ? { textDecorationLine: "line-through" } : undefined}
        >
          {instance.title || "(No title)"}
        </Text>
        <Text numberOfLines={1} className="text-sm text-foreground-muted">
          {detail}
        </Text>
      </View>
      {instance.meet === true ? (
        <View className="justify-center">
          <SymbolView
            name="video"
            size={15}
            tintColorClassName="accent-icon-muted"
            type="monochrome"
          />
        </View>
      ) : null}
      {response === null ? null : (
        <Text className="self-center text-xs text-foreground-muted">{response}</Text>
      )}
    </RowPressable>
  );
});

function NoCalendarsState(props: { readonly environmentId: EnvironmentId }) {
  const addDemo = useAtomCommand(calendarEnvironment.addDemo);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const add = () => {
    if (adding) return;
    setAdding(true);
    setError(null);
    void addDemo({ environmentId: props.environmentId, input: { size: "standard" } }).then(
      (result) => {
        setAdding(false);
        if (!AsyncResult.isSuccess(result)) {
          setError(atomCommandErrorMessage(result, "The demo calendars could not be added."));
        }
      },
    );
  };
  return (
    <View className="flex-1 justify-center">
      {error === null ? null : (
        <View className="px-5 pb-3">
          <ErrorBanner message={error} />
        </View>
      )}
      <EmptyState
        variant="plain"
        title="No calendars yet"
        detail={`Connect your Google accounts from the ${BRAND.displayName} desktop or web app, or look around with demo calendars.`}
        actionLabel={adding ? "Adding demo calendars…" : "Add demo data"}
        onAction={add}
      />
    </View>
  );
}
