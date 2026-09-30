import { SymbolView as ExpoSymbolView } from "expo-symbols";
import { withUniwind } from "uniwind";
import type { AppSymbolViewProps } from "./AppSymbol";

export type { SFSymbol } from "expo-symbols";
export type { AppSymbolName } from "./AppSymbol";

/** SF Symbols on iOS; expo-symbols picks the iOS name of a `{ ios, android }` pair. */
function AppSymbolView(props: AppSymbolViewProps) {
  return <ExpoSymbolView {...props} />;
}

export const SymbolView = withUniwind(AppSymbolView);
