export const PUBLIC_INTERNAL_ERROR = "Internal error";

/** Keep exception detail in server logs and return only a stable public message. */
export function redactInternalError(context: string, error: unknown): string {
  console.error(`[${context}]`, error);
  return PUBLIC_INTERNAL_ERROR;
}
