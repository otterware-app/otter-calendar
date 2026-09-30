# Mobile navigation

Every screen shares the [root native stack](../../apps/mobile/src/Stack.tsx) so UIKit can
animate the header within one navigation controller. Splitting screens between controllers
loses that continuous transition.

## UIKit constraints

The [react-native-screens patch](../../patches/react-native-screens@4.26.2.patch)
preserves behavior that is easy to break when changing native headers:

- The brand belongs in `headerTitle`. On iOS 26.5, UIKit morphs a background-free
  leading toolbar item's rectangle into the next screen's glass back button,
  even when the items have different identifiers.
- UIKit's scroll-edge fade does not recognize Fabric text views. An empty native
  label supplies the custom title's geometry. Removing that apparently unused
  view changes the fade.
- Leading, trailing, and center item groups need independent caches. A button can
  belong to only one group; rebuilding an unchanged group can pull its buttons
  out of a group UIKit is still animating. Cache ownership also includes the
  header config, whose event emitter changes on remount.
- A horizontal ScrollView at its leading edge must yield to the full-screen back
  gesture. Upstream gives every horizontal ScrollView priority, so swiping back
  on a code block or table can only bounce its content.

The patch adds native header props that require code generation and a new binary.
Patch rebuild guidance lives in the
[mobile development README](../../apps/mobile/README.md#development).
