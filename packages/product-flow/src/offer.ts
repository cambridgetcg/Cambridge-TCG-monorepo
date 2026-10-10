import {
  PRODUCT_AVAILABILITIES,
  PRODUCT_ENVIRONMENTS,
  PRODUCT_FLOW_LIMITS,
  PRODUCT_OFFER_NON_CLAIMS,
  PRODUCT_OFFER_SCHEMA,
  PRODUCT_OFFER_STATUSES,
  PRODUCT_PAYMENT_RAILS,
  PRODUCT_RAIL_CHANNELS,
  PRODUCT_RIGHTS_DECISIONS,
} from "./constants";
import type { ProductFlowContractPhase } from "./error";
import type {
  ProductAvailability,
  ProductBrandV1,
  ProductDeliveryV1,
  ProductOfferLinksV1,
  ProductOfferV1,
  ProductRailDeclarationV1,
  ProductRightsV1,
  ProductTelegramDeliveryV1,
  ProductWebDeliveryV1,
} from "./types";
import {
  boundedText,
  deepFreeze,
  enumValue,
  exactKeys,
  fail,
  literal,
  offerId,
  opaqueRef,
  plainArray,
  plainRecord,
  positiveVersion,
  rightsPurpose,
  safeLink,
  telegramBotUsername,
  telegramStartParameter,
} from "./validation";

const PHASE: ProductFlowContractPhase = "offer";

function parseBrand(value: unknown, path: string): ProductBrandV1 {
  const record = plainRecord(value, path, PHASE);
  exactKeys(
    record,
    ["name", "product_name", "byline"],
    ["name", "product_name", "byline"],
    path,
    PHASE,
  );
  return {
    name: boundedText(
      record.name,
      PRODUCT_FLOW_LIMITS.brand_name_chars,
      `${path}.name`,
      PHASE,
    ),
    product_name: boundedText(
      record.product_name,
      PRODUCT_FLOW_LIMITS.product_name_chars,
      `${path}.product_name`,
      PHASE,
    ),
    byline: boundedText(
      record.byline,
      PRODUCT_FLOW_LIMITS.byline_chars,
      `${path}.byline`,
      PHASE,
    ),
  };
}

function parseWebDelivery(value: unknown, path: string): ProductWebDeliveryV1 {
  const record = plainRecord(value, path, PHASE);
  const availability = enumValue(
    record.availability,
    PRODUCT_AVAILABILITIES,
    `${path}.availability`,
    PHASE,
  );
  if (availability === "off") {
    exactKeys(record, ["availability"], ["availability"], path, PHASE);
    return { availability };
  }
  exactKeys(
    record,
    ["availability", "url"],
    ["availability", "url"],
    path,
    PHASE,
  );
  return {
    availability,
    url: safeLink(record.url, `${path}.url`, PHASE),
  };
}

function parseTelegramDelivery(
  value: unknown,
  path: string,
): ProductTelegramDeliveryV1 {
  const record = plainRecord(value, path, PHASE);
  const availability = enumValue(
    record.availability,
    PRODUCT_AVAILABILITIES,
    `${path}.availability`,
    PHASE,
  );
  if (availability === "off") {
    exactKeys(record, ["availability"], ["availability"], path, PHASE);
    return { availability };
  }
  exactKeys(
    record,
    ["availability", "bot_username", "start_parameter"],
    ["availability", "bot_username", "start_parameter"],
    path,
    PHASE,
  );
  return {
    availability,
    bot_username: telegramBotUsername(
      record.bot_username,
      `${path}.bot_username`,
      PHASE,
    ),
    start_parameter: telegramStartParameter(
      record.start_parameter,
      `${path}.start_parameter`,
      PHASE,
    ),
  };
}

function parseDelivery(value: unknown, path: string): ProductDeliveryV1 {
  const record = plainRecord(value, path, PHASE);
  exactKeys(record, ["web", "telegram"], ["web", "telegram"], path, PHASE);
  return {
    web: parseWebDelivery(record.web, `${path}.web`),
    telegram: parseTelegramDelivery(record.telegram, `${path}.telegram`),
  };
}

