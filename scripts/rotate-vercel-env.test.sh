#!/bin/zsh
#
# Offline self-test for scripts/rotate-vercel-env.sh.
#
# Puts a fake `pbpaste` and a fake `vercel` first on PATH (the real vercel CLI
# is not on the test PATH at all), so nothing touches the network, Vercel or
# the real clipboard. Every value below is generated at run time and is not a
# credential.
#
#   zsh scripts/rotate-vercel-env.test.sh

emulate -R zsh
set -euo pipefail

here=${0:A:h}
script=$here/rotate-vercel-env.sh
tmp=$(mktemp -d "${TMPDIR:-/tmp}/rotate-vercel-env-test.XXXXXX")
trap 'rm -rf -- "$tmp"' EXIT
shim=$tmp/bin
mkdir -p "$shim" "$tmp/state"

cat >"$shim/pbpaste" <<'EOF'
#!/bin/sh
cat "$FAKE_DIR/clip"
EOF

# Fake vercel: `env ls` prints a table from state/names.<project>;
# `env update` stores stdin in state/stdin.<project>.<NAME> and logs the call.
# argv of every call is appended to state/argv.log so the test can prove the
# value never appears there.
cat >"$shim/vercel" <<'EOF'
#!/bin/sh
printf '%s\n' "$*" >>"$FAKE_DIR/argv.log"
project=
prev=
for a in "$@"; do
  [ "$prev" = "--project" ] && project=$a
  prev=$a
done
case "$1 $2" in
  "env ls")
    [ -f "$FAKE_DIR/ls_fails" ] && { echo "Error: not authorized" >&2; exit 1; }
    echo "> Environment Variables found for team/$project" >&2
    printf ' %-28s %-12s %-24s %s\n' name value environments created
    if [ -f "$FAKE_DIR/names.$project" ]; then
      while read -r n; do
        printf ' %-28s %-12s %-24s %s\n' "$n" Encrypted Production 3d
      done <"$FAKE_DIR/names.$project"
    fi
    ;;
  "env update")
    value=$(cat)
    if [ -f "$FAKE_DIR/update_fails" ]; then
      echo "Error: could not update $3 with value $value" >&2
      exit 1
    fi
    printf '%s' "$value" >"$FAKE_DIR/stdin.$project.$3"
    printf '%s %s %s\n' "$project" "$3" "$4" >>"$FAKE_DIR/updates.log"
    echo "Updated $3 for $4"
    ;;
  *) echo "fake vercel: unexpected call: $*" >&2; exit 9 ;;
esac
EOF
chmod +x "$shim/pbpaste" "$shim/vercel"

# A second shim dir without pbpaste, for the macOS guard.
noclip=$tmp/noclip
mkdir -p "$noclip"
cp "$shim/vercel" "$noclip/vercel"

