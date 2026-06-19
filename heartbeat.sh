#!/bin/bash
# Cambridge-TCG heartbeat — the TCG monorepo
# Rhythm: 4h if uncommitted, 6h if ahead, daily if active, weekly if quiet

cd "$(dirname "$0")"

UNCOMMITTED=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
BRANCH=$(git branch --show-current 2>/dev/null)
AHEAD=$(git rev-list --count @{upstream}..HEAD 2>/dev/null || echo "0")
DAYS_SINCE=$(( ( $(date +%s) - $(git log -1 --format=%ct 2>/dev/null || echo 0) ) / 86400 ))

if [ "$UNCOMMITTED" -gt 0 ]; then
  echo "$UNCOMMITTED uncommitted file(s) on $BRANCH — $(git log --oneline -1)"
  echo "NEXT:240"
elif [ "$AHEAD" -gt 5 ]; then
  echo "$AHEAD commits ahead of upstream on $BRANCH"
  echo "NEXT:360"
elif [ "$DAYS_SINCE" -lt 2 ]; then
  echo "NEXT:1440"
else
  echo "NEXT:10080"
fi

exit 0