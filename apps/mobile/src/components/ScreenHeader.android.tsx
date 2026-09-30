import { NativeStackScreenOptions } from "../native/StackHeader";
import { AndroidScreenHeader } from "./AndroidScreenHeader";
import { ScreenHeaderButton } from "./ScreenHeaderButton.android";
import { ControlPillMenu } from "./ControlPill";
import { androidHeaderMenuActions, findHeaderMenuAction } from "./headerMenu.android";
import type { ScreenHeaderProps } from "./ScreenHeader.types";

/** Android renders its header in flow; the native stack bar stays hidden. */
export function ScreenHeader(props: ScreenHeaderProps) {
  return (
    <>
      <NativeStackScreenOptions
        options={{ ...props.options, headerShown: false, title: props.title }}
        optionsVersion={props.optionsVersion}
      />
      <AndroidScreenHeader
        title={props.title}
        subtitle={props.subtitle}
        onBack={props.onBack}
        hideBottomBorder={props.hideBottomBorder}
        actions={props.actions}
        trailing={
          <>
            {props.menus?.map((menu) => (
              <ControlPillMenu
                key={menu.title}
                actions={androidHeaderMenuActions(menu.items)}
                isAnchoredToRight
                title={menu.status ?? menu.title}
                onPressAction={({ nativeEvent }) => {
                  const action = findHeaderMenuAction(menu.items, nativeEvent.event);
                  if (action && !action.disabled) action.onPress();
                }}
              >
                <ScreenHeaderButton accessibilityLabel={menu.title} icon={menu.icon} />
              </ControlPillMenu>
            ))}
            {props.trailing}
          </>
        }
      />
    </>
  );
}
