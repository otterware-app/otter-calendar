import { useAtomValue } from "@effect/atom-react";
import { type StaticScreenProps, useNavigation } from "@react-navigation/native";
import {
  formatDuration,
  formatEventTime,
  formatLongDate,
  formatRangeTitle,
  formatTimeRange,
  formatZoneName,
} from "@t3tools/client-runtime/calendar/format";
import {
  type CalendarAccount,
  type CalendarAttendee,
  type CalendarEventDetails,
  type CalendarId,
  type CalendarRespondInput,
  calendarEventKey,
  type EnvironmentId,
} from "@t3tools/contracts";
import { dayOfUtcMidnight, zonedDay, zoneOffset } from "@t3tools/shared/calendar/time";
import { describeRecurrence } from "@t3tools/shared/calendar/recurrence";
import { AsyncResult } from "effect/unstable/reactivity";
import { type ComponentProps, useState } from "react";
import { Alert, Linking, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SymbolView } from "../../components/AppSymbol";
import { AppText as Text } from "../../components/AppText";
import { ErrorBanner } from "../../components/ErrorBanner";
import { ScreenHeader } from "../../components/ScreenHeader";
import { cn } from "../../lib/cn";
import {
  calendarAccountsAtom,
  calendarEnvironment,
  calendarOptimisticStore,
} from "../../state/calendar";
import { useEnvironmentQuery } from "../../state/query";
import { atomCommandErrorMessage, useAtomCommand } from "../../state/use-atom-command";
import { EnvironmentLoadingState } from "../connection/EnvironmentLoadingState";
import {
  attendeeName,
  eventTone,
  instanceFromDetails,
  isRecurringEvent,
  plainDescription,
  responseSummary,
  sortedGuests,
} from "./eventPresentation";
import { type CalendarViewSettings, eventColor, useCalendarViewSettings } from "./useCalendarView";

type Answer = CalendarRespondInput["response"];
type SymbolName = ComponentProps<typeof SymbolView>["name"];

const ANSWERS: ReadonlyArray<{ readonly response: Answer; readonly label: string }> = [
  { response: "accepted", label: "Yes" },
  { response: "tentative", label: "Maybe" },
  { response: "declined", label: "No" },
];

/** Guests listed before "Show all". */
const GUEST_LIMIT = 8;

/** One event: when and where, who is coming, and the user's answer; RSVP and delete. */
export function CalendarEventRouteScreen({
  route,
}: StaticScreenProps<{
  readonly environmentId: EnvironmentId;
  readonly calendarId: CalendarId;
  readonly eventId: string;
}>) {
  const { environmentId, calendarId, eventId } = route.params;
  const navigation = useNavigation();
  const query = useEnvironmentQuery(
    calendarEnvironment.eventDetails({ environmentId, input: { calendarId, eventId } }),
  );
  // What a change of ours answered with, shown until the refreshed query brings newer data.
  const [changed, setChanged] = useState<{
    readonly details: CalendarEventDetails;
    readonly over: CalendarEventDetails | null;
  } | null>(null);
  const details = changed !== null && changed.over === query.data ? changed.details : query.data;
  const close = () => navigation.goBack();
  const htmlLink = details?.htmlLink;

  return (
    <View collapsable={false} className="flex-1 bg-sheet">
      <ScreenHeader
        title="Event"
        onBack={close}
        actions={[
          ...(htmlLink === undefined
            ? []
            : [
                {
                  accessibilityLabel: "Open in Google Calendar",
                  icon: "safari" as const,
                  onPress: () => void Linking.openURL(htmlLink).catch(() => undefined),
                },
              ]),
          // Android shows a back button instead; the iOS sheet has no bar button of its own.
          ...(Platform.OS === "ios"
            ? [{ accessibilityLabel: "Close", icon: "xmark" as const, onPress: close }]
            : []),
        ]}
        optionsVersion={[htmlLink]}
      />
      {details === null ? (
        <EnvironmentLoadingState
          environmentId={environmentId}
          resourceName="event"
          error={query.error}
        />
      ) : (
        <EventDetails
          environmentId={environmentId}
          details={details}
          onChanged={(next) => {
            setChanged({ details: next, over: query.data });
            query.refresh();
          }}
          onDeleted={close}
        />
      )}
    </View>
  );
}

