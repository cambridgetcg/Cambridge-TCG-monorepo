/**
 * Public feedback input boundary.
 *
 * The endpoint is intentionally open, so it accepts only documented fields,
 * applies per-field limits, and stores contact details separately from report
 * content. That gives the retention sweep one reliable place to remove each
 * kind of personal data.
 */

export const FEEDBACK_KINDS = [
  "contract-drift",
  "guide-feedback",
  "endpoint-suggestion",
  "federation-adopter",
  "general",
] as const;

export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_CONTENT_RETENTION_DAYS = 180;
export const FEEDBACK_LIFECYCLE_RETENTION_DAYS = 730;

const GENERAL_TOPICS = new Set([
  "general",
  "order",
  "trade-in",
  "site-issue",
  "directory",
  "partnership",
]);

const COMMON_FIELDS = ["kind", "reporter_contact"] as const;

const FIELDS_BY_KIND: Record<FeedbackKind, readonly string[]> = {
  "contract-drift": [
    ...COMMON_FIELDS,
    "endpoint",
    "observed",
    "expected",
    "request_id_to_correlate",
  ],
  "guide-feedback": [
    ...COMMON_FIELDS,
    "guide_slug",
    "step_number",
    "observation",
    "expected",
  ],
  "endpoint-suggestion": [
    ...COMMON_FIELDS,
    "proposed_endpoint",
    "use_case",
  ],
  "federation-adopter": [
    ...COMMON_FIELDS,
    "platform_name",
    "platform_url",
    "federation_endpoint",
  ],
  general: [
    ...COMMON_FIELDS,
    "message",
    "topic",
    "listing",
    "name",
  ],
};

export type StoredFeedbackBody = Record<
  string,
  string | number | null
> & { kind: FeedbackKind };

export type FeedbackInputResult =
  | {
      ok: true;
      kind: FeedbackKind;
      reporterContact: string | null;
      storedBody: StoredFeedbackBody;
    }
  | { ok: false; message: string };

function fail(message: string): FeedbackInputResult {
  return { ok: false, message };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(
  input: Record<string, unknown>,
  field: string,
  maxLength: number,
  required = false,
): { ok: true; value?: string } | { ok: false; message: string } {
  const raw = input[field];
  if (raw === undefined || raw === null || raw === "") {
    return required
      ? { ok: false, message: `${field} is required.` }
      : { ok: true };
  }
  if (typeof raw !== "string") {
    return { ok: false, message: `${field} must be a string.` };
  }
  const value = raw.trim();
  if (!value) {
    return required
      ? { ok: false, message: `${field} is required.` }
      : { ok: true };
  }
  if (value.length > maxLength) {
    return {
      ok: false,
      message: `${field} must be ${maxLength} characters or fewer.`,
    };
  }
  return { ok: true, value };
}

function safeHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      parsed.username === "" &&
      parsed.password === ""
    );
  } catch {
    return false;
  }
}

