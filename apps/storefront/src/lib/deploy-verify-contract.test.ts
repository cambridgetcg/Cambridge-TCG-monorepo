import { describe, expect, it } from "vitest";
import { createPrismSignalsAllStripeTestOffer } from "@cambridge-tcg/prism-signals-core/product";
import {
  DELIBERATE_CONTRACTS,
  PRISM_DEPLOYMENT_POSTURES,
  PRISM_PAGE_POSTURE_VARIANTS,
  assessPrismPosture,
  assessResponse,
  expectedFor,
  parseRequiredPrismPosture,
  type DeliberateContract,
  type DeliberateContractDeclaration,
  type ManifestResource,
} from "../../scripts/deploy-verify-contract";

const PRISM_PRICE_REF = `pf_${"A".repeat(43)}` as `pf_${string}`;
const PRISM_PRIVATE_CACHE = "private, no-store, max-age=0";

function resource(path: string): ManifestResource {
  const mutation =
    path === "/api/prism-signals/stripe/checkout" ||
    path === "/api/prism-signals/stripe/portal" ||
    path === "/api/webhooks/stripe/prism-signals";
  return {
    id: `test:${path}`,
    path,
    host:
      path.startsWith("/api/v1/prices") ||
      path.startsWith("/api/v1/ingest-")
        ? "wholesale"
        : "storefront",
    methods: [mutation ? "POST" : "GET"],
    auth:
      path === "/api/webhooks/stripe/prism-signals"
        ? "provider-signature"
        : mutation
          ? "user"
          : "public",
  };
}

function alternatives(
  declaration: DeliberateContractDeclaration,
): readonly DeliberateContract[] {
  return "status" in declaration ? [declaration] : declaration;
}

function prismAllOfferBody(): unknown {
  return createPrismSignalsAllStripeTestOffer({ price_ref: PRISM_PRICE_REF });
}

function jsonResponse(
  body: unknown,
  status: number,
  cacheControl: string,
): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": cacheControl },
  });
}

function bodyFor(contract: DeliberateContract): string {
  if (contract.exactBody?.kind === "json") {
    return JSON.stringify(contract.exactBody.value);
  }
  if (contract.exactBody?.kind === "prism-signals-all-offer-v1") {
    return JSON.stringify(prismAllOfferBody());
  }
  return contract.bodyIncludes.join("\n");
}

function matchingResponse(contract: DeliberateContract): Response {
  return new Response(bodyFor(contract), {
    status: contract.status,
    headers: {
      "Cache-Control":
        contract.exactCacheControl ?? contract.cacheControlIncludes.join(", "),
    },
  });
}

function prismPageResponse(variant: string): Response {
  return new Response(`<p data-prism-stripe-posture="${variant}">PRISM</p>`, {
    status: 200,
    headers: { "Cache-Control": "private, no-store" },
  });
}

const prismPostures = [
  {
    name: "unconfigured",
    stage: "unconfigured",
    offer: () =>
      jsonResponse(
        {
          error: {
            code: "offer_unavailable",
            message: "The PRISM Signals All sandbox offer is not available.",
          },
        },
        503,
        "public, max-age=0, s-maxage=10",
      ),
    webhook: () =>
      jsonResponse(
        {
          error: {
            code: "webhook_unavailable",
            message:
              "The PRISM Signals Stripe webhook could not be durably processed.",
          },
        },
        503,
        PRISM_PRIVATE_CACHE,
      ),
    page: () => prismPageResponse("unconfigured"),
  },
  {
    name: "configured, processing paused",
    stage: "configured-paused",
    offer: () =>
      jsonResponse(
        prismAllOfferBody(),
        200,
        "public, max-age=0, s-maxage=60",
      ),
    webhook: () =>
      jsonResponse(
        {
          error: {
            code: "webhook_processing_paused",
            message: "PRISM Signals Stripe webhook processing is paused.",
          },
        },
        503,
        PRISM_PRIVATE_CACHE,
      ),
    page: () => prismPageResponse("configured-paused"),
  },
  {
    name: "processing on, intake off",
    stage: "processing-only",
    offer: () =>
      jsonResponse(
        prismAllOfferBody(),
        200,
        "public, max-age=0, s-maxage=60",
      ),
    webhook: () =>
      jsonResponse(
        {
          error: {
            code: "invalid_signature",
            message: "A valid Stripe webhook signature is required.",
          },
        },
        400,
        PRISM_PRIVATE_CACHE,
      ),
    page: () => prismPageResponse("processing-only"),
  },
  {
    name: "processing on, intake on",
    stage: "intake-enabled",
    offer: () =>
      jsonResponse(
        prismAllOfferBody(),
        200,
        "public, max-age=0, s-maxage=60",
      ),
    webhook: () =>
      jsonResponse(
        {
          error: {
            code: "invalid_signature",
            message: "A valid Stripe webhook signature is required.",
          },
        },
        400,
        PRISM_PRIVATE_CACHE,
      ),
    page: () => prismPageResponse("intake-enabled"),
  },
] as const;

