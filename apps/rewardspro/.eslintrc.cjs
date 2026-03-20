/** @type {import('@types/eslint').Linter.BaseConfig} */
module.exports = {
  root: true,
  extends: [
    "@remix-run/eslint-config",
    "@remix-run/eslint-config/node",
    "@remix-run/eslint-config/jest-testing-library",
    "prettier",
  ],
  rules: {
    "@typescript-eslint/no-unused-vars": ["error", {
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
      destructuredArrayIgnorePattern: "^_",
    }],
  },
  globals: {
    shopify: "readonly"
  },
  overrides: [
    {
      // Theme extension JS files — browser context, no modules
      files: ["extensions/**/assets/*.js"],
      env: {
        browser: true,
        es2020: true,
      },
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: "script", // IIFEs, not ES modules
      },
      rules: {
        // Critical: catch duplicate keys like the OR bug
        "no-dupe-keys": "error",
        // Relaxed for browser scripts
        "no-undef": "off", // globals like Shopify, fetch, localStorage
        "no-unused-vars": ["warn", { args: "none" }],
        // Catch common issues
        "no-redeclare": "error",
        "no-constant-condition": "warn",
        "no-unreachable": "error",
      },
    },
  ],
};
