import {
  isNormalizedVerificationOrigin,
  type VerificationCheckName,
  type VerificationEnvironment,
  type VerificationEvidenceKind,
  type VerificationOrigin,
  type VerificationScenario,
  type VerificationScope,
} from "./contract";

export const GITHUB_PROVIDER_ID = "github" as const;
export const GITHUB_OAUTH_APP_CREDENTIAL_KIND = "oauth_app" as const;
export const GITHUB_OAUTH_APP_CREDENTIAL_NAMES = Object.freeze([
  "AUTH_GITHUB_ID",
  "AUTH_GITHUB_SECRET",
] as const);
export const GITHUB_MINIMUM_SCOPES = Object.freeze([
  "read:user",
  "user:email",
] as const);
export const GITHUB_CALLBACK_PATH = "/api/auth/callback/github" as const;
export const GITHUB_EXPECTED_AUTHORIZATION_ENDPOINT =
  "https://github.com/login/oauth/authorize" as const;
export const GITHUB_PRODUCTION_ORIGIN = "https://cambridgetcg.com" as const;
/** A canonical production alias, never a staging fixture. */
export const GITHUB_PRODUCTION_ALIASES = Object.freeze([
  "https://www.cambridgetcg.com",
] as const);

/** Official GitHub pages; these are setup references, not receipt evidence. */
export const GITHUB_OFFICIAL_SETUP_URLS = Object.freeze([
  "https://github.com/settings/applications/new",
  "https://github.com/settings/developers",
  "https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app",
  "https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps",
] as const);

export type GitHubCredentialRole = "client_id" | "client_secret";
export type GitHubCredentialStorage = "deployment_environment";
export type GitHubJourneyPermission = "allowed" | "forbidden";
export type GitHubAuthorizedEffect =
  | "test_account_provider_link"
  | "test_account_session"
  | "test_account_logout";
export type GitHubHumanOnlyStep = "provider_login" | "mfa" | "captcha" | "consent";

export interface GitHubCredentialDeclaration {
  readonly name: (typeof GITHUB_OAUTH_APP_CREDENTIAL_NAMES)[number];
  readonly kind: typeof GITHUB_OAUTH_APP_CREDENTIAL_KIND;
  readonly role: GitHubCredentialRole;
  readonly storage: GitHubCredentialStorage;
}

export interface GitHubProductionOrigin {
  readonly environment: "production";
  readonly origin: VerificationOrigin;
  readonly source: "primary" | "alias";
  /** Production browser journeys are intentionally excluded from this pilot. */
  readonly journey: "forbidden";
}

export interface GitHubStagingOrigin {
  readonly environment: "staging";
  readonly origin: VerificationOrigin;
  readonly source: "preview";
  readonly journey: "allowed";
  /** The fixture explicitly asserts this is not customer data. */
  readonly dedicatedTestData: true;
  /** Deployment metadata has explicitly confirmed a preview target. */
  readonly previewDeploymentConfirmed: true;
}

export type GitHubApprovedOrigin = GitHubProductionOrigin | GitHubStagingOrigin;

export interface GitHubVerificationCheckDeclaration {
  readonly name: VerificationCheckName;
  readonly scope: VerificationScope;
  readonly required: boolean;
  readonly permittedEvidence: readonly VerificationEvidenceKind[];
}

export interface GitHubVerificationScenarioDeclaration {
  readonly name: VerificationScenario;
  readonly scope: VerificationScope;
  readonly authorizedEffects: readonly GitHubAuthorizedEffect[];
  readonly humanOnlySteps: readonly GitHubHumanOnlyStep[];
  readonly positiveLoginEvidence: boolean;
}

export interface GitHubOperatorDeclaration {
  readonly claim: "oauth_app_kind" | "client_id_secret_pair" | "registered_callback";
  readonly evidence: "operator_declared";
  readonly ordinaryGhIntrospectable: false;
}

export interface GitHubVerificationDescriptor {
  readonly provider: typeof GITHUB_PROVIDER_ID;
  readonly credentialKind: typeof GITHUB_OAUTH_APP_CREDENTIAL_KIND;
  readonly disallowedCredentialKinds: readonly ["github_app", "private_key"];
  readonly credentials: readonly GitHubCredentialDeclaration[];
  readonly minimumScopes: typeof GITHUB_MINIMUM_SCOPES;
  readonly callbackPath: typeof GITHUB_CALLBACK_PATH;
  readonly expectedAuthorizationEndpoint: typeof GITHUB_EXPECTED_AUTHORIZATION_ENDPOINT;
  readonly officialSetupUrls: typeof GITHUB_OFFICIAL_SETUP_URLS;
  readonly origins: readonly GitHubApprovedOrigin[];
  readonly operatorDeclarations: readonly GitHubOperatorDeclaration[];
  readonly checks: readonly GitHubVerificationCheckDeclaration[];
  readonly scenarios: readonly GitHubVerificationScenarioDeclaration[];
}

