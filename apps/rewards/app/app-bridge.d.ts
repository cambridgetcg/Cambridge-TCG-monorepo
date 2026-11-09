/**
 * App Bridge's `s-app-nav` for React 19's JSX. @shopify/app-bridge-types
 * (re-exported by @shopify/app-bridge-react) declares its elements on the
 * global JSX namespace only, which React 19 no longer reads, and
 * @shopify/polaris-types has no `s-app-nav`. Its `s-link` children are
 * Polaris's, typed by @shopify/polaris-types.
 */
import type { SAppNavAttributes } from "@shopify/app-bridge-react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "s-app-nav": SAppNavAttributes;
    }
  }
}