function safeEmail(value: string): boolean {
  return (
    value.length <= 254 &&
    !value.includes(":") &&
    !value.includes("/") &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

function contact(
  input: Record<string, unknown>,
  required: boolean,
): { ok: true; value: string | null } | { ok: false; message: string } {
  const parsed = boundedString(input, "reporter_contact", 2048, required);
  if (!parsed.ok) return parsed;
  if (!parsed.value) return { ok: true, value: null };
  if (!safeEmail(parsed.value) && !safeHttpsUrl(parsed.value)) {
    return {
      ok: false,
      message: "reporter_contact must be an email address or an HTTPS URL without credentials.",
    };
  }
  return { ok: true, value: parsed.value };
}

function addString(
  input: Record<string, unknown>,
  output: StoredFeedbackBody,
  field: string,
  maxLength: number,
  required = false,
): FeedbackInputResult | null {
  const parsed = boundedString(input, field, maxLength, required);
  if (!parsed.ok) return parsed;
  if (parsed.value !== undefined) output[field] = parsed.value;
  return null;
}

function validateAllowedFields(
  input: Record<string, unknown>,
  kind: FeedbackKind,
): FeedbackInputResult | null {
  const allowed = new Set(FIELDS_BY_KIND[kind]);
  const unsupported = Object.keys(input).filter((key) => !allowed.has(key));
  return unsupported.length > 0
    ? fail(
        `Unsupported field${unsupported.length === 1 ? "" : "s"} for kind '${kind}': ${unsupported.join(", ")}.`,
      )
    : null;
}

/**
 * Convert untrusted JSON into the exact object that may enter raw_body.
 * reporter_contact is returned separately and never duplicated in raw_body.
 */
export function parseFeedbackInput(input: unknown): FeedbackInputResult {
  if (!isObject(input)) return fail("Body must be a JSON object.");

  if (
    typeof input.kind !== "string" ||
    !FEEDBACK_KINDS.includes(input.kind as FeedbackKind)
  ) {
    return fail(`kind must be one of: ${FEEDBACK_KINDS.join(", ")}.`);
  }

  const kind = input.kind as FeedbackKind;
  const unsupported = validateAllowedFields(input, kind);
  if (unsupported) return unsupported;

  const parsedContact = contact(
    input,
    kind === "contract-drift" || kind === "federation-adopter",
  );
  if (!parsedContact.ok) return parsedContact;

  const storedBody: StoredFeedbackBody = { kind };
  let invalid: FeedbackInputResult | null = null;

  if (kind === "contract-drift") {
    invalid =
      addString(input, storedBody, "endpoint", 512, true) ??
      addString(input, storedBody, "observed", 5000, true) ??
      addString(input, storedBody, "expected", 5000, true) ??
      addString(input, storedBody, "request_id_to_correlate", 128);
  } else if (kind === "guide-feedback") {
    invalid =
      addString(input, storedBody, "guide_slug", 160, true) ??
      addString(input, storedBody, "observation", 5000, true) ??
      addString(input, storedBody, "expected", 5000, true);
    if (!invalid && input.step_number !== undefined && input.step_number !== null) {
      if (
        typeof input.step_number !== "number" ||
        !Number.isSafeInteger(input.step_number) ||
        input.step_number < 1 ||
        input.step_number > 10_000
      ) {
        return fail("step_number must be a whole number from 1 to 10000.");
      }
      storedBody.step_number = input.step_number;
    }
  } else if (kind === "endpoint-suggestion") {
    invalid =
      addString(input, storedBody, "proposed_endpoint", 512, true) ??
      addString(input, storedBody, "use_case", 5000, true);
  } else if (kind === "federation-adopter") {
    invalid =
      addString(input, storedBody, "platform_name", 160, true) ??
      addString(input, storedBody, "platform_url", 2048, true) ??
      addString(input, storedBody, "federation_endpoint", 2048, true);
    if (!invalid) {
      for (const field of ["platform_url", "federation_endpoint"] as const) {
        const value = storedBody[field];
        if (typeof value !== "string" || !safeHttpsUrl(value)) {
          return fail(`${field} must be an HTTPS URL without credentials.`);
        }
      }
    }
  } else {
    invalid =
      addString(input, storedBody, "message", 5000, true) ??
      addString(input, storedBody, "name", 120) ??
      addString(input, storedBody, "topic", 64) ??
      addString(input, storedBody, "listing", 48);

    if (!invalid && storedBody.topic && !GENERAL_TOPICS.has(String(storedBody.topic))) {
      return fail("topic is not one of the supported contact-form topics.");
    }
    if (
      !invalid &&
      storedBody.listing &&
      !/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/.test(String(storedBody.listing))
    ) {
      return fail("listing must be a 3-48 character organisation slug.");
    }
  }

  if (invalid) return invalid;

  // A second whole-record ceiling makes future field additions fail safely
  // even if their individual limits are accidentally too generous.
  if (Buffer.byteLength(JSON.stringify(storedBody), "utf8") > 16_384) {
    return fail("The stored report content must be 16384 bytes or fewer.");
  }

  return {
    ok: true,
    kind,
    reporterContact: parsedContact.value,
    storedBody,
  };
}