function freezeProductionOrigin(
  origin: VerificationOrigin,
  source: GitHubProductionOrigin["source"],
): GitHubProductionOrigin {
  return Object.freeze({ environment: "production", origin, source, journey: "forbidden" });
}

function freezeStagingOrigin(origin: VerificationOrigin): GitHubStagingOrigin {
  return Object.freeze({
    environment: "staging",
    origin,
    source: "preview",
    journey: "allowed",
    dedicatedTestData: true,
    previewDeploymentConfirmed: true,
  });
}

const GITHUB_CREDENTIALS = Object.freeze([
  Object.freeze({
    name: "AUTH_GITHUB_ID" as const,
    kind: GITHUB_OAUTH_APP_CREDENTIAL_KIND,
    role: "client_id" as const,
    storage: "deployment_environment" as const,
  }),
  Object.freeze({
    name: "AUTH_GITHUB_SECRET" as const,
    kind: GITHUB_OAUTH_APP_CREDENTIAL_KIND,
    role: "client_secret" as const,
    storage: "deployment_environment" as const,
  }),
] as const);

const GITHUB_OPERATOR_DECLARATIONS = Object.freeze([
  Object.freeze({
    claim: "oauth_app_kind" as const,
    evidence: "operator_declared" as const,
    ordinaryGhIntrospectable: false as const,
  }),
  Object.freeze({
    claim: "client_id_secret_pair" as const,
    evidence: "operator_declared" as const,
    ordinaryGhIntrospectable: false as const,
  }),
  Object.freeze({
    claim: "registered_callback" as const,
    evidence: "operator_declared" as const,
    ordinaryGhIntrospectable: false as const,
  }),
] as const);

const GITHUB_CHECKS = Object.freeze([
  Object.freeze({ name: "configuration" as const, scope: "preflight" as const, required: true, permittedEvidence: ["operator_declared"] as const }),
  Object.freeze({ name: "provider_discovery" as const, scope: "preflight" as const, required: true, permittedEvidence: ["live_observed", "mocked"] as const }),
  Object.freeze({ name: "requested_scopes" as const, scope: "preflight" as const, required: true, permittedEvidence: ["live_observed", "mocked"] as const }),
  Object.freeze({ name: "authorization_request" as const, scope: "preflight" as const, required: true, permittedEvidence: ["live_observed", "mocked"] as const }),
  Object.freeze({ name: "deployment_identity" as const, scope: "preflight" as const, required: true, permittedEvidence: ["live_observed", "operator_declared"] as const }),
  Object.freeze({ name: "operator_declaration" as const, scope: "preflight" as const, required: true, permittedEvidence: ["operator_declared"] as const }),
  Object.freeze({ name: "deployment_identity" as const, scope: "journey" as const, required: true, permittedEvidence: ["live_observed"] as const }),
  Object.freeze({ name: "anonymous_baseline" as const, scope: "journey" as const, required: true, permittedEvidence: ["live_observed", "mocked"] as const }),
  Object.freeze({ name: "provider_callback" as const, scope: "journey" as const, required: true, permittedEvidence: ["live_observed", "mocked"] as const }),
  Object.freeze({ name: "expected_denial" as const, scope: "journey" as const, required: true, permittedEvidence: ["live_observed", "mocked"] as const }),
  Object.freeze({ name: "identity" as const, scope: "journey" as const, required: true, permittedEvidence: ["live_observed", "mocked"] as const }),
  Object.freeze({ name: "session" as const, scope: "journey" as const, required: true, permittedEvidence: ["live_observed", "mocked"] as const }),
  Object.freeze({ name: "logout" as const, scope: "journey" as const, required: true, permittedEvidence: ["live_observed", "mocked"] as const }),
  Object.freeze({ name: "attempt_explanation" as const, scope: "explain" as const, required: true, permittedEvidence: ["live_observed", "not_observed"] as const }),
] as const);

const GITHUB_SCENARIOS = Object.freeze([
  Object.freeze({
    name: "configuration_review" as const,
    scope: "preflight" as const,
    authorizedEffects: [] as const,
    humanOnlySteps: [] as const,
    positiveLoginEvidence: false,
  }),
  Object.freeze({
    name: "positive_login" as const,
    scope: "journey" as const,
    authorizedEffects: ["test_account_provider_link", "test_account_session", "test_account_logout"] as const,
    humanOnlySteps: ["provider_login", "mfa", "captcha", "consent"] as const,
    positiveLoginEvidence: true,
  }),
  Object.freeze({
    name: "expected_denial" as const,
    scope: "journey" as const,
    authorizedEffects: ["test_account_provider_link", "test_account_session", "test_account_logout"] as const,
    humanOnlySteps: ["provider_login", "mfa", "captcha", "consent"] as const,
    positiveLoginEvidence: false,
  }),
  Object.freeze({
    name: "attempt_explanation" as const,
    scope: "explain" as const,
    authorizedEffects: [] as const,
    humanOnlySteps: [] as const,
    positiveLoginEvidence: false,
  }),
] as const);

