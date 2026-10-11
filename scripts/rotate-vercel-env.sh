#!/bin/zsh
#
# rotate-vercel-env.sh: put a new secret value from the macOS clipboard into
# an EXISTING Vercel environment variable, stored as Sensitive, on one or more
# projects in team cambridgetcgs-projects.
#
# Owner-run helper for docs/ops-secret-rotation.md. The value travels
# clipboard -> shell variable -> stdin of `vercel env update`. It is never
# echoed, never placed in a process's argv, never written to a file. Output
# shows only a non-secret prefix hint and the value's length.
#
# Offline self-test: scripts/rotate-vercel-env.test.sh

emulate -R zsh
setopt no_xtrace no_verbose
set -euo pipefail
export LC_ALL=C

readonly SCOPE=cambridgetcgs-projects

usage() {
  cat <<'EOF'
usage: scripts/rotate-vercel-env.sh [--dry-run | --clear] NAME TARGET PROJECT [PROJECT...]
       scripts/rotate-vercel-env.sh --names-only NAME TARGET PROJECT [PROJECT...]
       scripts/rotate-vercel-env.sh --help

Copy the new value from the provider first, then run this. It writes the
clipboard's value to the existing env var NAME for TARGET (production or
preview) on each PROJECT in team cambridgetcgs-projects, stored as Sensitive.

  --dry-run     read the clipboard, check the value's shape and that NAME
                exists on each project; write nothing (owner only: it reads
                whatever is on the clipboard)
  --names-only  check only that NAME exists on each project; never reads
                the clipboard (safe for preparation and for agents)
  --clear       empty the clipboard after every project was written
  -h, --help    show this help

Refuses, writing nothing:
  - an empty clipboard
  - a value containing whitespace, this script's name, or a NAME=... prefix
    (the usual sign that the command line, not the secret, was copied last)
  - a URL (anything with ://) unless NAME ends in _URL
  - a value whose shape does not match NAME (Stripe live keys, webhook
    secrets, Postgres URLs, AWS keys, Google OAuth secrets, SendGrid keys,
    wholesale channel keys, 32+ character base64/hex app secrets; 16+
    characters otherwise)
  - ENCRYPTION_SECRET and ENCRYPTION_SALT (they need a re-encryption plan)
Only updates a variable that already exists on the project; never creates one.

Vercel applies env changes to NEW deployments only, so redeploy afterwards.
Clear the clipboard when you are done with a value:  pbcopy </dev/null

Examples:
  scripts/rotate-vercel-env.sh --names-only STRIPE_SECRET_KEY production cambridgetcg-storefront
  scripts/rotate-vercel-env.sh --dry-run STRIPE_SECRET_KEY production cambridgetcg-storefront
  scripts/rotate-vercel-env.sh --clear AWS_SECRET_ACCESS_KEY production cambridgetcg-storefront tcg-wholesale

Exit status: 0 every project written (or checked, with --dry-run or
--names-only); 1 value refused, or any project skipped, missing or failed;
2 usage error; 3 missing macOS clipboard tools or vercel CLI.
EOF
}

die_usage() { print -ru2 -- "✗ $1"; print -ru2 -- "Run with --help for usage."; exit 2; }
refuse() {
  print -ru2 -- "✗ $1; nothing written."
  print -ru2 -- "  Copy the right value and rerun, or clear the clipboard if you stop here: pbcopy </dev/null"
  exit 1
}

# ---- arguments ----------------------------------------------------------
dry_run=0 names_only=0 clear=0
positional=()
for arg in "$@"; do
  case $arg in
    --dry-run) dry_run=1 ;;
    --names-only) names_only=1 ;;
    --clear) clear=1 ;;
    -h|--help) usage; exit 0 ;;
    -*) die_usage "unknown option: $arg" ;;
    *) positional+=("$arg") ;;
  esac
done
(( dry_run + names_only + clear <= 1 )) || die_usage "use at most one of --dry-run, --names-only and --clear"
(( ${#positional} >= 3 )) || die_usage "need NAME, TARGET and at least one PROJECT"
name=$positional[1]
target=$positional[2]
projects=("${(@)positional[3,-1]}")

[[ $name =~ '^[A-Z][A-Z0-9_]*$' ]] || die_usage "NAME must be an env var name like STRIPE_SECRET_KEY"
case $target in
  production|preview) ;;
  *) die_usage "TARGET must be production or preview (Sensitive values are not allowed on development)" ;;
esac
for p in "${projects[@]}"; do
  [[ $p =~ '^[a-z0-9][a-z0-9._-]*$' ]] || die_usage "not a Vercel project name: $p"
done

case $name in
  ENCRYPTION_SECRET|ENCRYPTION_SALT)
    print -ru2 -- "✗ $name encrypts stored data; changing it makes existing ciphertext unreadable."
    print -ru2 -- "  Rotate it only with a re-encryption plan (docs/ops-secret-rotation.md). Nothing written."
    exit 1 ;;