function parseRailDeclaration(
  value: unknown,
  path: string,
): ProductRailDeclarationV1 {
  const record = plainRecord(value, path, PHASE);
  const rail = enumValue(
    record.rail,
    PRODUCT_PAYMENT_RAILS,
    `${path}.rail`,
    PHASE,
  );
  const expectedChannel = PRODUCT_RAIL_CHANNELS[rail];
  literal(record.channel, expectedChannel, `${path}.channel`, PHASE);
  const availability = enumValue(
    record.availability,
    PRODUCT_AVAILABILITIES,
    `${path}.availability`,
    PHASE,
  );
  if (availability === "off") {
    exactKeys(
      record,
      ["rail", "channel", "availability"],
      ["rail", "channel", "availability"],
      path,
      PHASE,
    );
    return {
      rail,
      channel: expectedChannel,
      availability,
    } as ProductRailDeclarationV1;
  }
  exactKeys(
    record,
    ["rail", "channel", "availability", "price_ref"],
    ["rail", "channel", "availability", "price_ref"],
    path,
    PHASE,
  );
  return {
    rail,
    channel: expectedChannel,
    availability,
    price_ref: opaqueRef(record.price_ref, `${path}.price_ref`, PHASE),
  } as ProductRailDeclarationV1;
}

function parseRails(
  value: unknown,
  path: string,
): readonly ProductRailDeclarationV1[] {
  const input = plainArray(value, path, PHASE);
  if (input.length !== PRODUCT_PAYMENT_RAILS.length) {
    return fail(
      PHASE,
      path,
      "required",
      "Every v1 payment rail must be declared exactly once.",
    );
  }
  const byRail = new Map<string, ProductRailDeclarationV1>();
  input.forEach((entry, index) => {
    const parsed = parseRailDeclaration(entry, `${path}[${index}]`);
    if (byRail.has(parsed.rail)) {
      fail(
        PHASE,
        `${path}[${index}].rail`,
        "duplicate_value",
        "Payment rails may be declared only once.",
      );
    }
    byRail.set(parsed.rail, parsed);
  });
  return PRODUCT_PAYMENT_RAILS.map((rail) => {
    const declaration = byRail.get(rail);
    if (declaration === undefined) {
      return fail(
        PHASE,
        path,
        "required",
        "Every v1 payment rail must be declared exactly once.",
      );
    }
    return declaration;
  });
}

function parseRights(value: unknown, path: string): ProductRightsV1 {
  const record = plainRecord(value, path, PHASE);
  exactKeys(
    record,
    ["purpose", "decision"],
    ["purpose", "decision"],
    path,
    PHASE,
  );
  return {
    purpose: rightsPurpose(record.purpose, `${path}.purpose`, PHASE),
    decision: enumValue(
      record.decision,
      PRODUCT_RIGHTS_DECISIONS,
      `${path}.decision`,
      PHASE,
    ),
  };
}

function parseLinks(value: unknown, path: string): ProductOfferLinksV1 {
  const record = plainRecord(value, path, PHASE);
  exactKeys(
    record,
    ["terms", "support", "methodology"],
    ["terms", "support", "methodology"],
    path,
    PHASE,
  );
  return {
    terms: safeLink(record.terms, `${path}.terms`, PHASE),
    support: safeLink(record.support, `${path}.support`, PHASE),
    methodology: safeLink(record.methodology, `${path}.methodology`, PHASE),
  };
}

function parseFixedNonClaims(
  value: unknown,
  path: string,
): typeof PRODUCT_OFFER_NON_CLAIMS {
  const input = plainArray(value, path, PHASE);
  if (input.length !== PRODUCT_OFFER_NON_CLAIMS.length) {
    return fail(
      PHASE,
      path,
      "cross_contract_mismatch",
      "The complete fixed v1 non-claim set is required.",
    );
  }
  PRODUCT_OFFER_NON_CLAIMS.forEach((claim, index) => {
    literal(input[index], claim, `${path}[${index}]`, PHASE);
  });
  return PRODUCT_OFFER_NON_CLAIMS;
}

