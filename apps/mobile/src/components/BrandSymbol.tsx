import { BRAND_SYMBOL } from "@t3tools/shared/brandSymbol";
import type { ColorValue } from "react-native";
import { Path, Svg } from "react-native-svg";

/** The app's symbol, drawn in one color. */
export function BrandSymbol(props: {
  readonly size: number;
  readonly color: ColorValue | undefined;
}) {
  return (
    <Svg width={props.size} height={props.size} viewBox={BRAND_SYMBOL.viewBox}>
      <Path fill={props.color} fillRule="evenodd" d={BRAND_SYMBOL.path} />
    </Svg>
  );
}
