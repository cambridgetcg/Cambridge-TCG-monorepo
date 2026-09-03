export interface ManifestResource {
  id: string;
  path: string;
  host: "storefront" | "wholesale";
  methods: readonly string[];
  auth: string;
}

export interface DeliberateContract {
  variant?: string;
  status: number;
  bodyIncludes: readonly string[];
  bodyExcludes?: readonly string[];
  cacheControlIncludes: readonly string[];
  exactBody?:
    | Readonly<{ kind: "json"; value: unknown }>
    | Readonly<{ kind: "prism-signals-all-offer-v1" }>;
  exactCacheControl?: string;
}

export type DeliberateContractDeclaration =
  | DeliberateContract
  | readonly DeliberateContract[];

export interface ExpectedResponse {
  codes: readonly number[];
  label: string;
  deliberate?: readonly DeliberateContract[];
}

export interface ResponseAssessment {
  passed: boolean;
  detail?: string;
  variant?: string;
}

export const PRISM_DEPLOYMENT_POSTURES = Object.freeze({
  unconfigured: Object.freeze({
    offer: "unconfigured",
    webhook: "unconfigured",
    page: "checkout-paused",
  }),
  "configured-paused": Object.freeze({
    offer: "configured",
    webhook: "configured-processing-paused",
    page: "checkout-paused",
  }),
  "processing-only": Object.freeze({
    offer: "configured",
    webhook: "processing-enabled-unsigned-probe",
    page: "checkout-paused",
  }),
  "intake-enabled": Object.freeze({
    offer: "configured",
    webhook: "processing-enabled-unsigned-probe",
    page: "checkout-available",
  }),
});

export type PrismDeploymentPosture = keyof typeof PRISM_DEPLOYMENT_POSTURES;

export interface PrismPostureObservation {
  offer?: string;
  webhook?: string;
  page?: string;
}

export interface PrismPostureAssessment {
  passed: boolean;
  stage?: PrismDeploymentPosture;
  detail?: string;
}

// These responses are healthy only when status, stable body markers, and cache
// policy all agree. A generic platform 503 must never pass this gate.
export const DELIBERATE_CONTRACTS: Readonly<
  Record<string, DeliberateContractDeclaration>
