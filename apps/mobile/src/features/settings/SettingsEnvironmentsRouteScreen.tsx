import { ScreenScrollView as ScrollView } from "../../components/ScreenScrollView";
import { useNavigation } from "@react-navigation/native";
import { useAtomValue } from "@effect/atom-react";
import { managedRelaySessionAtom } from "@t3tools/client-runtime/relay";
import type { EnvironmentId } from "@t3tools/contracts";
import { useCallback, useRef, useState } from "react";
import { Platform, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SettingsScreen } from "./components/SettingsScreen";
import { AndroidAnchoredMenu } from "../../components/AndroidAnchoredMenu";
import { AndroidHeaderIconButton } from "../../components/AndroidScreenHeader";
import { CloudEnvironmentRows } from "../connection/CloudEnvironmentRows";
import { LocalEnvironmentList } from "../connection/LocalEnvironmentList";
import { splitEnvironmentSections } from "../connection/environmentSections";
import { useUniwindTheme } from "../../lib/useUniwindTheme";
import { useRemoteConnections } from "../../state/use-remote-environment-registry";
import { relayEnvironmentDiscovery } from "../../state/relay";
import { useAtomCommand } from "../../state/use-atom-command";

export function SettingsEnvironmentsRouteScreen() {
  const {
    connectedEnvironments,
    onReconnectEnvironment,
    onRemoveEnvironmentPress,
    onSetEnvironmentEnabled,
    onUpdateEnvironment,
  } = useRemoteConnections();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const environmentSections = splitEnvironmentSections({
    connectedEnvironments,
    cloudEnvironments: null,
  });
  const headerIconColor = useUniwindTheme()["--color-icon"];
  const relaySession = useAtomValue(managedRelaySessionAtom);
  const refreshRelayEnvironments = useAtomCommand(
    relayEnvironmentDiscovery.refresh,
    "relay environment refresh",
  );
  const [isRefreshingCloud, setIsRefreshingCloud] = useState(false);
  const cloudRefreshPendingRef = useRef(false);
  async function refreshCloudEnvironments() {
    if (!relaySession || cloudRefreshPendingRef.current) return;
    cloudRefreshPendingRef.current = true;
    setIsRefreshingCloud(true);
    try {
      await refreshRelayEnvironments();
    } finally {
      cloudRefreshPendingRef.current = false;
      setIsRefreshingCloud(false);
    }
  }

  const openEnvironment = useCallback(
    (environmentId: EnvironmentId) => {
      navigation.navigate("SettingsSheet", {
        screen: "SettingsContent",
        params: { screen: "SettingsEnvironmentDetail", params: { environmentId } },
      });
    },
    [navigation],
  );
  return (
    <SettingsScreen
      title="Environments"
      trailing={
        Platform.OS === "android" && relaySession ? (
          <AndroidAnchoredMenu
            title="Environment options"
            actions={[
              {
                id: "refresh",
                title: "Refresh cloud environments",
                attributes: { disabled: isRefreshingCloud },
              },
            ]}
            onPressAction={({ nativeEvent }) => {
              if (nativeEvent.event === "refresh") void refreshCloudEnvironments();
            }}
          >
            {(open) => (
              <AndroidHeaderIconButton
                accessibilityLabel="Environment options"
                icon="ellipsis"
                onPress={open}
              />
            )}
          </AndroidAnchoredMenu>
        ) : undefined
      }
      actions={[
        {
          accessibilityLabel: "Add environment",
          icon: "plus",
          tintColor: headerIconColor,
          onPress: () =>
            navigation.navigate("SettingsSheet", {
              screen: "SettingsContent",
              params: { screen: "SettingsEnvironmentNew" },
            }),
        },
      ]}
    >
      <ScrollView
        alwaysBounceVertical
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="px-5 pt-4"
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom, 18) + 18,
        }}
        refreshControl={
          relaySession ? (
            <RefreshControl
              refreshing={isRefreshingCloud}
              onRefresh={() => void refreshCloudEnvironments()}
            />
          ) : undefined
        }
      >
        <LocalEnvironmentList
          environments={environmentSections.localEnvironments}
          expandedId={null}
          onToggle={openEnvironment}
          opensDetails
          onReconnect={onReconnectEnvironment}
          onRemove={onRemoveEnvironmentPress}
          onSetEnabled={onSetEnvironmentEnabled}
          onUpdate={onUpdateEnvironment}
        />

        {/* Always mounted: already-connected relay environments must stay
            visible (and removable) even when cloud config is missing or the
            user is signed out — the component gates discovery itself. */}
        <CloudEnvironmentRows
          connectedCloudEnvironments={environmentSections.connectedCloudEnvironments}
          onOpenEnvironment={openEnvironment}
          onSetEnvironmentEnabled={onSetEnvironmentEnabled}
          onRemoveEnvironment={onRemoveEnvironmentPress}
        />
      </ScrollView>
    </SettingsScreen>
  );
}
