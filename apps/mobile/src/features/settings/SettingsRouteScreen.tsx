import { ScreenScrollView as ScrollView } from "../../components/ScreenScrollView";
import { useAuth, useUser } from "@clerk/expo";
import { BRAND } from "@t3tools/shared/brand";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { hasCloudPublicConfig } from "../cloud/publicConfig";
import { useSavedRemoteConnections } from "../../state/use-remote-environment-registry";
import { SettingsRow } from "./components/SettingsRow";
import { SettingsSection } from "./components/SettingsSection";
import { SettingsScreen } from "./components/SettingsScreen";

export function SettingsRouteScreen() {
  const insets = useSafeAreaInsets();
  const { savedConnectionsById } = useSavedRemoteConnections();

  return (
    <SettingsScreen title="Settings">
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="gap-4 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
      >
        <SettingsSection title="Connections">
          {/* Without cloud config there is no ClerkProvider, so useAuth would throw. */}
          {hasCloudPublicConfig() ? <AccountRow /> : null}
          <SettingsRow
            icon="desktopcomputer"
            label="Environments"
            value={`${Object.keys(savedConnectionsById).length}`}
            valuePosition="trailing"
            target="SettingsEnvironments"
          />
        </SettingsSection>

        <SettingsSection title="Interface">
          <SettingsRow icon="paintbrush" label="Appearance" target="SettingsAppearance" />
        </SettingsSection>

        <SettingsSection title="App">
          <SettingsRow
            icon="info.circle"
            label={`About ${BRAND.displayName}`}
            target="SettingsAbout"
          />
        </SettingsSection>
      </ScrollView>
    </SettingsScreen>
  );
}

function AccountRow() {
  const navigation = useNavigation();
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { user } = useUser();
  const accountLabel = !isLoaded
    ? "Checking"
    : !isSignedIn
      ? "Sign in"
      : (user?.primaryEmailAddress?.emailAddress ?? "Signed in");
  return (
    <SettingsRow
      icon="person.crop.circle"
      label={`${BRAND.displayName} Account`}
      value={accountLabel}
      disabled={!isLoaded}
      onPress={() => navigation.navigate("SettingsSheet", { screen: "SettingsAuth" })}
    />
  );
}
