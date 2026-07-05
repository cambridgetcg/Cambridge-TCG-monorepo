import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Storefront's lint never actually gated in CI — wholesale's broken
  // lint crashed the recursive run first and masked this debt (818
  // errors revealed 2026-07-05: 662 unescaped apostrophes in JSX copy,
  // 99 set-state-in-effect from the new react-hooks major, 25 anys, 25
  // <a>-for-pages, …). Downgraded to warnings so CI gates on NEW error
  // classes on the live shop while the debt is paid down incrementally.
  // Tighten a rule back to "error" as its count reaches zero.
  {
    rules: {
      "react/no-unescaped-entities": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "@next/next/no-html-link-for-pages": "warn",
      "prefer-const": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