function EventDetails(props: {
  readonly environmentId: EnvironmentId;
  readonly details: CalendarEventDetails;
  readonly onChanged: (details: CalendarEventDetails) => void;
  readonly onDeleted: () => void;
}) {
  const { environmentId, details } = props;
  const insets = useSafeAreaInsets();
  const settings = useCalendarViewSettings(environmentId);
  const accounts = useAtomValue(calendarAccountsAtom(environmentId));
  const respond = useAtomCommand(calendarEnvironment.respond);
  const deleteEvent = useAtomCommand(calendarEnvironment.deleteEvent);
  const [error, setError] = useState<string | null>(null);
  const [answering, setAnswering] = useState<Answer | null>(null);
  const [deleting, setDeleting] = useState(false);

  const store = calendarOptimisticStore(environmentId);
  const recurring = isRecurringEvent(details);
  const calendar = settings.calendarById.get(details.calendarId);
  const account = accounts?.find((candidate) => candidate.accountId === calendar?.accountId);
  const color = eventColor(details, settings.calendarById);
  const guests = sortedGuests(details.attendees);
  const rooms = details.attendees.filter((attendee) => attendee.resource === true);
  const answer = answering ?? details.response;

  const sendAnswer = (response: Answer, scope?: "this" | "all") => {
    setAnswering(response);
    setError(null);
    // The views show the new answer at once; the server's own update replaces it.
    const change = store.apply({ upsert: [{ ...instanceFromDetails(details), response }] });
    void respond({
      environmentId,
      input: {
        calendarId: details.calendarId,
        eventId: details.eventId,
        response,
        ...(scope === undefined ? {} : { scope }),
      },
    }).then((result) => {
      store.settle(change);
      setAnswering(null);
      if (AsyncResult.isSuccess(result)) {
        if (result.value.event !== undefined) props.onChanged(result.value.event);
      } else {
        setError(atomCommandErrorMessage(result, "Your answer could not be sent."));
      }
    });
  };

  const chooseAnswer = (response: Answer) => {
    if (answering !== null) return;
    if (!recurring) {
      if (response !== details.response) sendAnswer(response);
      return;
    }
    Alert.alert("Respond to", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "This event", onPress: () => sendAnswer(response, "this") },
      { text: "All events", onPress: () => sendAnswer(response, "all") },
    ]);
  };

  const remove = (scope?: "this" | "following" | "all") => {
    setDeleting(true);
    setError(null);
    const change = store.apply({ remove: [calendarEventKey(details.calendarId, details.eventId)] });
    void deleteEvent({
      environmentId,
      input: {
        calendarId: details.calendarId,
        eventId: details.eventId,
        ...(scope === undefined ? {} : { scope }),
      },
    }).then((result) => {
      store.settle(change);
      setDeleting(false);
      if (AsyncResult.isSuccess(result)) props.onDeleted();
      else setError(atomCommandErrorMessage(result, "The event could not be deleted."));
    });
  };

  const confirmDelete = () => {
    if (deleting) return;
    if (!recurring) {
      Alert.alert("Delete this event?", undefined, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => remove() },
      ]);
      return;
    }
    // Android dialogs hold three buttons; tapping outside cancels there.
    const scopes = [
      { text: "This event", style: "destructive" as const, onPress: () => remove("this") },
      {
        text: Platform.OS === "android" ? "Following" : "This and following events",
        style: "destructive" as const,
        onPress: () => remove("following"),
      },
      { text: "All events", style: "destructive" as const, onPress: () => remove("all") },
    ];
    Alert.alert(
      "Delete recurring event",
      undefined,
      Platform.OS === "android" ? scopes : [...scopes, { text: "Cancel", style: "cancel" }],
      { cancelable: true },
    );
  };

  const when = eventWhen(details, settings);
  const recurrence =
    details.recurrence !== undefined && details.recurrence.length > 0
      ? describeRecurrence(details.recurrence, {
          start: details.originalStart ?? details.start,
          allDay: details.allDay === true,
          timeZone: details.timeZone ?? settings.zone,
        })
      : null;
  const description = plainDescription(details.description);
  const organizer =
    details.organizer !== undefined && details.organizer.self !== true && guests.length === 0
      ? details.organizer
      : null;

  return (
    <ScrollView
      alwaysBounceVertical
      className="flex-1"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="gap-5 px-5 pt-4"
      contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
    >
      {error === null ? null : <ErrorBanner message={error} />}

      <View className="flex-row gap-3">
        <View className="mt-2 size-3.5 rounded" style={{ backgroundColor: color }} />
        <View className="min-w-0 flex-1 gap-1">
          <Text
            selectable
            className="text-2xl font-t3-bold text-foreground"
            style={
              eventTone(details) === "declined" ? { textDecorationLine: "line-through" } : undefined
            }
          >
            {details.title || "(No title)"}
          </Text>
          <Text className="text-base text-foreground">{when.date}</Text>
          <Text className="text-base text-foreground-muted">{when.time}</Text>
          {when.eventZone === null ? null : (
            <Text className="text-sm text-foreground-muted">{when.eventZone}</Text>
          )}
        </View>
      </View>

      {details.conference === undefined ? null : (
        <Pressable
          accessibilityRole="link"
          className="flex-row items-center justify-center gap-2 rounded-full bg-primary py-3 active:opacity-70"
          onPress={() => void Linking.openURL(details.conference!.url).catch(() => undefined)}
        >
          <SymbolView
            name="video"
            size={17}
            tintColorClassName="accent-primary-foreground"
            type="monochrome"
          />
          <Text className="text-base font-t3-bold text-primary-foreground">
            {`Join ${details.conference.name}`}
          </Text>
        </Pressable>
      )}

      {details.canRespond ? (
        <View className="gap-2">
          <Text className="text-sm font-t3-medium text-foreground-muted">Going?</Text>
          <View className="flex-row gap-2">
            {ANSWERS.map((option) => {
              const selected = answer === option.response;
              return (
                <Pressable
                  key={option.response}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: answering !== null }}
                  className={cn(
                    "flex-1 items-center rounded-full border py-2.5 active:opacity-70",
                    selected ? "border-primary bg-primary" : "border-border bg-card",
                  )}
                  disabled={answering !== null}
                  onPress={() => chooseAnswer(option.response)}
                >
                  <Text
                    className={cn(
                      "text-sm font-t3-bold",
                      selected ? "text-primary-foreground" : "text-foreground",
                    )}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <View className="gap-4">
        {recurrence === null ? null : <DetailRow icon="repeat" title={recurrence} />}
        <DetailRow
          icon="calendar"
          title={calendar?.name ?? "Calendar"}
          detail={accountLabel(account)}
        />
        {details.location === undefined || details.location.length === 0 ? null : (
          <DetailRow
            icon="mappin.and.ellipse"
            title={details.location}
            onPress={() => openLocation(details.location!)}
          />
        )}
        {rooms.length === 0 ? null : (
          <DetailRow
            icon="mappin.and.ellipse"
            title={rooms.map(attendeeName).join(", ")}
            detail={rooms.length === 1 ? "Room" : "Rooms"}
          />
        )}
        {organizer === null ? null : (
          <DetailRow icon="person.crop.circle" title={attendeeName(organizer)} detail="Organizer" />
        )}
      </View>

      {guests.length === 0 ? null : <GuestList guests={guests} />}

      {description.length === 0 ? null : (
        <View className="flex-row gap-3">
          <SymbolView
            name="text.alignleft"
            size={18}
            tintColorClassName="accent-icon-muted"
            type="monochrome"
          />
          <Text selectable className="min-w-0 flex-1 text-base leading-normal text-foreground">
            {description}
          </Text>
        </View>
      )}

      {details.readOnly === true ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: deleting }}
          className="items-center rounded-full border border-danger-border bg-danger py-3 active:opacity-70"
          disabled={deleting}
          onPress={confirmDelete}
        >
          <Text className="text-sm font-t3-bold text-danger-foreground">
            {deleting ? "Deleting…" : "Delete event"}
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function DetailRow(props: {
  readonly icon: SymbolName;
  readonly title: string;
  readonly detail?: string;
  readonly onPress?: () => void;
}) {
  const content = (
    <View className="flex-row gap-3">
      <SymbolView
        name={props.icon}
        size={18}
        tintColorClassName="accent-icon-muted"
        type="monochrome"
      />
      <View className="min-w-0 flex-1">
        <Text
          selectable={props.onPress === undefined}
          className={cn(
            "text-base",
            props.onPress === undefined ? "text-foreground" : "text-primary-text",
          )}
        >
          {props.title}
        </Text>
        {props.detail === undefined ? null : (
          <Text className="text-sm text-foreground-muted">{props.detail}</Text>
        )}
      </View>
    </View>
  );
  if (props.onPress === undefined) return content;
  return (
    <Pressable accessibilityRole="link" className="active:opacity-70" onPress={props.onPress}>
      {content}
    </Pressable>
  );
}

const RESPONSE_ICONS: Record<
  CalendarAttendee["responseStatus"],
  { readonly icon: SymbolName; readonly tint: string; readonly label: string }
> = {
  accepted: { icon: "checkmark.circle", tint: "accent-primary-text", label: "Going" },
  tentative: { icon: "questionmark.circle", tint: "accent-icon-muted", label: "Maybe" },
  needsAction: { icon: "circle", tint: "accent-icon-subtle", label: "Not answered" },
  declined: { icon: "xmark.circle", tint: "accent-danger-foreground", label: "Not going" },
};

function GuestList(props: { readonly guests: ReadonlyArray<CalendarAttendee> }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? props.guests : props.guests.slice(0, GUEST_LIMIT);
  return (
    <View className="gap-3">
      <View className="flex-row gap-3">
        <SymbolView
          name="person.2"
          size={18}
          tintColorClassName="accent-icon-muted"
          type="monochrome"
        />
        <View className="min-w-0 flex-1">
          <Text className="text-base text-foreground">
            {props.guests.length === 1 ? "1 guest" : `${props.guests.length} guests`}
          </Text>
          <Text className="text-sm text-foreground-muted">{responseSummary(props.guests)}</Text>
        </View>
      </View>
      {shown.map((guest) => {
        const response = RESPONSE_ICONS[guest.responseStatus];
        const notes = [
          guest.organizer === true ? "Organizer" : null,
          guest.self === true ? "You" : null,
          guest.optional === true ? "Optional" : null,
        ].filter((note) => note !== null);
        return (
          <View
            key={guest.email}
            accessible
            accessibilityLabel={[attendeeName(guest), response.label, ...notes].join(", ")}
            className="flex-row items-center gap-3"
          >
            <SymbolView
              name={response.icon}
              size={18}
              tintColorClassName={response.tint}
              type="monochrome"
            />
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-base text-foreground">
                {attendeeName(guest)}
              </Text>
              {notes.length === 0 ? null : (
                <Text className="text-xs text-foreground-muted">{notes.join(" · ")}</Text>
              )}
            </View>
          </View>
        );
      })}
      {shown.length < props.guests.length ? (
        <Pressable
          accessibilityRole="button"
          className="py-1 pl-8 active:opacity-70"
          onPress={() => setExpanded(true)}
        >
          <Text className="text-sm font-t3-medium text-primary-text">
            {`Show all ${props.guests.length}`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** The date and time lines, plus the time in the event's own zone when it differs. */
function eventWhen(
  details: CalendarEventDetails,
  settings: CalendarViewSettings,
): { readonly date: string; readonly time: string; readonly eventZone: string | null } {
  const { zone } = settings;
  const hourFormat = settings.preferences.hourFormat;
  if (details.allDay === true) {
    const first = dayOfUtcMidnight(details.start);
    const last = Math.max(first, dayOfUtcMidnight(details.end) - 1);
    return {
      date: last === first ? formatLongDate(first) : formatRangeTitle(first, last),
      time: last === first ? "All day" : `All day · ${last - first + 1} days`,
      eventZone: null,
    };
  }
  const startDay = zonedDay(details.start, zone);
  const endDay = zonedDay(Math.max(details.start, details.end - 1), zone);
  const minutes = (details.end - details.start) / 60_000;
  const eventZone =
    details.timeZone !== undefined &&
    details.timeZone !== zone &&
    zoneOffset(details.timeZone, details.start) !== zoneOffset(zone, details.start)
      ? `${formatTimeRange(details.start, details.end, details.timeZone, hourFormat)} ${formatZoneName(details.timeZone, details.start)} (${details.timeZone.replace(/_/g, " ")})`
      : null;
  return {
    date: formatLongDate(startDay),
    time:
      startDay === endDay
        ? `${formatEventTime(details, zone, hourFormat)} (${formatDuration(minutes)})`
        : formatEventTime(details, zone, hourFormat),
    eventZone,
  };
}

function accountLabel(account: CalendarAccount | undefined): string | undefined {
  if (account === undefined) return undefined;
  return account.provider === "demo" ? `${account.email} (demo)` : account.email;
}

function openLocation(location: string) {
  const url = /^https?:\/\//i.test(location)
    ? location
    : Platform.OS === "ios"
      ? `https://maps.apple.com/?q=${encodeURIComponent(location)}`
      : `geo:0,0?q=${encodeURIComponent(location)}`;
  void Linking.openURL(url).catch(() => undefined);
}
