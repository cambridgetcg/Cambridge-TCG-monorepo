#!/bin/sh
# Vercel "Ignored Build Step" for apps/rewardspro (Vercel runs it in this
# directory). Exit 0 skips the deployment; exit 1 builds.
#
# Builds only when this app, or a root file that changes how it installs,
# changed since the last successful deployment. Vercel clones 10 commits
# deep, so after a run of skipped commits that deployment's commit can be
# missing from the clone. On production, every earlier push to main had this
# check when it landed, so the script then compares with the oldest commit
# the clone holds; that also covers a push of several commits. Anything else
# uncertain (a preview's first push, a clone of one commit) builds.
set -u

base="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$base" ] || ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
  oldest="$(git rev-list --first-parent HEAD | tail -n 1)"
  if [ "${VERCEL_ENV:-}" != production ] || [ -z "$oldest" ] || [ "$oldest" = "$(git rev-parse HEAD)" ]; then
    echo "No previous deployment commit to compare with: building"
    exit 1
  fi
  echo "Previous deployment commit not in this clone: comparing with the oldest commit it holds"
  base="$oldest"
fi

if git diff --quiet "$base" HEAD -- . \
  ../../package.json ../../pnpm-lock.yaml ../../pnpm-workspace.yaml ../../.npmrc; then
  echo "No changes to apps/rewardspro or workspace install files since ${base}: skipping"
  exit 0
fi

echo "apps/rewardspro or workspace install files changed since ${base}: building"
exit 1