function assertAvailability(
  availability: ProductAvailability,
  status: ProductOfferV1["status"],
  environment: ProductOfferV1["environment"],
  path: string,
  kind: "delivery" | "rail",
): void {
  if (
    availability === "live" &&
    (environment !== "production" || status !== "live")
  ) {
    fail(
      PHASE,
      path,
      "cross_contract_mismatch",
      "Live availability requires a live production offer.",
    );
  }
  if (
    availability === "test" &&
    (environment !== "test" ||
      (kind === "rail"
        ? status !== "test"
        : status !== "test" && status !== "preview"))
  ) {
    fail(
      PHASE,
      path,
      "cross_contract_mismatch",
      kind === "rail"
        ? "Test rail availability requires a test offer."
        : "Test delivery requires a preview or test offer.",
    );
  }
}

export function parseProductOfferV1(value: unknown): ProductOfferV1 {
  const record = plainRecord(value, "$", PHASE);
  const keys = [
    "schema",
    "brand",
    "id",
    "version",
    "status",
    "environment",
    "audience",
    "delivery",
    "rails",
    "rights",
    "links",
    "non_claims",
  ] as const;
  exactKeys(record, keys, keys, "$", PHASE);

  const status = enumValue(
    record.status,
    PRODUCT_OFFER_STATUSES,
    "$.status",
    PHASE,
  );
  const environment = enumValue(
    record.environment,
    PRODUCT_ENVIRONMENTS,
    "$.environment",
    PHASE,
  );
  if ((status === "preview" || status === "test") && environment !== "test") {
    fail(
      PHASE,
      "$.environment",
      "cross_contract_mismatch",
      "Preview and test offers must use the test environment.",
    );
  }
  if (status === "live" && environment !== "production") {
    fail(
      PHASE,
      "$.environment",
      "cross_contract_mismatch",
      "Live offers must use the production environment.",
    );
  }

  const delivery = parseDelivery(record.delivery, "$.delivery");
  const rails = parseRails(record.rails, "$.rails");
  const rights = parseRights(record.rights, "$.rights");
  assertAvailability(
    delivery.web.availability,
    status,
    environment,
    "$.delivery.web.availability",
    "delivery",
  );
  assertAvailability(
    delivery.telegram.availability,
    status,
    environment,
    "$.delivery.telegram.availability",
    "delivery",
  );
  rails.forEach((rail, index) => {
    assertAvailability(
      rail.availability,
      status,
      environment,
      `$.rails[${index}].availability`,
      "rail",
    );
    if (rail.availability !== "off") {
      const deliveryAvailability = delivery[rail.channel].availability;
      if (deliveryAvailability !== rail.availability) {
        fail(
          PHASE,
          `$.rails[${index}].availability`,
          "cross_contract_mismatch",
          "An active rail requires matching delivery-channel availability.",
        );
      }
    }
  });
  if (status === "live" && rights.decision !== "granted") {
    fail(
      PHASE,
      "$.rights.decision",
      "cross_contract_mismatch",
      "A live offer requires an explicit granted rights decision.",
    );
  }

  return deepFreeze({
    schema: literal(record.schema, PRODUCT_OFFER_SCHEMA, "$.schema", PHASE),
    brand: parseBrand(record.brand, "$.brand"),
    id: offerId(record.id, "$.id", PHASE),
    version: positiveVersion(record.version, "$.version", PHASE),
    status,
    environment,
    audience: boundedText(
      record.audience,
      PRODUCT_FLOW_LIMITS.audience_chars,
      "$.audience",
      PHASE,
    ),
    delivery,
    rails,
    rights,
    links: parseLinks(record.links, "$.links"),
    non_claims: parseFixedNonClaims(record.non_claims, "$.non_claims"),
  });
}
