/** Keep preference redirects on the current origin. */
export function safeRelativeRedirectPath(
  candidate: string | null,
  fallback: string,
): string {
  const value = candidate || fallback;
  return value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.startsWith("/\\")
    ? value
    : fallback;
}
