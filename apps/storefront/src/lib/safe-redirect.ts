/** Return a header-safe, origin-relative preference redirect. */
export function safeRelativeRedirectPath(
  candidate: string | null,
  fallback: string,
): string {
  function normalize(value: string | null): string | null {
    if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
    // Browsers strip ASCII control characters during URL parsing, and raw
    // controls are invalid in response headers. Require spaces to be encoded.
    if ([...value].some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)) return null;
    try {
      // Serialize Unicode safely without adopting the request/proxy hostname.
      const url = new URL(value, "https://relative.invalid");
      if (url.origin !== "https://relative.invalid" || url.pathname.startsWith("//")) return null;
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return null;
    }
  }
  return normalize(candidate) ?? normalize(fallback) ?? "/";
}
