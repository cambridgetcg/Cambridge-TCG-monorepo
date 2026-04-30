/**
 * Vercel REST API client — minimal wrapper used by the admin /system/deploys
 * page and by `redeployFromMain` server action.
 *
 * Authentication: a Vercel team-scoped token in env var VERCEL_TOKEN.
 * The token must have read access to deployments and write access to
 * trigger new deploys. Generated at vercel.com/account/tokens, scoped to
 * the cambridgetcgs-projects team.
 *
 * No retries, no backoff — the admin page can re-render on demand.
 */

const TEAM_ID = "team_HR4tb4WB0KZsKxqroSCTQrof";
const MONOREPO_REPO_ID = 1223740492; // cambridgetcg/Cambridge-TCG-monorepo

export interface VercelProject {
  /** Slug used in admin sidebar links and as a stable identifier. */
  key: "admin" | "storefront" | "wholesale";
  /** Display name shown to humans. */
  name: string;
  /** Vercel project id (prj_…). */
  projectId: string;
  /** Custom domain that fronts production deploys. */
  domain: string;
  /** Path inside the monorepo, used for "last touch" git lookups. */
  appPath: string;
}

export const PROJECTS: VercelProject[] = [
  {
    key: "admin",
    name: "cambridgetcg-admin",
    projectId: "prj_NGfGodqkx5LCMA6XoeShCAeZZm6u",
    domain: "admin.cambridgetcg.com",
    appPath: "apps/admin",
  },
  {
    key: "storefront",
    name: "cambridgetcg-storefront",
    projectId: "prj_zCHRH4oj7PVh6oXtyNFXF8yrQdRD",
    domain: "cambridgetcg.com",
    appPath: "apps/storefront",
  },
  {
    key: "wholesale",
    name: "tcg-wholesale",
    projectId: "prj_t4pr1FszCa87GWAIgQXTbyXED8qr",
    domain: "wholesaletcgdirect.com",
    appPath: "apps/wholesale",
  },
];

export interface Deployment {
  uid: string;
  url: string;
  /** READY | BUILDING | ERROR | INITIALIZING | QUEUED | CANCELED */
  readyState: string;
  /** ms since epoch */
  created: number;
  meta?: {
    githubCommitSha?: string;
    githubCommitMessage?: string;
    githubCommitAuthorName?: string;
    githubCommitAuthorLogin?: string;
    githubCommitRef?: string;
  };
  errorMessage?: string | null;
  errorCode?: string | null;
}

export class VercelTokenMissingError extends Error {
  constructor() {
    super("VERCEL_TOKEN is not set; deploy admin page is read-only-disabled.");
  }
}

/**
 * Thrown when Vercel rejects the token — typically because the value
 * stored in env was a Vercel CLI auth token (`vca_…`) which the CLI
 * rotates automatically. The admin page catches this and renders a
 * specific banner pointing at the runbook.
 */
export class VercelTokenInvalidError extends Error {
  constructor() {
    super(
      "VERCEL_TOKEN was rejected by the API (likely rotated). Generate a " +
      "long-lived token at https://vercel.com/account/tokens and update " +
      "the value in apps/admin/.env.local AND the cambridgetcg-admin " +
      "Vercel project env AND the GitHub repo secret.",
    );
  }
}

function token(): string {
  const t = process.env.VERCEL_TOKEN?.trim();
  if (!t) throw new VercelTokenMissingError();
  return t;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const url = `https://api.vercel.com${path}${sep}teamId=${TEAM_ID}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    // Always fresh — the admin page wants live state, not cached.
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Vercel returns 403 with `invalidToken: true` when the token has
    // been rotated/revoked — extremely common with CLI tokens (vca_…)
    // which the CLI rotates automatically. Detect specifically so the
    // caller can render an actionable error.
    if (res.status === 403 && /invalidToken/i.test(body)) {
      throw new VercelTokenInvalidError();
    }
    throw new Error(`Vercel API ${res.status} on ${path}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/**
 * Latest production deployment for a project.
 * Returns null if no deployments exist.
 */
export async function latestProduction(projectId: string): Promise<Deployment | null> {
  const data = await api<{ deployments: Deployment[] }>(
    `/v6/deployments?projectId=${projectId}&limit=1&target=production`,
  );
  return data.deployments[0] ?? null;
}

/**
 * Trigger a new production deployment from a given git SHA on main.
 * Uses the gitSource API path — Vercel pulls from GitHub itself, no upload.
 */
export async function deployFromGit(args: {
  projectName: string;
  sha: string;
  ref?: string;
}): Promise<{ id: string; url: string }> {
  const { projectName, sha, ref = "main" } = args;
  const body = {
    name: projectName,
    target: "production" as const,
    gitSource: {
      type: "github" as const,
      repoId: MONOREPO_REPO_ID,
      ref,
      sha,
    },
    projectSettings: {},
  };
  const dep = await api<{ id: string; url: string }>(
    `/v13/deployments?forceNew=1&skipAutoDetectionConfirmation=1`,
    { method: "POST", body: JSON.stringify(body) },
  );
  return dep;
}

/** Convenience: probes a domain via HEAD for HTTP status. */
export async function probeDomain(domain: string): Promise<{ status: number; ok: boolean }> {
  try {
    const res = await fetch(`https://${domain}/`, {
      method: "HEAD",
      cache: "no-store",
      // 8s timeout — domain probes shouldn't block the page render
      signal: AbortSignal.timeout(8000),
    });
    return { status: res.status, ok: res.status < 500 };
  } catch {
    return { status: 0, ok: false };
  }
}
