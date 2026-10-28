#!/bin/zsh
#
# Offline self-test for scripts/rotate-vercel-env.sh.
#
# Every run of the script under test goes through
#   env -i PATH=<shims>:/usr/bin:/bin HOME=<tmp> /bin/zsh -f
# so no inherited variable (VERCEL_TOKEN, VERCEL_ORG_ID, ...) and no user
# startup file (.zshenv) reaches it, and a real vercel CLI that somehow got
# onto PATH would find no credentials under HOME. Fake `pbpaste`, `pbcopy`
# and `vercel` shims come first on that PATH; the test aborts before any case
# if those names resolve anywhere else. Project names are made up
# (selftest-proj-*). Nothing touches the network, Vercel or the real
# clipboard. Every value below is generated at run time and is not a
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

A=selftest-proj-a   # has most names
B=selftest-proj-b   # has only a few

cat >"$shim/pbpaste" <<'EOF'
#!/bin/sh
printf '%s\n' pbpaste >>"$FAKE_DIR/clipboard.log"
cat "$FAKE_DIR/clip"
EOF

cat >"$shim/pbcopy" <<'EOF'
#!/bin/sh
printf '%s\n' pbcopy >>"$FAKE_DIR/clipboard.log"
cat >"$FAKE_DIR/clip"
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
chmod +x "$shim/pbpaste" "$shim/pbcopy" "$shim/vercel"

# A second shim dir without pbpaste/pbcopy, for the macOS guard.
noclip=$tmp/noclip
mkdir -p "$noclip"
cp "$shim/vercel" "$noclip/vercel"

# ---- isolation guard: abort before any case if a real tool would run ------
resolve() {  # resolve PATH NAME
  env -i PATH="$1" HOME="$tmp" /bin/zsh -f -c "command -v $2" 2>/dev/null || true
}
for tool in vercel pbpaste pbcopy; do
  got=$(resolve "$shim:/usr/bin:/bin" $tool)
  if [[ $got != "$shim/$tool" ]]; then
    print -ru2 -- "abort: under the test PATH, $tool resolves to '${got:-nothing}', not the shim. No case was run."
    exit 2
  fi
done
got=$(resolve "$noclip:/bin" vercel)
[[ $got == "$noclip/vercel" ]] || { print -ru2 -- "abort: vercel resolves to '${got:-nothing}' under the no-clipboard PATH"; exit 2; }
got=$(resolve "$noclip:/bin" pbpaste)
[[ -z $got ]] || { print -ru2 -- "abort: pbpaste resolves to '$got' under the no-clipboard PATH"; exit 2; }
print -r -- "ok   - isolation: vercel, pbpaste and pbcopy resolve to the test shims (env -i, zsh -f)"

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
v_cmdline="scripts/rotate-vercel-env.sh STRIPE_SECRET_KEY production $A"
v_selfname="./scripts/rotate-vercel-env.sh"
pw=$(rep $mix 40)
v_db_good="postgresql://app_user:${pw}@db-storefront.invalid:5432/app?sslmode=require"
v_db_nopass="postgresql://app_user@db-storefront.invalid:5432/app"
v_db_badpct="postgresql://app_user:${pw}%zz@db-storefront.invalid/app"
v_db_mysql="mysql://app_user:${pw}@db-storefront.invalid/app"
v_db_nodb="postgresql://app_user:${pw}@db-storefront.invalid:5432"
v_proxy="http://selftest-user:${pw}@proxy.invalid:22225"
v_page_url="https://vercel.com/selftest-team/$A/settings/environment-variables"
v_aws_id="AKI""A$(rep $upper 16)"
v_aws_sec="$(rep $mix 38)/+"
v_app_long=$(rep $hex 64)
v_app_b64="$(rep $mix 40)+/=="
v_app_bang="$(rep $hex 40)!"
v_app_short=$(rep $hex 10)
v_assign="CRON_SECRET=$(rep $hex 64)"
v_vca="vca_$(rep $mix 24)"
v_wk_ok=$(rep $hex 64)
v_wk_short=$(rep $hex 63)
v_google="GOCSPX-$(rep $mix 28)"

# ---- harness --------------------------------------------------------------
typeset -i passed=1 failures=0   # the isolation guard above counts as one
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
WHOLESALE_B2B_API_KEY
ENCRYPTION_SECRET
SOME_API_KEY
VERCEL_TOKEN" >"$tmp/state/names.$A"
  print -r -- "AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