function freezeDescriptor(origins: readonly GitHubApprovedOrigin[]): GitHubVerificationDescriptor {
  return Object.freeze({
    provider: GITHUB_PROVIDER_ID,
    credentialKind: GITHUB_OAUTH_APP_CREDENTIAL_KIND,
    disallowedCredentialKinds: Object.freeze(["github_app", "private_key"] as const),
    credentials: GITHUB_CREDENTIALS,
    minimumScopes: GITHUB_MINIMUM_SCOPES,
    callbackPath: GITHUB_CALLBACK_PATH,
    expectedAuthorizationEndpoint: GITHUB_EXPECTED_AUTHORIZATION_ENDPOINT,
    officialSetupUrls: GITHUB_OFFICIAL_SETUP_URLS,
    origins: Object.freeze([...origins]),
    operatorDeclarations: GITHUB_OPERATOR_DECLARATIONS,
    checks: GITHUB_CHECKS,
    scenarios: GITHUB_SCENARIOS,
  });
}

/** Production is known; staging is added only from an explicitly approved fixture. */
export const GITHUB_VERIFICATION_DESCRIPTOR = freezeDescriptor([
  freezeProductionOrigin(GITHUB_PRODUCTION_ORIGIN, "primary"),
  ...GITHUB_PRODUCTION_ALIASES.map((origin) => freezeProductionOrigin(origin, "alias")),
]);

export interface GitHubStagingFixtureOrigin {
  /** A dedicated-test-data staging origin, never inferred from a hostname. */
  readonly origin: string;
  readonly dedicatedTestData: true;
  readonly previewDeploymentConfirmed: true;
}

export interface CreateGitHubVerificationDescriptorOptions {
  /** Explicit production aliases, including a direct production Vercel alias. */
  readonly productionAliases?: readonly string[];
  /** Both fixture assertions are mandatory before a browser journey is allowed. */
  readonly staging?: GitHubStagingFixtureOrigin;
}

function validatedProductionAliases(aliases: readonly string[]): readonly VerificationOrigin[] {
  const all = [GITHUB_PRODUCTION_ORIGIN, ...GITHUB_PRODUCTION_ALIASES, ...aliases];
  if (new Set(all).size !== all.length || !aliases.every(isNormalizedVerificationOrigin)) {
    throw new TypeError("Invalid GitHub verification production alias");
  }
  return aliases;
}

export function createGitHubVerificationDescriptor(
  options: CreateGitHubVerificationDescriptorOptions = {},
): GitHubVerificationDescriptor {
  const aliases = validatedProductionAliases(options.productionAliases ?? []);
  const origins: GitHubApprovedOrigin[] = [
    freezeProductionOrigin(GITHUB_PRODUCTION_ORIGIN, "primary"),
    ...GITHUB_PRODUCTION_ALIASES.map((origin) => freezeProductionOrigin(origin, "alias")),
    ...aliases.map((origin) => freezeProductionOrigin(origin, "alias")),
  ];
  if (options.staging === undefined) return freezeDescriptor(origins);
  if (
    !isNormalizedVerificationOrigin(options.staging.origin)
    || options.staging.dedicatedTestData !== true
    || options.staging.previewDeploymentConfirmed !== true
    || origins.some((origin) => origin.origin === options.staging?.origin)
  ) {
    throw new TypeError("Invalid GitHub verification staging fixture");
  }
  origins.push(freezeStagingOrigin(options.staging.origin));
  return freezeDescriptor(origins);
}

export function githubCallbackUrl(origin: GitHubApprovedOrigin): string {
  if (!isNormalizedVerificationOrigin(origin.origin)) {
    throw new TypeError("Invalid GitHub verification origin");
  }
  return new URL(GITHUB_CALLBACK_PATH, `${origin.origin}/`).toString();
}

/** Validate a CLI base against this descriptor before it can enter a receipt. */
export function validateGitHubVerificationBase(
  descriptor: GitHubVerificationDescriptor,
  environment: VerificationEnvironment,
  base: string,
): GitHubApprovedOrigin | null {
  if (!isNormalizedVerificationOrigin(base)) return null;
  return descriptor.origins.find((origin) =>
    origin.environment === environment && origin.origin === base,
  ) ?? null;
}

/** A journey may use only a fixture-declared preview, never any production alias. */
export function validateGitHubJourneyBase(
  descriptor: GitHubVerificationDescriptor,
  base: string,
): GitHubStagingOrigin | null {
  const origin = validateGitHubVerificationBase(descriptor, "staging", base);
  return origin?.journey === "allowed" ? origin : null;
}
