import { useNavigation } from "@react-navigation/native";
import { View } from "react-native";

import { EmptyState } from "../../components/EmptyState";

/** What a data screen shows before any environment is saved and switched on. */
export function NoEnvironmentState() {
  const navigation = useNavigation();
  return (
    <View className="flex-1 justify-center">
      <EmptyState
        variant="plain"
        title="Connect an environment"
        detail="Pair with a server on your computer, or sign in to reach the ones on your account."
        actionLabel="Add environment"
        onAction={() =>
          navigation.navigate("SettingsSheet", {
            screen: "SettingsContent",
            params: { screen: "SettingsEnvironmentNew" },
          })
        }
      />
    </View>
  );
}
