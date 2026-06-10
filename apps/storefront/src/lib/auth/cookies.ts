// Single source of truth for the session-cookie name(s).
//
// Two consumers stay in sync via this file:
//
//   1. `lib/auth/index.ts` reads SESSION_COOKIE_OVERRIDE — if defined,
//      it's passed through as authConfig.cookies.sessionToken.name and
//      becomes the literal cookie Auth.js sets.
//
//   2. `proxy.ts` reads SESSION_COOKIE_NAMES — the list it checks
//      against on every gated request at the network edge.
//
// Why the file has no imports: proxy.ts runs before any page renders
// and must be cheap to load. Pulling next-auth or pg into this module
// would (a) defeat the cookie-only optimization and (b) make this file
// untestable in vitest, which can't resolve next-auth's ESM extensions.
// Keeping it import-free means cookies.test.ts can assert on it
// without trace amounts of the framework.
//
// To customize the name (very rare — only if you also override the
// cookie path/domain in production for some reason):
//   1. Set SESSION_COOKIE_OVERRIDE below
//   2. The proxy + authConfig pick it up automatically
//   3. cookies.test.ts asserts the override is the *only* name in
//      SESSION_COOKIE_NAMES — defaults don't leak through.

export const SESSION_COOKIE_OVERRIDE: string | undefined = undefined;

const AUTHJS_V5_DEFAULTS = [
  "__Secure-authjs.session-token", // HTTPS / production
  "authjs.session-token",          // HTTP  / development
] as const;

// If an override is set, ONLY the override is valid — defaults must
// not leak through (would let unauthenticated cookies named with the
// default value pass the proxy's presence check).
export const SESSION_COOKIE_NAMES: readonly string[] =
  SESSION_COOKIE_OVERRIDE !== undefined
    ? [SESSION_COOKIE_OVERRIDE]
    : AUTHJS_V5_DEFAULTS;
