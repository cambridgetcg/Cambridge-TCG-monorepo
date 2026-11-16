/**
 * App Bridge's `s-app-nav` and `ui-save-bar` for React 19's JSX.
 * @shopify/app-bridge-types (re-exported by @shopify/app-bridge-react)
 * declares its elements on the global JSX namespace only, which React 19 no
 * longer reads, and @shopify/polaris-types has neither. The `s-link` children
 * of `s-app-nav` are Polaris's, typed by @shopify/polaris-types; the `button`
 * children of `ui-save-bar` are plain buttons, whose `variant` and `loading`
 * App Bridge's types add.
 */
import type { SAppNavAttributes, UISaveBarAttributes } from "@shopify/app-bridge-react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "s-app-nav": SAppNavAttributes;
      "ui-save-bar": UISaveBarAttributes;
    }
  }
}
