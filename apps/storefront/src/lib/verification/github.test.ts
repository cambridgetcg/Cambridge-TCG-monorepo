import { describe, expect, it } from "vitest";
import {
  GITHUB_CALLBACK_PATH,
  GITHUB_EXPECTED_AUTHORIZATION_ENDPOINT,
  GITHUB_MINIMUM_SCOPES,
  GITHUB_OAUTH_APP_CREDENTIAL_KIND,
  GITHUB_OAUTH_APP_CREDENTIAL_NAMES,
  GITHUB_OFFICIAL_SETUP_URLS,
  GITHUB_PRODUCTION_ALIASES,
  GITHUB_PRODUCTION_ORIGIN,
  GITHUB_VERIFICATION_DESCRIPTOR,
  createGitHubVerificationDescriptor,
  githubCallbackUrl,
  validateGitHubJourneyBase,
  validateGitHubVerificationBase,
} from "./github";

describe("GitHub verification descriptor", () => {
  it("declares an OAuth App with the runtime credential names and minimum scopes", () => {
    expect(GITHUB_VERIFICATION_DESCRIPTOR).toMatchObject({
      provider: "github",
      credentialKind: GITHUB_OAUTH_APP_CREDENTIAL_KIND,
      callbackPath: GITHUB_CALLBACK_PATH,
      expectedAuthorizationEndpoint: GITHUB_EXPECTED_AUTHORIZATION_ENDPOINT,
    });
    expect(GITHUB_OAUTH_APP_CREDENTIAL_NAMES).toEqual([
      "AUTH_GITHUB_ID",
      "AUTH_GITHUB_SECRET",
    ]);
    expect(GITHUB_MINIMUM_SCOPES).toEqual(["read:user", "user:email"]);
    expect(GITHUB_VERIFICATION_DESCRIPTOR.disallowedCredentialKinds).toEqual([
      "github_app",
      "private_key",
    ]);
    expect(GITHUB_OFFICIAL_SETUP_URLS.every((url) => url.startsWith("https://"))).toBe(true);
  });

  it("keeps ordinary-gh-inaccessible configuration operator-declared", () => {
    expect(GITHUB_VERIFICATION_DESCRIPTOR.operatorDeclarations).toEqual([
      { claim: "oauth_app_kind", evidence: "operator_declared", ordinaryGhIntrospectable: false },
      { claim: "client_id_secret_pair", evidence: "operator_declared", ordinaryGhIntrospectable: false },
      { claim: "registered_callback", evidence: "operator_declared", ordinaryGhIntrospectable: false },
    ]);
  });

  it("reserves production for non-interactive verification", () => {
    const production = GITHUB_VERIFICATION_DESCRIPTOR.origins[0];
    expect(production).toEqual({
      environment: "production",
      origin: GITHUB_PRODUCTION_ORIGIN,
      source: "primary",
      journey: "forbidden",
    });
    expect(githubCallbackUrl(production)).toBe(
      "https://cambridgetcg.com/api/auth/callback/github",
    );
  });

  it("admits journeys only for an explicitly dedicated, confirmed staging preview", () => {
    const descriptor = createGitHubVerificationDescriptor({
      productionAliases: ["https://cambridgetcg.vercel.app"],
      staging: {
        origin: "https://staging.example.test:8443",
        dedicatedTestData: true,
        previewDeploymentConfirmed: true,
      },
    });
    const staging = validateGitHubJourneyBase(
      descriptor,
      "https://staging.example.test:8443",
    );

    expect(staging).toEqual({
      environment: "staging",
      origin: "https://staging.example.test:8443",
      source: "preview",
      journey: "allowed",
      dedicatedTestData: true,
      previewDeploymentConfirmed: true,
    });
    expect(staging && githubCallbackUrl(staging)).toBe(
      "https://staging.example.test:8443/api/auth/callback/github",
    );
    expect(validateGitHubVerificationBase(
      descriptor,
      "production",
      "https://staging.example.test:8443",
    )).toBeNull();
    expect(validateGitHubJourneyBase(descriptor, GITHUB_PRODUCTION_ORIGIN)).toBeNull();
    expect(validateGitHubJourneyBase(descriptor, GITHUB_PRODUCTION_ALIASES[0])).toBeNull();
    expect(validateGitHubJourneyBase(descriptor, "https://cambridgetcg.vercel.app")).toBeNull();
    expect(validateGitHubVerificationBase(
      descriptor,
      "staging",
      "https://staging.example.test:8443/api/auth/callback/github",
    )).toBeNull();
  });

  it.each([
    "https://staging.example.test/",
    "https://staging.example.test/path",
    "https://user:pass@staging.example.test",
    "http://staging.example.test",
    GITHUB_PRODUCTION_ORIGIN,
    GITHUB_PRODUCTION_ALIASES[0],
  ])("rejects unsafe or production staging origins %s", (origin) => {
    expect(() => createGitHubVerificationDescriptor({
      staging: { origin, dedicatedTestData: true, previewDeploymentConfirmed: true },
    })).toThrow();
  });

  it("requires both staging fixture declarations and rejects duplicate aliases", () => {
    expect(() => createGitHubVerificationDescriptor({
      staging: { origin: "https://staging.example.test", dedicatedTestData: false, previewDeploymentConfirmed: true } as never,
    })).toThrow();
    expect(() => createGitHubVerificationDescriptor({
      staging: { origin: "https://staging.example.test", dedicatedTestData: true, previewDeploymentConfirmed: false } as never,
    })).toThrow();
    expect(() => createGitHubVerificationDescriptor({
      productionAliases: [GITHUB_PRODUCTION_ORIGIN],
    })).toThrow();
  });
});
