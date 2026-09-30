import { useAtomValue } from "@effect/atom-react";
import { useNavigation } from "@react-navigation/native";
import type { Calendar, CalendarAccount, EnvironmentId } from "@t3tools/contracts";
import { BRAND } from "@t3tools/shared/brand";
import { AsyncResult } from "effect/unstable/reactivity";
import { useState } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/AppText";
import { ErrorBanner } from "../../components/ErrorBanner";
import { ScreenHeader } from "../../components/ScreenHeader";
import { ThemedSwitch } from "../../components/ThemedSwitch";
import { cn } from "../../lib/cn";
import { useActiveEnvironment } from "../../state/active-environment";
import {
  calendarAccountsAtom,
  calendarDirectoryErrorAtom,
  calendarEnvironment,
  calendarOptimisticStore,
} from "../../state/calendar";
import { atomCommandErrorMessage, useAtomCommand } from "../../state/use-atom-command";
import { EnvironmentLoadingState } from "../connection/EnvironmentLoadingState";
import { NoEnvironmentState } from "../connection/NoEnvironmentState";
import { SettingsSection } from "../settings/components/SettingsSection";
import { useCalendarViewSettings } from "./useCalendarView";

const ACCOUNT_STATUS: Record<CalendarAccount["status"], string | null> = {
  ok: null,
  syncing: "Syncing…",
  error: "Sync failed",
  signed_out: "Signed out",
};

/** Which calendars the agenda and day view show, per account. */
export function CalendarCalendarsRouteScreen() {
  const navigation = useNavigation();
  const { activeEnvironment } = useActiveEnvironment();
  const environmentId = activeEnvironment?.environmentId ?? null;
  const close = () => navigation.goBack();
  return (
    <View collapsable={false} className="flex-1 bg-sheet">
      <ScreenHeader
        title="Calendars"
        onBack={close}
        actions={
          Platform.OS === "ios"
            ? [{ accessibilityLabel: "Close", icon: "xmark", onPress: close }]
            : []
        }
      />
      {environmentId === null ? (
        <NoEnvironmentState />
      ) : (
        <CalendarList key={environmentId} environmentId={environmentId} />
      )}
    </View>
  );
}

function CalendarList(props: { readonly environmentId: EnvironmentId }) {
  const { environmentId } = props;
  const insets = useSafeAreaInsets();
  const settings = useCalendarViewSettings(environmentId);
  const accounts = useAtomValue(calendarAccountsAtom(environmentId));
  const directoryError = useAtomValue(calendarDirectoryErrorAtom(environmentId));
  const updateCalendar = useAtomCommand(calendarEnvironment.updateCalendar);
  const updatePreferences = useAtomCommand(calendarEnvironment.updatePreferences);
  const addDemo = useAtomCommand(calendarEnvironment.addDemo);
  const [error, setError] = useState<string | null>(null);
  const [showDeclined, setShowDeclined] = useState<boolean | null>(null);
  const [addingDemo, setAddingDemo] = useState(false);

  if (!settings.ready || accounts === null) {
    return (
      <EnvironmentLoadingState
        environmentId={environmentId}
        resourceName="calendars"
        error={directoryError}
      />
    );
  }

  const setVisible = (calendar: Calendar, visible: boolean) => {
    setError(null);
    const store = calendarOptimisticStore(environmentId);
    const change = store.apply({ calendars: [{ calendarId: calendar.calendarId, visible }] });
    void updateCalendar({
      environmentId,
      input: { calendarId: calendar.calendarId, visible },
    }).then((result) => {
      store.settle(change);
      if (!AsyncResult.isSuccess(result)) {
        setError(atomCommandErrorMessage(result, `${calendar.name} could not be changed.`));
      }
    });
  };

  const changeShowDeclined = (value: boolean) => {
    setError(null);
    setShowDeclined(value);
    void updatePreferences({ environmentId, input: { showDeclined: value } }).then((result) => {
      setShowDeclined(null);
      if (!AsyncResult.isSuccess(result)) {
        setError(atomCommandErrorMessage(result, "The setting could not be saved."));
      }
    });
  };

  const addDemoCalendars = () => {
    if (addingDemo) return;
    setError(null);
    setAddingDemo(true);
    void addDemo({ environmentId, input: { size: "standard" } }).then((result) => {
      setAddingDemo(false);
      if (!AsyncResult.isSuccess(result)) {
        setError(atomCommandErrorMessage(result, "The demo calendars could not be added."));
      }
    });
  };

  const sortedAccounts = [...accounts].sort((a, b) => a.position - b.position);

  return (
    <ScrollView
      alwaysBounceVertical
      className="flex-1"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="gap-5 px-5 pt-4"
      contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
    >
      {error === null ? null : <ErrorBanner message={error} />}
      {sortedAccounts.map((account) => (
        <SettingsSection
          key={account.accountId}
          title={account.email}
          trailing={
            ACCOUNT_STATUS[account.status] === null ? undefined : (
              <Text
                className={cn(
                  "px-2 text-xs font-t3-medium",
                  account.status === "ok" || account.status === "syncing"
                    ? "text-foreground-muted"
                    : "text-danger-foreground",
                )}
              >
                {ACCOUNT_STATUS[account.status]}
              </Text>
            )
          }
        >
          {calendarsOf(settings.calendars, account).map((calendar, index) => (
            <CalendarRow
              key={calendar.calendarId}
              calendar={calendar}
              first={index === 0}
              onChange={setVisible}
            />
          ))}
        </SettingsSection>
      ))}
      {accounts.length === 0 ? null : (
        <SettingsSection title="Display">
          <View className="flex-row items-center gap-3 px-4 py-3">
            <Text className="min-w-0 flex-1 text-base text-foreground">Show declined events</Text>
            <ThemedSwitch
              accessibilityLabel="Show declined events"
              value={showDeclined ?? settings.preferences.showDeclined}
              onValueChange={changeShowDeclined}
            />
          </View>
        </SettingsSection>
      )}
      <Text className="px-2 text-sm leading-normal text-foreground-muted">
        {`Google accounts are connected from the ${BRAND.displayName} desktop or web app.`}
      </Text>
      {accounts.length > 0 ? null : (
        <Pressable
          accessibilityRole="button"
          className="items-center rounded-full bg-primary py-3 active:opacity-70"
          disabled={addingDemo}
          onPress={addDemoCalendars}
        >
          <Text className="text-sm font-t3-bold text-primary-foreground">
            {addingDemo ? "Adding demo calendars…" : "Add demo data"}
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function calendarsOf(
  calendars: ReadonlyArray<Calendar>,
  account: CalendarAccount,
): ReadonlyArray<Calendar> {
  return calendars
    .filter((calendar) => calendar.accountId === account.accountId)
    .sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name));
}

function CalendarRow(props: {
  readonly calendar: Calendar;
  readonly first: boolean;
  readonly onChange: (calendar: Calendar, visible: boolean) => void;
}) {
  const { calendar } = props;
  return (
    <View
      className={cn(
        "flex-row items-center gap-3 px-4 py-3",
        props.first ? undefined : "border-t border-separator",
      )}
    >
      <View className="size-3 rounded-full" style={{ backgroundColor: calendar.color }} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-base text-foreground">
          {calendar.name}
        </Text>
        {calendar.primary ? <Text className="text-xs text-foreground-muted">Primary</Text> : null}
      </View>
      <ThemedSwitch
        accessibilityLabel={`Show ${calendar.name}`}
        value={calendar.visible}
        onValueChange={(visible) => props.onChange(calendar, visible)}
      />
    </View>
  );
}
