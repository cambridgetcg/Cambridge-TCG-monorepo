"use server";

/**
 * Deploys — server actions.
 *
 * `redeployFromMain` triggers a fresh production deploy of one of the three
 * projects from current main HEAD. Uses Vercel's gitSource API path (no
 * source upload from this server). Logged to admin_actions_log.
 */

import { adminAction, ActionInputError } from "@/lib/actions";
import { PROJECTS, deployFromGit, type VercelProject } from "@/lib/vercel";

export async function redeployFromMain(input: { projectKey: VercelProject["key"] }) {
  return adminAction({
    action: "deploy.redeploy_from_main",
    targetKind: "vercel_project",
    targetId: input.projectKey,
    revalidate: "/system/deploys",
    run: async () => {
      const project = PROJECTS.find((p) => p.key === input.projectKey);
      if (!project) {
        throw new ActionInputError(`Unknown project key: ${input.projectKey}`);
      }

      // Fetch current main HEAD SHA via the GitHub API. We don't use git
      // working-tree state because the admin server doesn't have one.
      const ghToken = process.env.GITHUB_TOKEN;
      if (!ghToken) {
        throw new ActionInputError(
          "GITHUB_TOKEN env var is required to resolve main HEAD. " +
          "Set in apps/admin/.env.local and the Vercel project env.",
        );
      }
      const res = await fetch(
        `https://api.github.com/repos/cambridgetcg/Cambridge-TCG-monorepo/git/ref/heads/main`,
        {
          headers: {
            Authorization: `Bearer ${ghToken}`,
            Accept: "application/vnd.github+json",
          },
          cache: "no-store",
        },
      );
      if (!res.ok) {
        throw new Error(`GitHub API ${res.status} resolving main HEAD`);
      }
      const data = (await res.json()) as { object: { sha: string } };
      const sha = data.object.sha;

      const dep = await deployFromGit({ projectName: project.name, sha });
      return { sha, deployId: dep.id, deployUrl: dep.url };
    },
  });
}