CARDRUSH_BRIGHT_DATA_PROXY_URL
DATABASE_URL" >"$tmp/state/names.$B"
}

# invoke PATH [script args...]: run the script isolated (see header)
invoke() {
  local search=$1; shift  # not "path": zsh ties that name to PATH
  set +e
  out=$(env -i PATH="$search" HOME="$tmp" FAKE_DIR="$tmp/state" /bin/zsh -f "$script" "$@" 2>&1)
  rc=$?
  set -e
}

# run_with CLIPBOARD-VALUE [script args...]
run_with() {
  reset_state
  printf %s "$1" >"$tmp/state/clip"; shift
  invoke "$shim:/usr/bin:/bin" "$@"
}

updates() { [[ -f $tmp/state/updates.log ]] && wc -l <"$tmp/state/updates.log" | tr -d ' ' || print 0; }
rc_is() { (( rc == $1 )); }
out_has() { [[ $out == *"$1"* ]]; }
out_lacks() { [[ $out != *"$1"* ]]; }
updates_are() { [[ $(updates) == "$1" ]]; }
no_vercel_calls() { [[ ! -e $tmp/state/argv.log ]]; }
stdin_was() { [[ -f $tmp/state/stdin.$1.$2 && "$(<"$tmp/state/stdin.$1.$2")" == "$3" ]]; }
argv_lacks() { [[ ! -f $tmp/state/argv.log ]] || ! grep -qF -- "$1" "$tmp/state/argv.log"; }
clipboard_not_read() { [[ ! -f $tmp/state/clipboard.log ]] || ! grep -qx pbpaste "$tmp/state/clipboard.log"; }
clip_empty() { [[ ! -s $tmp/state/clip ]]; }
clip_is() { [[ "$(<"$tmp/state/clip")" == "$1" ]]; }

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

run_with "$v_stripe_live" STRIPE_SECRET_KEY prod $A
expect "unknown TARGET is a usage error" 'rc_is 2' 'no_vercel_calls'

run_with "$v_stripe_live" --bogus STRIPE_SECRET_KEY production $A
expect "unknown option is a usage error" 'rc_is 2' 'no_vercel_calls'

run_with "$v_stripe_live" STRIPE_SECRET_KEY production $A
expect "real-shaped Stripe live secret key accepted and sent on stdin only" \
  'rc_is 0' 'out_has "✓ $A: STRIPE_SECRET_KEY (production) updated"' \
  'out_has "sk_live_… (107 chars)"' 'out_lacks "$v_stripe_live"' 'updates_are 1' \
  'stdin_was $A STRIPE_SECRET_KEY "$v_stripe_live"' 'argv_lacks "$v_stripe_live"' \
  'grep -q -- "--sensitive" "$tmp/state/argv.log"' 'clip_is "$v_stripe_live"'

run_with "$v_stripe_rk" STRIPE_SECRET_KEY production $A
expect "restricted rk_live_ key accepted" 'rc_is 0' 'updates_are 1' 'out_has "rk_live_…"'

run_with "$v_cmdline" STRIPE_SECRET_KEY production $A
expect "the command line itself in the clipboard is refused" \
  'rc_is 1' 'out_has "holds this command"' 'updates_are 0' 'no_vercel_calls'

run_with "$v_selfname" SOME_API_KEY production $A
expect "the script path alone (no whitespace) is refused by the self-name guard" \
  'rc_is 1' 'out_has "holds this command"' 'no_vercel_calls'

run_with "$v_stripe_test" STRIPE_SECRET_KEY production $A
expect "sk_test_ key refused for STRIPE_SECRET_KEY, with clearing advice" 'rc_is 1' \
  'out_has "does not look like a STRIPE_SECRET_KEY"' 'out_has "pbcopy </dev/null"' \
  'out_lacks "$v_stripe_test"' 'no_vercel_calls'

run_with "$v_stripe_pub" STRIPE_SECRET_KEY production $A
expect "publishable pk_live_ key refused in the secret slot" 'rc_is 1' 'no_vercel_calls'

run_with "$v_whsec" STRIPE_WEBHOOK_SECRET production $A
expect "webhook signing secret accepted" 'rc_is 0' 'updates_are 1' 'out_has "whsec_…"'