# ---- generated stand-in values (not credentials) --------------------------
rep() { local s=; while (( ${#s} < $2 )); do s+=$1; done; print -r -- "${s[1,$2]}"; }
mix=aB3dE5fG7hJ9kL2mN4pQ6rS8tU0vW1xYz
upper=QWERTY2345UIOPZX
hex=0123456789abcdef

v_stripe_live="sk_""live_$(rep $mix 99)"
v_stripe_rk="rk_""live_$(rep $mix 40)"
v_stripe_test="sk_""test_$(rep $mix 99)"
v_stripe_pub="pk_""live_$(rep $mix 99)"
v_whsec="whsec_$(rep $mix 32)"
v_cmdline="scripts/rotate-vercel-env.sh STRIPE_SECRET_KEY production cambridgetcg-storefront"
v_selfname="./scripts/rotate-vercel-env.sh"
pw=$(rep $mix 40)
v_db_good="postgresql://app_user:${pw}@db-storefront.invalid:5432/app?sslmode=require"
v_db_nopass="postgresql://app_user@db-storefront.invalid:5432/app"
v_db_badpct="postgresql://app_user:${pw}%zz@db-storefront.invalid/app"
v_db_mysql="mysql://app_user:${pw}@db-storefront.invalid/app"
v_db_nodb="postgresql://app_user:${pw}@db-storefront.invalid:5432"
v_aws_id="AKI""A$(rep $upper 16)"
v_aws_sec="$(rep $mix 38)/+"
v_app_long=$(rep $hex 64)
v_app_short=$(rep $hex 10)
v_assign="CRON_SECRET=$(rep $hex 64)"
v_vca="vca_$(rep $mix 24)"
v_wk_ok=$(rep $hex 64)
v_wk_short=$(rep $hex 63)
v_google="GOCSPX-$(rep $mix 28)"

# ---- harness --------------------------------------------------------------
typeset -i passed=0 failures=0
out= rc=0

reset_state() {
  rm -rf "$tmp/state"; mkdir -p "$tmp/state"
  print -r -- "STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
DATABASE_URL
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AUTH_SECRET
AUTH_GOOGLE_SECRET
CRON_SECRET
WHOLESALE_API_KEY
ENCRYPTION_SECRET
VERCEL_TOKEN" >"$tmp/state/names.cambridgetcg-storefront"
  print -r -- "AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
DATABASE_URL" >"$tmp/state/names.tcg-wholesale"
}

# run CLIPBOARD-VALUE [script args...]
run_with() {
  reset_state
  printf %s "$1" >"$tmp/state/clip"; shift
  set +e
  out=$(PATH="$shim:/usr/bin:/bin" FAKE_DIR="$tmp/state" "$script" "$@" 2>&1)
  rc=$?
  set -e
}

updates() { [[ -f $tmp/state/updates.log ]] && wc -l <"$tmp/state/updates.log" | tr -d ' ' || print 0; }
rc_is() { (( rc == $1 )); }
out_has() { [[ $out == *"$1"* ]]; }
out_lacks() { [[ $out != *"$1"* ]]; }
updates_are() { [[ $(updates) == "$1" ]]; }
no_vercel_calls() { [[ ! -e $tmp/state/argv.log ]]; }
stdin_was() { [[ -f $tmp/state/stdin.$1.$2 && "$(<"$tmp/state/stdin.$1.$2")" == "$3" ]]; }
argv_lacks() { [[ ! -f $tmp/state/argv.log ]] || ! grep -qF -- "$1" "$tmp/state/argv.log"; }

expect() {
  local label=$1; shift
  local ok=1 cond
  for cond in "$@"; do
    eval "$cond" || { ok=0; print -r -- "      failed: $cond"; }
  done
  if (( ok )); then
    passed+=1; print -r -- "ok   - $label"
  else
    failures+=1; print -r -- "FAIL - $label (rc=$rc)"
    print -r -- "$out" | sed 's/^/      | /'
  fi
}

# ---- cases ----------------------------------------------------------------
run_with "" --help
expect "--help prints usage and exits 0" 'rc_is 0' 'out_has "usage: scripts/rotate-vercel-env.sh"' 'no_vercel_calls'

run_with "$v_stripe_live" STRIPE_SECRET_KEY production
expect "missing PROJECT is a usage error" 'rc_is 2' 'no_vercel_calls'

run_with "$v_stripe_live" STRIPE_SECRET_KEY prod cambridgetcg-storefront
expect "unknown TARGET is a usage error" 'rc_is 2' 'no_vercel_calls'

run_with "$v_stripe_live" --bogus STRIPE_SECRET_KEY production cambridgetcg-storefront
expect "unknown option is a usage error" 'rc_is 2' 'no_vercel_calls'

run_with "$v_stripe_live" STRIPE_SECRET_KEY production cambridgetcg-storefront
expect "real-shaped Stripe live secret key accepted and sent on stdin only" \
  'rc_is 0' 'out_has "✓ cambridgetcg-storefront: STRIPE_SECRET_KEY (production) updated"' \
  'out_has "sk_live_… (107 chars)"' 'out_lacks "$v_stripe_live"' 'updates_are 1' \
  'stdin_was cambridgetcg-storefront STRIPE_SECRET_KEY "$v_stripe_live"' 'argv_lacks "$v_stripe_live"' \
  'grep -q -- "--sensitive" "$tmp/state/argv.log"'

run_with "$v_stripe_rk" STRIPE_SECRET_KEY production cambridgetcg-storefront
expect "restricted rk_live_ key accepted" 'rc_is 0' 'updates_are 1' 'out_has "rk_live_…"'

run_with "$v_cmdline" STRIPE_SECRET_KEY production cambridgetcg-storefront
expect "the command line itself in the clipboard is refused" \
  'rc_is 1' 'out_has "holds this command"' 'updates_are 0' 'no_vercel_calls'

run_with "$v_selfname" CRON_SECRET production cambridgetcg-storefront
expect "the script path alone (no whitespace) is refused" 'rc_is 1' 'no_vercel_calls'

run_with "$v_stripe_test" STRIPE_SECRET_KEY production cambridgetcg-storefront
expect "sk_test_ key refused for STRIPE_SECRET_KEY" 'rc_is 1' 'out_has "does not look like a STRIPE_SECRET_KEY"' 'out_lacks "$v_stripe_test"' 'no_vercel_calls'

run_with "$v_stripe_pub" STRIPE_SECRET_KEY production cambridgetcg-storefront
expect "publishable pk_live_ key refused in the secret slot" 'rc_is 1' 'no_vercel_calls'

run_with "$v_whsec" STRIPE_WEBHOOK_SECRET production cambridgetcg-storefront
expect "webhook signing secret accepted" 'rc_is 0' 'updates_are 1' 'out_has "whsec_…"'

run_with "$v_db_good" DATABASE_URL production cambridgetcg-storefront tcg-wholesale
expect "Postgres URL accepted; hint shows scheme and host label only" \
  'rc_is 0' 'updates_are 2' 'out_has "postgresql://…@db-storefront.… (${#v_db_good} chars)"' \
  'out_lacks "$pw"' 'stdin_was tcg-wholesale DATABASE_URL "$v_db_good"' 'argv_lacks "$pw"'

run_with "$v_db_nopass" DATABASE_URL production cambridgetcg-storefront
expect "Postgres URL without a password refused" 'rc_is 1' 'no_vercel_calls'

run_with "$v_db_badpct" DATABASE_URL production cambridgetcg-storefront
expect "Postgres URL with a broken %-escape in the password refused" 'rc_is 1' 'no_vercel_calls'

run_with "$v_db_mysql" WHOLESALE_DATABASE_URL production cambridgetcg-storefront
expect "non-Postgres URL refused for *DATABASE_URL" 'rc_is 1' 'no_vercel_calls'

run_with "$v_db_nodb" DATABASE_URL production cambridgetcg-storefront
expect "Postgres URL without a database name refused" 'rc_is 1' 'no_vercel_calls'

run_with "$v_app_short" AUTH_SECRET production cambridgetcg-storefront
expect "short AUTH_SECRET (10 chars) refused" 'rc_is 1' 'out_has "at least 32"' 'no_vercel_calls'

run_with "$v_app_long" AUTH_SECRET preview cambridgetcg-storefront
expect "64-char AUTH_SECRET accepted for preview" 'rc_is 0' 'updates_are 1' 'out_has "AUTH_SECRET (preview) updated"'

run_with "$v_assign" CRON_SECRET production cambridgetcg-storefront
expect "NAME=value line refused" 'rc_is 1' 'out_has "NAME=value"' 'no_vercel_calls'

run_with "$v_stripe_live" --dry-run STRIPE_SECRET_KEY production cambridgetcg-storefront
expect "--dry-run checks shape and existence, writes nothing" \
  'rc_is 0' 'out_has "dry run, nothing written"' 'updates_are 0' \
  '! grep -q "env update" "$tmp/state/argv.log"' 'grep -q "env ls" "$tmp/state/argv.log"'

run_with "$v_stripe_test" --dry-run STRIPE_SECRET_KEY production cambridgetcg-storefront
expect "--dry-run still refuses a wrong shape" 'rc_is 1' 'no_vercel_calls'

run_with "$v_app_long" --dry-run CRON_SECRET production tcg-wholesale
expect "--dry-run reports a variable missing on the project" 'rc_is 1' 'out_has "not found; skipped"' 'updates_are 0'

run_with "$v_app_long" ENCRYPTION_SECRET production cambridgetcg-storefront
expect "ENCRYPTION_SECRET refused outright" 'rc_is 1' 'out_has "re-encryption plan"' 'no_vercel_calls'

run_with "" CRON_SECRET production cambridgetcg-storefront
expect "empty clipboard refused" 'rc_is 1' 'out_has "clipboard is empty"' 'no_vercel_calls'

run_with "$v_vca" VERCEL_TOKEN production cambridgetcg-storefront
expect "auto-rotated vca_ CLI token refused for VERCEL_TOKEN" 'rc_is 1' 'no_vercel_calls'

run_with "$v_aws_id" AWS_ACCESS_KEY_ID production cambridgetcg-storefront tcg-wholesale
expect "AWS access key id accepted on two projects" 'rc_is 0' 'updates_are 2' 'out_has "AKIA…"'

run_with "$v_aws_sec" AWS_SECRET_ACCESS_KEY production cambridgetcg-storefront
expect "AWS secret access key (40 chars) accepted" 'rc_is 0' 'updates_are 1'

run_with "${v_aws_sec}x" AWS_SECRET_ACCESS_KEY production cambridgetcg-storefront
expect "AWS secret access key of 41 chars refused" 'rc_is 1' 'no_vercel_calls'

run_with "$v_wk_ok" WHOLESALE_API_KEY production cambridgetcg-storefront
expect "64-hex wholesale channel key accepted" 'rc_is 0' 'updates_are 1'

run_with "$v_wk_short" WHOLESALE_API_KEY production cambridgetcg-storefront
expect "63-hex wholesale channel key refused" 'rc_is 1' 'no_vercel_calls'

run_with "$v_google" AUTH_GOOGLE_SECRET production cambridgetcg-storefront
expect "Google OAuth client secret accepted" 'rc_is 0' 'updates_are 1' 'out_has "GOCSPX-…"'

run_with "$v_app_long" CRON_SECRET production cambridgetcg-storefront tcg-wholesale
expect "partial success: one project lacks the variable, exit 1" \
  'rc_is 1' 'updates_are 1' 'out_has "✓ cambridgetcg-storefront"' 'out_has "✗ tcg-wholesale: CRON_SECRET (production) not found"'

reset_state; printf %s "$v_stripe_live" >"$tmp/state/clip"; : >"$tmp/state/update_fails"
set +e; out=$(PATH="$shim:/usr/bin:/bin" FAKE_DIR="$tmp/state" "$script" STRIPE_SECRET_KEY production cambridgetcg-storefront 2>&1); rc=$?; set -e
expect "failed update reports the CLI error with the value redacted" \
  'rc_is 1' 'out_has "update FAILED"' 'out_has "[redacted]"' 'out_lacks "$v_stripe_live"'

reset_state; printf %s "$v_stripe_live" >"$tmp/state/clip"; : >"$tmp/state/ls_fails"
set +e; out=$(PATH="$shim:/usr/bin:/bin" FAKE_DIR="$tmp/state" "$script" STRIPE_SECRET_KEY production cambridgetcg-storefront 2>&1); rc=$?; set -e
expect "listing failure skips the project and exits 1" 'rc_is 1' 'out_has "could not list"' 'updates_are 0'

reset_state; printf %s "$v_stripe_live" >"$tmp/state/clip"
set +e; out=$(PATH="$noclip:/bin" FAKE_DIR="$tmp/state" "$script" STRIPE_SECRET_KEY production cambridgetcg-storefront 2>&1); rc=$?; set -e
expect "no pbpaste on PATH: macOS guard exits 3" 'rc_is 3' 'out_has "macOS-only"' 'no_vercel_calls'

print -r -- ""
print -r -- "$passed passed, $failures failed"
(( failures == 0 ))
