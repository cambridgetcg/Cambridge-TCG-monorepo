export interface ManifestResource {
  id: string;
  path: string;
  host: "storefront" | "wholesale";
  methods: readonly string[];
  auth: string;
}

export interface DeliberateContract {
  status: number;
  bodyIncludes: readonly string[];
  cacheControlIncludes: readonly string[];
}

export interface ExpectedResponse {
  codes: readonly number[];
  label: string;
  deliberate?: DeliberateContract;
}

export interface ResponseAssessment {
  passed: boolean;
  detail?: string;
}

// These responses are healthy only when status, stable body markers, and cache
// policy all agree. A generic platform 503 must never pass this gate.
export const DELIBERATE_CONTRACTS: Readonly<Record<string, DeliberateContract>> = {
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
};

export function expectedFor(resource: ManifestResource): ExpectedResponse {
  const deliberate = DELIBERATE_CONTRACTS[resource.path];
  if (deliberate !== undefined) {
    return {
      codes: [deliberate.status],
      label: `${deliberate.status} (deliberate contract)`,
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

  const cacheControl = response.headers.get("cache-control") ?? "";
  const missingCacheMarkers = expected.deliberate.cacheControlIncludes.filter(
    (marker) => !cacheControl.includes(marker),
  );
  const body = await response.text();
  const missingBodyMarkers = expected.deliberate.bodyIncludes.filter(
    (marker) => !body.includes(marker),
  );

  if (missingCacheMarkers.length > 0 || missingBodyMarkers.length > 0) {
    const missing = [
      ...missingCacheMarkers.map((marker) => `cache-control:${marker}`),
      ...missingBodyMarkers.map((marker) => `body:${marker}`),
    ];
    return {
      passed: false,
      detail: `deliberate contract mismatch - missing ${missing.join(", ")}`,
    };
  }

  return { passed: true };
}