run_with "$v_db_good" DATABASE_URL production $A $B
expect "Postgres URL accepted; hint shows scheme and host label only" \
  'rc_is 0' 'updates_are 2' 'out_has "postgresql://…@db-storefront.… (${#v_db_good} chars)"' \
  'out_lacks "$pw"' 'stdin_was $B DATABASE_URL "$v_db_good"' 'argv_lacks "$pw"'

run_with "$v_db_nopass" DATABASE_URL production $A
expect "Postgres URL without a password refused" 'rc_is 1' 'no_vercel_calls'

run_with "$v_db_badpct" DATABASE_URL production $A
expect "Postgres URL with a broken %-escape in the password refused" 'rc_is 1' 'no_vercel_calls'

run_with "$v_db_mysql" WHOLESALE_DATABASE_URL production $A
expect "non-Postgres URL refused for *DATABASE_URL" 'rc_is 1' 'no_vercel_calls'

run_with "$v_db_nodb" DATABASE_URL production $A
expect "Postgres URL without a database name refused" 'rc_is 1' 'no_vercel_calls'

run_with "$v_proxy" CARDRUSH_BRIGHT_DATA_PROXY_URL production $B
expect "URL accepted for a *_URL name" 'rc_is 0' 'updates_are 1' 'out_lacks "$pw"'

run_with "$v_page_url" --dry-run CRON_SECRET production $A
expect "a copied page URL is refused for CRON_SECRET, even in --dry-run" \
  'rc_is 1' 'out_has "holds a URL"' 'no_vercel_calls'

run_with "$v_page_url" SOME_API_KEY production $A
expect "a URL is refused for a name that does not end in _URL" 'rc_is 1' 'out_has "holds a URL"' 'no_vercel_calls'

run_with "$v_app_short" AUTH_SECRET production $A
expect "short AUTH_SECRET (10 chars) refused" 'rc_is 1' 'out_has "at least 32"' 'no_vercel_calls'

run_with "$v_app_bang" AUTH_SECRET production $A
expect "AUTH_SECRET with a character outside base64/hex refused" 'rc_is 1' 'no_vercel_calls'

run_with "$v_app_long" AUTH_SECRET preview $A
expect "64-hex AUTH_SECRET accepted for preview" 'rc_is 0' 'updates_are 1' 'out_has "AUTH_SECRET (preview) updated"'

run_with "$v_app_b64" AUTH_SECRET production $A
expect "base64 AUTH_SECRET accepted" 'rc_is 0' 'updates_are 1'

run_with "$v_assign" CRON_SECRET production $A
expect "NAME=value line refused" 'rc_is 1' 'out_has "NAME=value"' 'no_vercel_calls'

run_with "$v_stripe_live" --dry-run STRIPE_SECRET_KEY production $A
expect "--dry-run checks shape and existence, writes nothing" \
  'rc_is 0' 'out_has "dry run, nothing written"' 'updates_are 0' \
  '! grep -q "env update" "$tmp/state/argv.log"' 'grep -q "env ls" "$tmp/state/argv.log"'

run_with "$v_stripe_test" --dry-run STRIPE_SECRET_KEY production $A
expect "--dry-run still refuses a wrong shape" 'rc_is 1' 'no_vercel_calls'

run_with "$v_app_long" --dry-run CRON_SECRET production $B
expect "--dry-run reports a variable missing on the project" 'rc_is 1' 'out_has "not found; skipped"' 'updates_are 0'

reset_state
invoke "$noclip:/bin" --names-only STRIPE_SECRET_KEY production $A
expect "--names-only needs no clipboard tool, never reads the clipboard, writes nothing" \
  'rc_is 0' 'out_has "STRIPE_SECRET_KEY (production) exists; clipboard not read"' \
  'clipboard_not_read' 'updates_are 0' 'grep -q "env ls" "$tmp/state/argv.log"'

run_with "$v_stripe_live" --names-only CRON_SECRET production $A $B
expect "--names-only reports a missing variable and exits 1 without reading the clipboard" \
  'rc_is 1' 'out_has "✗ $B: CRON_SECRET (production) not found"' 'clipboard_not_read' 'updates_are 0'

