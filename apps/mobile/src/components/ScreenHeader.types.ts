import type { ReactNode } from "react";
import type { ColorValue } from "react-native";
import type { AppNativeStackNavigationOptions } from "../native/StackHeader";
import type { AppSymbolName } from "./AppSymbol";

export interface ScreenHeaderAction {
  readonly accessibilityLabel: string;
  readonly icon: AppSymbolName;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly selected?: boolean;
  readonly tintColor?: ColorValue;
}

export type ScreenHeaderMenuItem =
  | {
      readonly id: string;
      readonly title: string;
      readonly icon?: string;
      readonly subtitle?: string;
      readonly disabled?: boolean;
      readonly selected?: boolean;
      readonly destructive?: boolean;
      readonly onPress: () => void;
    }
  | {
      readonly id: string;
      readonly title?: string;
      readonly icon?: string;
      readonly inline?: boolean;
      readonly items: ReadonlyArray<ScreenHeaderMenuItem>;
    };

export interface ScreenHeaderMenu {
  readonly title: string;
  readonly icon: AppSymbolName;
  readonly status?: string;
  readonly separateBackground?: boolean;
  readonly items: ReadonlyArray<ScreenHeaderMenuItem>;
}

export interface ScreenHeaderProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly actions?: ReadonlyArray<ScreenHeaderAction>;
  readonly menus?: ReadonlyArray<ScreenHeaderMenu>;
  readonly onBack?: () => void;
  readonly hideBottomBorder?: boolean;
  readonly trailing?: ReactNode;
  /** Custom native layouts can override options without duplicating the header renderer. */
  readonly options?: AppNativeStackNavigationOptions;
  readonly optionsVersion?: unknown;
}
