import { BRAND_SYMBOL } from "@t3tools/shared/brandSymbol";
import type { SVGProps } from "react";

/** The app's symbol in the current text color; size it with `size-*`. */
export function BrandSymbol(props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden {...props} viewBox={BRAND_SYMBOL.viewBox} fill="currentColor">
      <path fillRule="evenodd" d={BRAND_SYMBOL.path} />
    </svg>
  );
}