run_with "$v_stripe_live" --names-only --dry-run STRIPE_SECRET_KEY production $A
expect "--names-only with --dry-run is a usage error" 'rc_is 2' 'no_vercel_calls' 'clipboard_not_read'

run_with "$v_whsec" --clear STRIPE_WEBHOOK_SECRET production $A
expect "--clear empties the clipboard after every project was written" \
  'rc_is 0' 'updates_are 1' 'clip_empty' 'out_has "Clipboard cleared"'

run_with "$v_app_long" --clear CRON_SECRET production $A $B
expect "--clear keeps the clipboard when a project failed" \
  'rc_is 1' 'updates_are 1' 'clip_is "$v_app_long"' 'out_has "Clipboard kept"'

run_with "$v_whsec" --clear --dry-run STRIPE_WEBHOOK_SECRET production $A
expect "--clear with --dry-run is a usage error" 'rc_is 2' 'no_vercel_calls'

run_with "$v_app_long" ENCRYPTION_SECRET production $A
expect "ENCRYPTION_SECRET refused outright" 'rc_is 1' 'out_has "re-encryption plan"' 'no_vercel_calls'

run_with "" CRON_SECRET production $A
expect "empty clipboard refused" 'rc_is 1' 'out_has "clipboard is empty"' 'no_vercel_calls'

run_with "$v_vca" VERCEL_TOKEN production $A
expect "auto-rotated vca_ CLI token refused for VERCEL_TOKEN" 'rc_is 1' 'no_vercel_calls'

run_with "$v_aws_id" AWS_ACCESS_KEY_ID production $A $B
expect "AWS access key id accepted on two projects" 'rc_is 0' 'updates_are 2' 'out_has "AKIA…"'

run_with "$v_aws_sec" AWS_SECRET_ACCESS_KEY production $A
expect "AWS secret access key (40 chars) accepted" 'rc_is 0' 'updates_are 1'

run_with "${v_aws_sec}x" AWS_SECRET_ACCESS_KEY production $A
expect "AWS secret access key of 41 chars refused" 'rc_is 1' 'no_vercel_calls'

run_with "$v_wk_ok" WHOLESALE_API_KEY production $A
expect "64-hex wholesale channel key accepted" 'rc_is 0' 'updates_are 1'

run_with "$v_wk_ok" WHOLESALE_B2B_API_KEY production $A
expect "64-hex wholesale B2B channel key accepted" 'rc_is 0' 'updates_are 1'

run_with "$v_wk_short" WHOLESALE_API_KEY production $A
expect "63-hex wholesale channel key refused" 'rc_is 1' 'no_vercel_calls'

run_with "$v_wk_short" WHOLESALE_B2B_API_KEY production $A
expect "63-hex wholesale B2B channel key refused" 'rc_is 1' 'no_vercel_calls'

run_with "$v_google" AUTH_GOOGLE_SECRET production $A
expect "Google OAuth client secret accepted" 'rc_is 0' 'updates_are 1' 'out_has "GOCSPX-…"'

run_with "$v_app_long" CRON_SECRET production $A $B
expect "partial success: one project lacks the variable, exit 1" \
  'rc_is 1' 'updates_are 1' 'out_has "✓ $A"' 'out_has "✗ $B: CRON_SECRET (production) not found"'

reset_state; printf %s "$v_stripe_live" >"$tmp/state/clip"; : >"$tmp/state/update_fails"
invoke "$shim:/usr/bin:/bin" STRIPE_SECRET_KEY production $A
expect "failed update reports the CLI error with the value redacted" \
  'rc_is 1' 'out_has "update FAILED"' 'out_has "[redacted]"' 'out_lacks "$v_stripe_live"'

reset_state; printf %s "$v_stripe_live" >"$tmp/state/clip"; : >"$tmp/state/ls_fails"
invoke "$shim:/usr/bin:/bin" STRIPE_SECRET_KEY production $A
expect "listing failure skips the project and exits 1" 'rc_is 1' 'out_has "could not list"' 'updates_are 0'

reset_state; printf %s "$v_stripe_live" >"$tmp/state/clip"
invoke "$noclip:/bin" STRIPE_SECRET_KEY production $A
expect "no pbpaste on PATH: macOS guard exits 3" 'rc_is 3' 'out_has "macOS-only"' 'no_vercel_calls'

print -r -- ""
print -r -- "$passed passed, $failures failed"
(( failures == 0 ))
