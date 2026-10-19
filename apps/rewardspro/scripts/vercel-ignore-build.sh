#!/bin/sh
# Vercel "Ignored Build Step" for apps/rewardspro (Vercel runs it in this
# directory). Exit 0 skips the deployment; exit 1 builds.
#
# Builds only when this app, or a root file that changes how it installs,
# changed since the last successful deployment. Anything uncertain (first
# deployment, previous commit missing from Vercel's shallow clone) builds.
set -u

base="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$base" ] || ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
  echo "No previous deployment commit to compare with: building"
  exit 1
fi

if git diff --quiet "$base" HEAD -- . \
  ../../package.json ../../pnpm-lock.yaml ../../pnpm-workspace.yaml ../../.npmrc; then
  echo "No changes to apps/rewardspro or workspace install files since ${base}: skipping"
  exit 0
fi

echo "apps/rewardspro or workspace install files changed since ${base}: building"
exit 1