describe("deploy verifier response contracts", () => {
  it("names every deliberate non-2xx or posture-dependent route", () => {
    expect(Object.keys(DELIBERATE_CONTRACTS)).toEqual([
      "/api/v1/coffee",
      "/api/v1/buy-the-kingdom",
      "/data/catalog.jsonl",
      "/api/v1/do-you-remember-me",
      "/api/v1/cards/[sku]/history",
      "/api/v1/sets/[code]/checklist",
      "/api/v1/cards/[sku]/tcgplayer-history",
      "/api/v1/prices",
      "/api/v1/prices/[sku]",
      "/api/v1/ingest-quarantine/[id]",
      "/prism-signals",
      "/api/prism-signals/offers/all",
      "/api/prism-signals/stripe/checkout",
      "/api/prism-signals/stripe/portal",
      "/api/webhooks/stripe/prism-signals",
    ]);
  });

  it("requires every declared alternative to match its own status, body, and cache policy", async () => {
    for (const [path, declaration] of Object.entries(DELIBERATE_CONTRACTS)) {
      const expected = expectedFor(resource(path));
      const declared = alternatives(declaration);
      expect(expected.deliberate).toEqual(declared);

      for (const contract of declared) {
        expect(
          await assessResponse(
            resource(path),
            matchingResponse(contract),
            expected,
          ),
        ).toEqual(
          contract.variant === undefined
            ? { passed: true }
            : { passed: true, variant: contract.variant },
        );

        const genericFailure = new Response("Service Unavailable", {
          status: contract.status,
          headers: {
            "Cache-Control":
              contract.exactCacheControl ??
              contract.cacheControlIncludes.join(", "),
          },
        });
        expect(
          (await assessResponse(resource(path), genericFailure, expected)).passed,
        ).toBe(false);
      }
    }
  });

  it.each(prismPostures)(
    "accepts the exact PRISM HTTP contracts when $name",
    async ({ stage, offer, webhook, page }) => {
      const offerAssessment = await assessResponse(
        resource("/api/prism-signals/offers/all"),
        offer(),
      );
      const webhookAssessment = await assessResponse(
        resource("/api/webhooks/stripe/prism-signals"),
        webhook(),
      );
      const pageAssessment = await assessResponse(
        resource("/prism-signals"),
        page(),
      );

      expect(offerAssessment).toMatchObject({ passed: true });
      expect(webhookAssessment).toMatchObject({ passed: true });
      expect(pageAssessment).toMatchObject({ passed: true });
      expect(
        assessPrismPosture(
          {
            offer: offerAssessment.variant,
            webhook: webhookAssessment.variant,
            page: pageAssessment.variant,
          },
          stage,
        ),
      ).toEqual({ passed: true, stage });
    },
  );

  it("keeps processing-enabled webhook probes identical whether intake is off or on", async () => {
    const intakeOff = prismPostures[2];
    const intakeOn = prismPostures[3];

    expect(await intakeOff.offer().text()).toBe(await intakeOn.offer().text());
    expect(intakeOff.offer().status).toBe(intakeOn.offer().status);
    expect(await intakeOff.webhook().text()).toBe(
      await intakeOn.webhook().text(),
    );
    expect(intakeOff.webhook().status).toBe(intakeOn.webhook().status);
    expect(intakeOff.webhook().headers.get("cache-control")).toBe(
      intakeOn.webhook().headers.get("cache-control"),
    );

    const intakeOffPage = await assessResponse(
      resource("/prism-signals"),
      intakeOff.page(),
    );
    const intakeOnPage = await assessResponse(
      resource("/prism-signals"),
      intakeOn.page(),
    );
    expect(intakeOffPage.variant).toBe("processing-only");
    expect(intakeOnPage.variant).toBe("intake-enabled");
  });

  it("rejects individually valid PRISM variants assembled into impossible mixed postures", () => {
    const mixed = [
      {
        offer: "unconfigured",
        webhook: "configured-processing-paused",
        page: "configured-paused",
      },
      {
        offer: "configured",
        webhook: "unconfigured",
        page: "unconfigured",
      },
      {
        offer: "unconfigured",
        webhook: "processing-enabled-unsigned-probe",
        page: "intake-enabled",
      },
      {
        offer: "configured",
        webhook: "configured-processing-paused",
        page: "intake-enabled",
      },
      {
        offer: "configured",
        webhook: "processing-enabled-unsigned-probe",
      },
    ];

    for (const observation of mixed) {
      const assessment = assessPrismPosture(observation);
      expect(assessment.passed).toBe(false);
      expect(assessment.detail).toContain("incoherent PRISM deployment posture");
    }
  });

  it("rejects every explicit invalid page posture regardless of endpoint switches", () => {
    const invalidPageVariants = PRISM_PAGE_POSTURE_VARIANTS.filter((variant) =>
      variant.startsWith("invalid-"),
    );
    const endpointPairs = [
      { offer: "unconfigured", webhook: "unconfigured" },
      {
        offer: "configured",
        webhook: "configured-processing-paused",
      },
      {
        offer: "configured",
        webhook: "processing-enabled-unsigned-probe",
      },
    ];

    for (const page of invalidPageVariants) {
      for (const endpoints of endpointPairs) {
        expect(assessPrismPosture({ ...endpoints, page })).toEqual(
          expect.objectContaining({ passed: false }),
        );
      }
    }
  });

  it("does not collapse invalid core configuration into legal unconfigured", () => {
    expect(
      assessPrismPosture({
        offer: "unconfigured",
        webhook: "unconfigured",
        page: "invalid-core-configuration",
      }),
    ).toEqual(
      expect.objectContaining({
        passed: false,
        detail: expect.stringContaining("incoherent PRISM deployment posture"),
      }),
    );
    expect(
      assessPrismPosture({
        offer: "unconfigured",
        webhook: "unconfigured",
        page: "unconfigured",
      }),
    ).toEqual({ passed: true, stage: "unconfigured" });
  });

  it("rejects a coherent posture when it is not the explicitly required stage", () => {
    const stages = Object.keys(PRISM_DEPLOYMENT_POSTURES) as Array<
      keyof typeof PRISM_DEPLOYMENT_POSTURES
    >;

    stages.forEach((stage, index) => {
      const wrongStage = stages[(index + 1) % stages.length];
      expect(
        assessPrismPosture(PRISM_DEPLOYMENT_POSTURES[stage], wrongStage),
      ).toEqual({
        passed: false,
        stage,
        detail: `required PRISM posture ${wrongStage}, observed ${stage}`,
      });
    });
  });

  it("parses only one exact optional PRISM posture CLI argument", () => {
    expect(parseRequiredPrismPosture(["--strict"])).toBeUndefined();
    for (const stage of Object.keys(PRISM_DEPLOYMENT_POSTURES)) {
      expect(
        parseRequiredPrismPosture(["--strict", `--prism-posture=${stage}`]),
      ).toBe(stage);
    }
    expect(() => parseRequiredPrismPosture(["--prism-posture"])).toThrow(
      "Supply exactly one",
    );
    expect(() =>
      parseRequiredPrismPosture(["--prism-posture=live"]),
    ).toThrow("Unknown PRISM posture");
    expect(() =>
      parseRequiredPrismPosture([
        "--prism-posture=processing-only",
        "--prism-posture=intake-enabled",
      ]),
    ).toThrow("Supply exactly one");
  });

  it("rejects ambiguous or missing PRISM page posture markers", async () => {
    const both = await assessResponse(
      resource("/prism-signals"),
      new Response(
        '<p data-prism-stripe-posture="processing-only">One</p><p data-prism-stripe-posture="intake-enabled">Two</p>',
        { status: 200 },
      ),
    );
    expect(both.passed).toBe(false);
    expect(both.detail).toContain("body-forbidden");

    const neither = await assessResponse(
      resource("/prism-signals"),
      new Response("PRISM Signals", { status: 200 }),
    );
    expect(neither.passed).toBe(false);
  });

  it("rejects PRISM alternative responses with body, cache, or status drift", async () => {
    const offerPath = resource("/api/prism-signals/offers/all");
    const webhookPath = resource("/api/webhooks/stripe/prism-signals");

    const offerExtraBody = structuredClone(
      prismAllOfferBody(),
    ) as Record<string, unknown>;
    offerExtraBody.live_price = true;
    expect(
      (
        await assessResponse(
          offerPath,
          jsonResponse(
            offerExtraBody,
            200,
            "public, max-age=0, s-maxage=60",
          ),
        )
      ).passed,
    ).toBe(false);
    expect(
      (
        await assessResponse(
          offerPath,
          jsonResponse(
            prismAllOfferBody(),
            200,
            "public, max-age=0, s-maxage=60, stale-if-error=60",
          ),
        )
      ).detail,
    ).toContain("cache-control:exact");
    expect(
      (
        await assessResponse(
          offerPath,
          jsonResponse(
            prismAllOfferBody(),
            201,
            "public, max-age=0, s-maxage=60",
          ),
        )
      ).passed,
    ).toBe(false);

    expect(
      (
        await assessResponse(
          webhookPath,
          jsonResponse(
            {
              error: {
                code: "invalid_signature",
                message: "The Stripe webhook signature did not verify.",
              },
            },
            400,
            PRISM_PRIVATE_CACHE,
          ),
        )
      ).passed,
    ).toBe(false);
    expect(
      (
        await assessResponse(
          webhookPath,
          jsonResponse(
            {
              error: {
                code: "webhook_processing_paused",
                message: "PRISM Signals Stripe webhook processing is paused.",
              },
            },
            503,
            "private, no-store",
          ),
        )
      ).passed,
    ).toBe(false);
    expect(
      (
        await assessResponse(
          webhookPath,
          jsonResponse(
            {
              error: {
                code: "invalid_signature",
                message: "A valid Stripe webhook signature is required.",
              },
            },
            200,
            PRISM_PRIVATE_CACHE,
          ),
        )
      ).passed,
    ).toBe(false);
  });

  it("keeps checkout and portal on one exact 403 contract", async () => {
    for (const path of [
      "/api/prism-signals/stripe/checkout",
      "/api/prism-signals/stripe/portal",
    ]) {
      const expected = expectedFor(resource(path));
      expect(expected.codes).toEqual([403]);
      expect(
        await assessResponse(
          resource(path),
          jsonResponse(
            {
              error: {
                code: "invalid_origin",
                message: "A same-origin browser request is required.",
              },
            },
            403,
            PRISM_PRIVATE_CACHE,
          ),
        ),
      ).toEqual({ passed: true });

      expect(
        (
          await assessResponse(
            resource(path),
            jsonResponse(
              {
                error: {
                  code: "invalid_origin",
                  message: "A same-origin browser request is required.",
                  retryable: true,
                },
              },
              403,
              PRISM_PRIVATE_CACHE,
            ),
          )
        ).passed,
      ).toBe(false);
    }
  });

  it("does not let a parametric 404 replace an exact deliberate contract", async () => {
    const path = "/api/v1/cards/[sku]/history";
    const result = await assessResponse(
      resource(path),
      new Response("Not found", { status: 404 }),
    );

    expect(result).toEqual({
      passed: false,
      detail: "expected 503 (deliberate contract), got 404",
    });
  });

  it("retains the 400/404 fallback for ordinary parametric probes", async () => {
    const result = await assessResponse(
      resource("/api/v1/examples/[id]"),
      new Response("Not found", { status: 404 }),
    );

    expect(result).toEqual({ passed: true });
  });

  it("rejects a deliberate response with the wrong cache policy", async () => {
    const path = "/api/v1/cards/[sku]/history";
    const declaration = DELIBERATE_CONTRACTS[path];
    const contract = alternatives(declaration)[0];
    const result = await assessResponse(
      resource(path),
      new Response(contract.bodyIncludes.join("\n"), {
        status: contract.status,
        headers: { "Cache-Control": "public, max-age=3600" },
      }),
    );

    expect(result.passed).toBe(false);
    expect(result.detail).toContain("cache-control:no-store");
  });

  it("limits expanded status codes to the two PRISM API paths", () => {
    expect(expectedFor(resource("/prism-signals")).codes).toEqual([200]);
    expect(expectedFor(resource("/api/prism-signals/offers/all")).codes).toEqual([
      503,
      200,
    ]);
    expect(
      expectedFor(resource("/api/webhooks/stripe/prism-signals")).codes,
    ).toEqual([503, 400]);

    const ordinaryUser = {
      ...resource("/api/example/user-mutation"),
      methods: ["POST"],
      auth: "user",
    };
    expect(expectedFor(ordinaryUser).codes).not.toContain(403);
    expect(expectedFor(ordinaryUser).codes).not.toContain(503);
    const ordinaryProvider = {
      ...resource("/api/example/provider-callback"),
      methods: ["POST"],
      auth: "provider-signature",
    };
    expect(expectedFor(ordinaryProvider).codes).toEqual([400, 405, 422]);
  });
});
