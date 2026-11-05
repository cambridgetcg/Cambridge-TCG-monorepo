#!/bin/sh
# Vercel "Ignored Build Step" for apps/rewards (Vercel runs it in this
# directory). Exit 0 skips the deployment; exit 1 builds.
#
# Builds only when this app, or a root file that changes how it installs,
# changed since the last successful deployment. Vercel clones 10 commits
# deep, so after a run of skipped commits that deployment's commit can be
# missing from the clone; the script then fetches it (the repo is public).
#
# If that fetch fails on production and this commit is a merge (how PRs land
# on main), the script compares with the oldest commit the clone holds, which
# covers the last 9 merges. On that path an app change whose production build
# failed is forgotten 9 merges later; redeploy it from Vercel. A commit that
# is not a merge builds, because a push of 10 or more commits can hide an app
# change in its first commits. Anything else uncertain (no previous
# deployment, a preview, a clone of one commit) builds.
set -u

base="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$base" ]; then
  echo "No previous deployment commit to compare with: building"
  exit 1
fi

if ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
  echo "Previous deployment commit ${base} is not in this clone: fetching it"
  GIT_TERMINAL_PROMPT=0 git fetch --quiet --no-tags --depth=1 origin "$base" 2>/dev/null
fi

if ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
  if [ "${VERCEL_ENV:-}" != production ] || ! git rev-parse -q --verify "HEAD^2" >/dev/null; then
    echo "Could not fetch the previous deployment commit: building"
    exit 1
  fi
  base="$(git rev-list --first-parent HEAD | tail -n 1)"
  echo "Could not fetch the previous deployment commit: comparing with the oldest commit in this clone"
fi

if git diff --quiet "$base" HEAD -- . \
  ../../package.json ../../pnpm-lock.yaml ../../pnpm-workspace.yaml ../../.npmrc; then
  echo "No changes to apps/rewards or workspace install files since ${base}: skipping"
  exit 0
fi

echo "apps/rewards or workspace install files changed since ${base}: building"
exit 1
