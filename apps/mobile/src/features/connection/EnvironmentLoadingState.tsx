import type { EnvironmentId } from "@t3tools/contracts";
import { ActivityIndicator, View } from "react-native";

import { ErrorBanner } from "../../components/ErrorBanner";
import { environmentCatalog } from "../../connection/catalog";
import { useEnvironmentPresentation } from "../../state/presentation";
import { useAtomCommand } from "../../state/use-atom-command";
import { EnvironmentConnectionNotice } from "./EnvironmentConnectionNotice";

/**
 * What a screen shows while its environment data has not arrived: the connection's state when
 * the environment is not connected, the request's error, or a spinner.
 */
export function EnvironmentLoadingState(props: {
  readonly environmentId: EnvironmentId;
  readonly resourceName: string;
  readonly error: string | null;
}) {
  const { presentation } = useEnvironmentPresentation(props.environmentId);
  const retryEnvironment = useAtomCommand(environmentCatalog.retryNow, "environment retry");

  if (presentation !== null && presentation.connection.phase !== "connected") {
    return (
      <EnvironmentConnectionNotice
        environmentLabel={presentation.entry.target.label}
        connection={presentation.connection}
        resourceName={props.resourceName}
        onRetry={() => void retryEnvironment(props.environmentId)}
      />
    );
  }
  if (props.error !== null) {
    return (
      <View className="px-5 pt-4">
        <ErrorBanner message={props.error} />
      </View>
    );
  }
  return (
    <View className="flex-1 items-center justify-center">
      <ActivityIndicator />
    </View>
  );
}