esac

# ---- environment --------------------------------------------------------
if (( ! names_only )); then
  command -v pbpaste >/dev/null 2>&1 || { print -ru2 -- "✗ pbpaste not found: this helper is macOS-only"; exit 3; }
fi
if (( clear )); then
  command -v pbcopy >/dev/null 2>&1 || { print -ru2 -- "✗ pbcopy not found: this helper is macOS-only"; exit 3; }
fi
command -v vercel >/dev/null 2>&1 || { print -ru2 -- "✗ vercel CLI not found on PATH"; exit 3; }

# ---- the value ----------------------------------------------------------
val=
err=

expected_shape() {
  case $name in
    STRIPE_SECRET_KEY)      print -r -- "sk_live_… or rk_live_… (a live secret or restricted key)" ;;
    STRIPE_WEBHOOK_SECRET)  print -r -- "whsec_…" ;;
    *DATABASE_URL)          print -r -- "postgres[ql]://USER:PASSWORD@HOST[:PORT]/DB[?…] with a percent-encoded password" ;;
    AWS_ACCESS_KEY_ID)      print -r -- "AKIA followed by 16 upper-case letters or digits" ;;
    AWS_SECRET_ACCESS_KEY)  print -r -- "40 characters of A-Z a-z 0-9 / +" ;;
    AUTH_SECRET|NEXTAUTH_SECRET|CRON_SECRET) print -r -- "at least 32 characters of A-Z a-z 0-9 + / = _ - (openssl rand -hex 32)" ;;
    AUTH_GOOGLE_SECRET)     print -r -- "GOCSPX-…" ;;
    SENDGRID_API_KEY)       print -r -- "SG.<id>.<secret>" ;;
    WHOLESALE_API_KEY|WHOLESALE_B2B_API_KEY) print -r -- "64 lower-case hex characters (apps/wholesale/tools/gen-api-key.ts)" ;;
    VERCEL_TOKEN)           print -r -- "a long-lived account token, not the CLI's auto-rotated vca_… token" ;;
    *)                      print -r -- "at least 16 printable characters" ;;
  esac
}

db_url_ok() {
  [[ $val =~ '^postgres(ql)?://[^:@/?#]+:[^@/?#]+@[^@/?#:]+(:[0-9]+)?/[^/?#]+([?][^#]*)?$' ]] || return 1
  local rest=${val#*://}
  local userinfo=${rest%%@*}
  local password=${userinfo#*:}
  # Every % in the password must begin a %XX escape, or URL parsers reject it.
  [[ $password =~ '%([^0-9A-Fa-f]|[0-9A-Fa-f][^0-9A-Fa-f]|[0-9A-Fa-f]?$)' ]] && return 1
  return 0
}

shape_ok() {
  [[ $val =~ '^[[:print:]]+$' ]] || return 1
  case $name in
    STRIPE_SECRET_KEY)      [[ $val =~ '^(sk|rk)_live_[A-Za-z0-9]{20,}$' ]] ;;
    STRIPE_WEBHOOK_SECRET)  [[ $val =~ '^whsec_[A-Za-z0-9]{20,}$' ]] ;;
    *DATABASE_URL)          db_url_ok ;;
    AWS_ACCESS_KEY_ID)      [[ $val =~ '^AKIA[A-Z0-9]{16}$' ]] ;;
    AWS_SECRET_ACCESS_KEY)  [[ $val =~ '^[A-Za-z0-9/+]{40}$' ]] ;;
    AUTH_SECRET|NEXTAUTH_SECRET|CRON_SECRET) [[ $val =~ '^[A-Za-z0-9+/=_-]{32,}$' ]] ;;
    AUTH_GOOGLE_SECRET)     [[ $val =~ '^GOCSPX-[A-Za-z0-9_-]{20,}$' ]] ;;
    SENDGRID_API_KEY)       [[ $val =~ '^SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}$' ]] ;;
    WHOLESALE_API_KEY|WHOLESALE_B2B_API_KEY) [[ $val =~ '^[0-9a-f]{64}$' ]] ;;
    VERCEL_TOKEN)           [[ $val != vca_* ]] && (( ${#val} >= 16 )) ;;
    *)                      (( ${#val} >= 16 )) ;;
  esac
}

# A prefix that says what kind of value went in, never any secret material.
hint() {
  case $name in
    STRIPE_SECRET_KEY)     print -r -- "${val[1,8]}…" ;;
    STRIPE_WEBHOOK_SECRET) print -r -- "whsec_…" ;;
    *DATABASE_URL)
      local rest=${val#*://}
      local host=${${rest#*@}%%[:/]*}
      print -r -- "${val%%://*}://…@${host%%.*}.…" ;;
    AWS_ACCESS_KEY_ID)     print -r -- "AKIA…" ;;
    AUTH_GOOGLE_SECRET)    print -r -- "GOCSPX-…" ;;
    SENDGRID_API_KEY)      print -r -- "SG.…" ;;
    *)                     print -r -- "…" ;;
  esac
}