> = {
  "/api/v1/coffee": {
    status: 418,
    bodyIncludes: ['"@kind":"wrong-brew"', '"walking_past_is_honored":true'],
    cacheControlIncludes: ["public", "max-age=86400"],
  },
  "/api/v1/buy-the-kingdom": {
    status: 402,
    bodyIncludes: ['"@kind":"polite-402"', '"offer_declined":"the kingdom"'],
    cacheControlIncludes: ["public", "max-age=86400"],
  },
  "/data/catalog.jsonl": {
    status: 503,
    bodyIncludes: [
      '"@kind":"catalog_manifest"',
      '"publication_status":"paused_pending_field_level_rights"',
      '"count_emitted":0',
    ],
    cacheControlIncludes: ["public", "s-maxage=900"],
  },
  "/api/v1/do-you-remember-me": {
    status: 503,
    bodyIncludes: [
      '"code":"SOURCE_UNAVAILABLE"',
      '"status":"publication-disabled"',
      '"input_inspected":false',
    ],
    cacheControlIncludes: ["no-store"],
  },
  "/api/v1/cards/[sku]/history": {
    status: 503,
    bodyIncludes: [
      '"publication_status":"paused_pending_row_level_publication_receipts"',
      '"price_values_published":false',
    ],
    cacheControlIncludes: ["no-store"],
  },
  "/api/v1/sets/[code]/checklist": {
    status: 503,
    bodyIncludes: [
      '"publication_status":"paused_pending_set_enumeration_and_field_rights"',
      '"checklist_rows_published":false',
    ],
    cacheControlIncludes: ["no-store"],
  },
  "/api/v1/cards/[sku]/tcgplayer-history": {
    status: 503,
    bodyIncludes: [
      '"code":"SOURCE_UNAVAILABLE"',
      '"state":"blocked-by-upstream-terms"',
    ],
    cacheControlIncludes: ["no-store"],
  },
  "/api/v1/prices": {
    status: 503,
    bodyIncludes: [
      '"publication_status":"blocked"',
      '"source":"legacy-wholesale-catalog"',
      '"items":[]',
    ],
    cacheControlIncludes: ["private", "no-store"],
  },
  "/api/v1/prices/[sku]": {
    status: 503,
    bodyIncludes: [
      '"publication_status":"blocked"',
      '"source":"legacy-wholesale-catalog"',
      "No field-level receipt separates independently publishable catalog fields",
    ],
    cacheControlIncludes: ["private", "no-store"],
  },
  "/api/v1/ingest-quarantine/[id]": {
    status: 503,
    bodyIncludes: [
      '"access_status":"blocked"',
      "Raw quarantine payloads and review mutations require a separate operator-only authorization surface",
    ],
    cacheControlIncludes: ["private", "no-store"],
  },
  "/prism-signals": [
    {
      variant: "checkout-paused",
      status: 200,
      bodyIncludes: ["New sandbox Checkout is paused or not configured."],
      bodyExcludes: ["The host reports that sandbox intake is available."],
      cacheControlIncludes: [],
    },
    {
      variant: "checkout-available",
      status: 200,
      bodyIncludes: ["The host reports that sandbox intake is available."],
      bodyExcludes: ["New sandbox Checkout is paused or not configured."],
      cacheControlIncludes: [],
    },
  ],
  "/api/prism-signals/offers/all": [
    {
      variant: "unconfigured",
      status: 503,
      bodyIncludes: [
        '"code":"offer_unavailable"',
        "The PRISM Signals All sandbox offer is not available.",
      ],
      cacheControlIncludes: ["public", "max-age=0", "s-maxage=10"],
      exactBody: {
        kind: "json",
        value: {
          error: {
            code: "offer_unavailable",
            message: "The PRISM Signals All sandbox offer is not available.",
          },
        },
      },
      exactCacheControl: "public, max-age=0, s-maxage=10",
    },
    {
      variant: "configured",
      status: 200,
      bodyIncludes: [
        '"schema":"cambridgetcg.product-offer/1"',
        '"id":"prism-signals-all"',
        '"status":"test"',
        '"environment":"test"',
        '"rail":"stripe_web"',
        '"availability":"test"',
        '"purpose":"synthetic_fixture_delivery"',
        '"decision":"granted"',
      ],
      cacheControlIncludes: ["public", "max-age=0", "s-maxage=60"],
      exactBody: { kind: "prism-signals-all-offer-v1" },
      exactCacheControl: "public, max-age=0, s-maxage=60",
    },
  ],
  "/api/prism-signals/stripe/checkout": {
    status: 403,
    bodyIncludes: [
      '"code":"invalid_origin"',
      "A same-origin browser request is required.",
    ],
    cacheControlIncludes: ["private", "no-store"],
    exactBody: {
      kind: "json",
      value: {
        error: {
          code: "invalid_origin",
          message: "A same-origin browser request is required.",
        },
      },
    },
    exactCacheControl: "private, no-store, max-age=0",
  },
  "/api/prism-signals/stripe/portal": {
    status: 403,
    bodyIncludes: [
      '"code":"invalid_origin"',
      "A same-origin browser request is required.",
    ],
    cacheControlIncludes: ["private", "no-store"],
    exactBody: {
      kind: "json",
      value: {
        error: {
          code: "invalid_origin",
          message: "A same-origin browser request is required.",
        },
      },
    },
    exactCacheControl: "private, no-store, max-age=0",
  },
  "/api/webhooks/stripe/prism-signals": [
    {
      variant: "unconfigured",
      status: 503,
      bodyIncludes: [
        '"code":"webhook_unavailable"',
        "The PRISM Signals Stripe webhook could not be durably processed.",
      ],
      cacheControlIncludes: ["private", "no-store", "max-age=0"],
      exactBody: {
        kind: "json",
        value: {
          error: {
            code: "webhook_unavailable",
            message:
              "The PRISM Signals Stripe webhook could not be durably processed.",
          },
        },
      },
      exactCacheControl: "private, no-store, max-age=0",
    },
    {
      variant: "configured-processing-paused",
      status: 503,
      bodyIncludes: [
        '"code":"webhook_processing_paused"',
        "PRISM Signals Stripe webhook processing is paused.",
      ],
      cacheControlIncludes: ["private", "no-store", "max-age=0"],
      exactBody: {
        kind: "json",
        value: {
          error: {
            code: "webhook_processing_paused",
            message: "PRISM Signals Stripe webhook processing is paused.",
          },
        },
      },
      exactCacheControl: "private, no-store, max-age=0",
    },
    {
      variant: "processing-enabled-unsigned-probe",
      status: 400,
      bodyIncludes: [
        '"code":"invalid_signature"',
        "A valid Stripe webhook signature is required.",
      ],
      cacheControlIncludes: ["private", "no-store", "max-age=0"],
      exactBody: {
        kind: "json",
        value: {
          error: {
            code: "invalid_signature",
            message: "A valid Stripe webhook signature is required.",
          },
        },
      },
      exactCacheControl: "private, no-store, max-age=0",
    },
  ],
};

