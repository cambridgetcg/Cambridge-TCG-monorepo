import GitHub from "next-auth/providers/github";

// This in-process brand cannot arrive in GitHub's JSON. Auth.js passes the raw
// userinfo object directly to signIn; it is not a client claim or stored proof.
const VERIFIED_EMAIL_SOURCE = Symbol("authenticated-github-email-list");
const VERIFICATION_FIELD = "ctcgVerifiedGitHubEmail";

interface GitHubEnv {
  AUTH_GITHUB_ID?: string;
  AUTH_GITHUB_SECRET?: string;
}

interface VerifiedGitHubIdentity {
  providerAccountId: string;
  email: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  const [local, domain] = email.split("@");
  if (
    email.length > 254 || !local || local.length > 64 || !domain
    || local.startsWith(".") || local.endsWith(".") || local.includes("..")
    || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(email)
    || domain.split(".").some((label) => label.length > 63)
  ) return null;
  return email;
}

function stableId(value: unknown): string | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? String(value)
    : null;
}

/** Only the authenticated email list can establish an email for linking. */
function verifiedEmail(emails: unknown): string | null {
  if (!Array.isArray(emails) || emails.length === 0) return null;
  const candidates: Array<{ email: string; primary: boolean }> = [];
  for (const entry of emails) {
    if (
      !record(entry) || typeof entry.primary !== "boolean"
      || typeof entry.verified !== "boolean"
    ) return null;
    const email = normalizedEmail(entry.email);
    if (!email) return null;
    if (entry.verified) candidates.push({ email, primary: entry.primary });
  }
  return (candidates.find((entry) => entry.primary) ?? candidates[0])?.email ?? null;
}

/**
 * Fetch both endpoints even when /user contains a public email. Keep the bearer
 * ephemeral, do not cache identity responses, and never expose upstream errors.
 */
export async function fetchVerifiedGitHubProfile(
  accessToken: string | undefined,
): Promise<Record<string, unknown>> {
  try {
    if (!accessToken?.trim()) throw new Error();
    const options: RequestInit = {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "cambridgetcg-auth",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    };
    const [userResponse, emailResponse] = await Promise.all([
      fetch("https://api.github.com/user", options),
      fetch("https://api.github.com/user/emails", options),
    ]);
    if (!userResponse.ok || !emailResponse.ok) throw new Error();
    const [profile, emails]: unknown[] = await Promise.all([
      userResponse.json(), emailResponse.json(),
    ]);
    if (!record(profile)) throw new Error();
    const providerAccountId = stableId(profile.id);
    const email = verifiedEmail(emails);
    if (!providerAccountId || !email) throw new Error();

    // Overwrite any same-named upstream field. Carry only display information,
    // numeric identity, and our freshly established email into the raw profile.
    return {
      id: profile.id,
      login: typeof profile.login === "string" ? profile.login : null,
      name: typeof profile.name === "string" ? profile.name : null,
      avatar_url: typeof profile.avatar_url === "string" ? profile.avatar_url : null,
      email,
      [VERIFICATION_FIELD]: {
        source: VERIFIED_EMAIL_SOURCE,
        providerAccountId,
        email,
      },
    };
  } catch {
    throw new Error("GitHub identity verification failed");
  }
}

/** Validate against the raw OAuth profile, never an already-linked user.email. */
export function getVerifiedGitHubIdentity(
  profile: unknown,
  providerAccountId: unknown,
): VerifiedGitHubIdentity | null {
  if (!record(profile)) return null;
  const marker = profile[VERIFICATION_FIELD];
  const id = stableId(profile.id);
  const email = normalizedEmail(profile.email);
  if (
    !record(marker) || marker.source !== VERIFIED_EMAIL_SOURCE
    || !id || id !== providerAccountId || marker.providerAccountId !== id
    || !email || email !== profile.email || marker.email !== email
  ) return null;
  return { providerAccountId: id, email };
}

/** Unconfigured or whitespace-only credentials leave the provider undiscovered. */
export function createGitHubProvider(env: GitHubEnv = {
  AUTH_GITHUB_ID: process.env.AUTH_GITHUB_ID,
  AUTH_GITHUB_SECRET: process.env.AUTH_GITHUB_SECRET,
}) {
  const clientId = env.AUTH_GITHUB_ID?.trim();
  const clientSecret = env.AUTH_GITHUB_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  return GitHub({
    clientId,
    clientSecret,
    authorization: { params: { scope: "read:user user:email" } },
    checks: ["pkce", "state"],
    userinfo: {
      url: "https://api.github.com/user",
      request: ({ tokens }: { tokens: { access_token?: string } }) =>
        fetchVerifiedGitHubProfile(tokens.access_token),
    },
    profile(profile) {
      const identity = getVerifiedGitHubIdentity(profile, stableId(profile.id));
      if (!identity) throw new Error("GitHub identity verification failed");
      return {
        id: identity.providerAccountId,
        email: identity.email,
        name: profile.name ?? profile.login,
        image: profile.avatar_url,
      };
    },
    // Safe only with the verified userinfo/profile boundary AND callback check.
    allowDangerousEmailAccountLinking: true,
    // Auth.js calls this after userinfo, retaining its own provider/id defaults.
    // GitHub is a sign-in door, not ongoing API access: persist no token fields.
    account: () => ({}),
  });
}