if (( ! names_only )); then
  val=$(pbpaste)   # command substitution drops trailing newlines only
  if [[ -z $val ]]; then
    refuse "the clipboard is empty"
  fi
  case $val in
    *rotate-vercel-env*|*rot.sh*)
      refuse "the clipboard holds this command (${#val} chars), not the secret" ;;
    *[[:space:]]*)
      refuse "the clipboard value contains whitespace (${#val} chars); a secret never does" ;;
  esac
  if [[ $val =~ '^[A-Z][A-Z0-9_]*=' ]]; then
    refuse "the clipboard holds a NAME=value line (${#val} chars); copy only the value"
  fi
  if [[ $val == *://* && $name != *_URL ]]; then
    refuse "the clipboard holds a URL (${#val} chars), but $name is not a *_URL variable"
  fi
  if ! shape_ok; then
    refuse "the clipboard does not look like a $name (${#val} chars; expected $(expected_shape))"
  fi
fi

# ---- write --------------------------------------------------------------
redact_last_line() {
  local text=${1//${(b)val}/[redacted]}
  local -a lines=("${(@f)text}")
  local last=
  local line
  for line in "${lines[@]}"; do [[ -n $line ]] && last=$line; done
  print -r -- "${last[1,200]}"
}

failed=0
for p in "${projects[@]}"; do
  # The plain table carries an 18-character value prefix for non-Sensitive
  # variables. It stays in this variable; only the first column is used.
  if ! listing=$(vercel env ls "$target" --project "$p" --scope "$SCOPE" 2>/dev/null); then
    print -r -- "✗ $p: could not list $target env vars (logged in to the team? project name right?); skipped"
    failed=1; continue
  fi
  names=()
  for line in "${(@f)listing}"; do
    words=(${=line})
    (( ${#words} )) && names+=("$words[1]")
  done
  unset listing
  if (( ! ${names[(Ie)$name]} )); then
    print -r -- "✗ $p: $name ($target) not found; skipped (this helper never creates variables)"
    failed=1; continue
  fi
  if (( names_only )); then
    print -r -- "• $p: $name ($target) exists; clipboard not read"
    continue
  fi
  if (( dry_run )); then
    print -r -- "• $p: $name ($target) exists; shape ok: $(hint) (${#val} chars); dry run, nothing written"
    continue
  fi
  if err=$(printf %s "$val" | vercel env update "$name" "$target" --project "$p" --scope "$SCOPE" --sensitive --yes 2>&1 >/dev/null); then
    print -r -- "✓ $p: $name ($target) updated as Sensitive; shape ok: $(hint) (${#val} chars)"
  else
    print -r -- "✗ $p: $name ($target) update FAILED: $(redact_last_line "$err")"
    failed=1
  fi
done

unset val err
if (( names_only || dry_run )); then
  exit $failed
fi
if (( clear && ! failed )); then
  pbcopy </dev/null
  print -ru2 -- "Clipboard cleared. Next: redeploy each project (env changes reach new deployments only)."
elif (( clear )); then
  print -ru2 -- "Clipboard kept so you can retry the failed project(s); clear it when you stop: pbcopy </dev/null"
else
  print -ru2 -- "Next: redeploy each project (env changes reach new deployments only), then clear the clipboard: pbcopy </dev/null"
fi
exit $failed
