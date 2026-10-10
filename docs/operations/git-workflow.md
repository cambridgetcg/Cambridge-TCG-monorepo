# Git work: current, preserved and pending

Sharing a Git directory does not mean every branch is merged. A commit does not
mean its code was tested. Use clear labels:

| Label | Meaning | Next action |
| --- | --- | --- |
| Current | Chosen branch for active development | Check upstream and local changes |
| Merged | Branch head is an ancestor of the current base | Retain as needed; removal is separate |
| Preserved checkpoint | Local files recorded on a branch/tag | Review, test and port before integration |
| Pending integration | Commits or patches remain outside the current base | Review against current product decisions |
| Remote snapshot | Cached remote-tracking ref | Fetch before claiming freshness; report failures |

## Start and finish a change

    git status --short --branch
    git worktree list
    git log --oneline -5

Inspect changes before staging explicit paths. Keep unrelated edits out of the
commit. Explain the request, change and checks; attribute actual contributors.
A preservation-only commit must say its inherited implementation remains
unreviewed or untested.

Use a separate branch/worktree for uncertain integration. Do not force-reset,
squash, rebase or merge unrelated histories just to make the graph look tidy.
Equivalent patches and shared ancestry are different tests. Current commerce
retirement takes precedence over old launch plans when reviewing changes.

## Read integration state

    git branch --merged main
    git log --oneline main..BRANCH
    git diff --stat main...BRANCH
    git cherry main BRANCH

git cherry compares non-merge patches; it does not prove behavior, compatibility
or coverage. Inspect merge commits separately. A tag marks a commit, not later
uncommitted files or ignored credentials. Never print historical credential
files during review.

## Local workspace records

The optional ignored HERE.md links to the local worktree/branch inventory and
recovery records. Keep machine paths and private incident records out of this
shared guide. Refresh inventories after branch/commit changes; dated records
are evidence of that check only.

Publish only with explicit authorization. Local commits, remote-tracking refs,
pushes and deployments are separate events. Redacting a working file does not
erase earlier Git objects or revoke a credential.