function deliberateAlternatives(
  declaration: DeliberateContractDeclaration,
): readonly DeliberateContract[] {
  return "status" in declaration ? [declaration] : declaration;
}

function normalizedJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizedJson);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, normalizedJson(nested)]),
  );
}

function sameJson(left: unknown, right: unknown): boolean {
  return (
    JSON.stringify(normalizedJson(left)) ===
    JSON.stringify(normalizedJson(right))
  );
}

function prismSignalsAllOffer(priceRef: string): unknown {
  return {
    schema: "cambridgetcg.product-offer/1",
    brand: {
      name: "Cambridge TCG",
      product_name: "PRISM Signals All",
      byline: "Potential deals, with the risks attached.",
    },
    id: "prism-signals-all",
    version: 1,
    status: "test",
    environment: "test",
    audience:
      "Invited account holders testing a monthly Stripe sandbox subscription and owner access projection around the fixed public PRISM synthetic fixture.",
    delivery: {
      web: { availability: "test", url: "/prism-signals/account" },
      telegram: { availability: "off" },
    },
    rails: [
      {
        rail: "stripe_web",
        channel: "web",
        availability: "test",
        price_ref: priceRef,
      },
      {
        rail: "telegram_stars",
        channel: "telegram",
        availability: "off",
      },
      { rail: "paypal_web", channel: "web", availability: "off" },
      { rail: "crypto_web", channel: "web", availability: "off" },
    ],
    rights: {
      purpose: "synthetic_fixture_delivery",
      decision: "granted",
    },
    links: {
      terms: "/prism-signals/terms",
      support: "/contact",
      methodology: "/methodology/prism-signals",
    },
    non_claims: [
      "payment_is_not_source_permission",
      "transformation_is_not_source_permission",
      "secrecy_is_not_source_permission",
      "public_reachability_is_not_source_permission",
      "channel_access_is_not_source_or_redistribution_permission",
    ],
  };
}

function exactBodyMatches(
  body: string,
  exactBody: NonNullable<DeliberateContract["exactBody"]>,
): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    return false;
  }

  if (exactBody.kind === "json") return sameJson(parsed, exactBody.value);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return false;
  }
  const rails = (parsed as { rails?: unknown }).rails;
  if (!Array.isArray(rails) || rails.length === 0) return false;
  const stripeRail = rails[0];
  if (
    typeof stripeRail !== "object" ||
    stripeRail === null ||
    Array.isArray(stripeRail)
  ) {
    return false;
  }
  const priceRef = (stripeRail as { price_ref?: unknown }).price_ref;
  if (
    typeof priceRef !== "string" ||
    !/^pf_[A-Za-z0-9_-]{43}$/.test(priceRef)
  ) {
    return false;
  }
  return sameJson(parsed, prismSignalsAllOffer(priceRef));
}

function postureObservationLabel(
  observation: PrismPostureObservation,
): string {
  return [
    `offer=${observation.offer ?? "missing"}`,
    `webhook=${observation.webhook ?? "missing"}`,
    `page=${observation.page ?? "missing"}`,
  ].join(", ");
}

/**
 * Proves the three independently fetched PRISM surfaces describe one possible
 * deployment state. Endpoint-local success is insufficient because a mixed
 * Vercel deployment or partial environment transition can make every response
 * valid in isolation while the aggregate posture is unsafe.
 */
export function assessPrismPosture(
  observation: PrismPostureObservation,
  required?: PrismDeploymentPosture,
): PrismPostureAssessment {
  const stages = Object.keys(
    PRISM_DEPLOYMENT_POSTURES,
  ) as PrismDeploymentPosture[];
  const matches = stages.filter((stage) => {
    const tuple = PRISM_DEPLOYMENT_POSTURES[stage];
    return (
      tuple.offer === observation.offer &&
      tuple.webhook === observation.webhook &&
      tuple.page === observation.page
    );
  });

  if (matches.length !== 1) {
    return {
      passed: false,
      detail: `incoherent PRISM deployment posture (${postureObservationLabel(observation)})`,
    };
  }

  const stage = matches[0];
  if (required !== undefined && stage !== required) {
    return {
      passed: false,
      stage,
      detail: `required PRISM posture ${required}, observed ${stage}`,
    };
  }
  return { passed: true, stage };
}

