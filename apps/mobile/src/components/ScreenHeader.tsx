import { createNativeHeaderMenu } from "./nativeHeaderMenu.ios";
import { ScreenHeaderButton } from "./ScreenHeaderButton";
import { NativeHeaderToolbar, NativeStackScreenOptions } from "../native/StackHeader";
import type { ScreenHeaderProps } from "./ScreenHeader.types";
import type { AppSymbolName } from "./AppSymbol";

function iosIcon(icon: AppSymbolName) {
  return typeof icon === "string" ? icon : icon.ios;
}

/** Native (iOS) header: the title goes to the stack bar, actions and menus to its toolbar. */
export function ScreenHeader(props: ScreenHeaderProps) {
  const menus = props.menus ?? [];
  return (
    <>
      <NativeStackScreenOptions
        optionsVersion={props.optionsVersion}
        options={{
          headerShown: true,
          title: props.title,
          unstable_headerSubtitle: props.subtitle || undefined,
          ...props.options,
        }}
      />
      {(props.actions?.length || menus.length || props.trailing) &&
      props.options?.unstable_headerRightItems === undefined ? (
        <NativeHeaderToolbar placement="right">
          {props.actions?.map((action) => (
            <ScreenHeaderButton
              key={action.accessibilityLabel}
              {...action}
              icon={iosIcon(action.icon)}
              separateBackground
            />
          ))}
          {menus.map(createNativeHeaderMenu)}
          {props.trailing}
        </NativeHeaderToolbar>
      ) : null}
    </>
  );
}

export type {
  ScreenHeaderAction,
  ScreenHeaderMenu,
  ScreenHeaderMenuItem,
  ScreenHeaderProps,
} from "./ScreenHeader.types";