export function parseRequiredPrismPosture(
  args: readonly string[],
): PrismDeploymentPosture | undefined {
  const prefix = "--prism-posture=";
  const supplied = args.filter(
    (argument) =>
      argument === "--prism-posture" || argument.startsWith(prefix),
  );
  if (supplied.length === 0) return undefined;
  if (supplied.length !== 1 || supplied[0] === "--prism-posture") {
    throw new Error(
      "Supply exactly one --prism-posture=unconfigured|configured-paused|processing-only|intake-enabled argument.",
    );
  }
  const value = supplied[0].slice(prefix.length);
  if (!Object.hasOwn(PRISM_DEPLOYMENT_POSTURES, value)) {
    throw new Error(
      "Unknown PRISM posture; expected unconfigured, configured-paused, processing-only, or intake-enabled.",
    );
  }
  return value as PrismDeploymentPosture;
}

export function expectedFor(resource: ManifestResource): ExpectedResponse {
  const declaration = DELIBERATE_CONTRACTS[resource.path];
  if (declaration !== undefined) {
    const deliberate = deliberateAlternatives(declaration);
    const codes = [...new Set(deliberate.map((contract) => contract.status))];
    return {
      codes,
      label: `${codes.join("/")} (deliberate ${
        deliberate.length === 1 ? "contract" : "alternatives"
      })`,
      deliberate,
    };
  }

  const healthyAnyKind = [200, 307, 400, 401, 404, 405];
  if (resource.auth === "wholesale-key") {
    return { codes: [401, 404], label: "401 (bearer required) / 404 (route absent)" };
  }
  if (resource.auth === "agent") {
    return { codes: [200, 400, 401], label: "200/400/401" };
  }
  if (resource.auth === "user") {
    return { codes: [200, 307, 400, 401, 405], label: "200/307/400/401/405 (login flow)" };
  }
  if (resource.auth === "admin") {
    return { codes: [307, 401], label: "307/401 (admin gate)" };
  }
  if (resource.methods.includes("GET")) {
    return { codes: healthyAnyKind, label: "200 / 307 / 400 / 401 / 404 / 405" };
  }
  return { codes: [400, 405, 422], label: "method-not-allowed range" };
}

export async function assessResponse(
  resource: ManifestResource,
  response: Response,
  expected: ExpectedResponse = expectedFor(resource),
): Promise<ResponseAssessment> {
  const isParametric = /\[[^\]]+\]/.test(resource.path);
  const exactStatus = expected.codes.includes(response.status);
  const parametricFallback =
    expected.deliberate === undefined &&
    isParametric &&
    (response.status === 404 || response.status === 400);
  const unexpectedServerError =
    response.status >= 500 &&
    response.status < 600 &&
    !expected.codes.includes(response.status);

  if (unexpectedServerError) {
    return { passed: false, detail: `server error ${response.status} - investigate` };
  }
  if (!exactStatus && !parametricFallback) {
    return {
      passed: false,
      detail: `expected ${expected.label}, got ${response.status}`,
    };
  }
  if (expected.deliberate === undefined) return { passed: true };

  const body = await response.text();
  const cacheControl = response.headers.get("cache-control") ?? "";
  const alternatives = expected.deliberate.filter(
    (contract) => contract.status === response.status,
  );
  const mismatches: string[] = [];

  for (const contract of alternatives) {
    const missingCacheMarkers = contract.cacheControlIncludes.filter(
      (marker) => !cacheControl.includes(marker),
    );
    const missingBodyMarkers = contract.bodyIncludes.filter(
      (marker) => !body.includes(marker),
    );
    const forbiddenBodyMarkers = (contract.bodyExcludes ?? []).filter(
      (marker) => body.includes(marker),
    );
    const missing = [
      ...missingCacheMarkers.map((marker) => `cache-control:${marker}`),
      ...missingBodyMarkers.map((marker) => `body:${marker}`),
      ...forbiddenBodyMarkers.map((marker) => `body-forbidden:${marker}`),
    ];

    if (
      contract.exactCacheControl !== undefined &&
      cacheControl.toLowerCase() !== contract.exactCacheControl.toLowerCase()
    ) {
      missing.push(`cache-control:exact:${contract.exactCacheControl}`);
    }
    if (
      contract.exactBody !== undefined &&
      !exactBodyMatches(body, contract.exactBody)
    ) {
      missing.push(`body:exact-${contract.exactBody.kind}`);
    }
    if (missing.length === 0) {
      return contract.variant === undefined
        ? { passed: true }
        : { passed: true, variant: contract.variant };
    }

    mismatches.push(
      `${contract.variant ?? `status-${contract.status}`}: missing ${missing.join(", ")}`,
    );
  }

  return {
    passed: false,
    detail: `deliberate contract mismatch - ${mismatches.join(" | ")}`,
  };
}
