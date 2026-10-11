#!/usr/bin/env python3
"""
Cambridge TCG deploy & domain health probe.

For each of the three Vercel projects:
  1. Fetch the latest production deployment via the Vercel REST API
  2. Compare its commit SHA to git main HEAD (drift)
  3. HTTP-probe its custom domain for a 2xx/3xx response

Exits non-zero (1) if any of:
  - latest production deploy is ERROR, BLOCKED or CANCELED, or reports a
    state this script does not recognise. The issue quotes Vercel's reason
    when present and names the newest READY production deployment, which is
    normally the one still serving. It is not after a dashboard promote /
    Instant Rollback to an older deploy; this script does not read the alias.
  - latest production deploy is older than MAX_DEPLOY_AGE_HOURS
  - HEAD differs from latest deployed SHA AND the most recent commit
    touching that app is older than DRIFT_GRACE_MINUTES
  - HTTP probe returns 5xx or fails to connect

A project with a "frozen" baseline (tcg-wholesale since 2026-10-11) is
deliberately left on one build, so its age and drift checks are replaced by
a note under Notes. Failed or unrecognised states and probe failures are
still issues, and so is a newest READY production deploy built from a sha
other than the frozen one. An unknown sha is a note, not an issue.

Usage: VERCEL_TOKEN=... python3 deploy-health.py

Designed to run from `.github/workflows/health.yml` on an hourly cron.
Pure stdlib — no pip install needed in the runner. The state classification
is pure (no network, no git) and covered by test_deploy_health.py here.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

TEAM_ID = "team_HR4tb4WB0KZsKxqroSCTQrof"
MAX_DEPLOY_AGE_HOURS = 24 * 14   # 2 weeks; bump if you intentionally don't deploy that often
DRIFT_GRACE_MINUTES = 30          # tolerate fresh commits not yet deployed
LIVE_LOOKBACK = 20                # production deploys scanned for the live (READY) one
REASON_MAX_CHARS = 300            # keep Vercel's errorMessage to one readable line

# Vercel deployment readyState values, grouped by what they mean for the site.
LIVE_STATE = "READY"
# Never served. Vercel keeps the last READY production deployment live.
# BLOCKED = the deploy gate refused it (e.g. the commit author is not linked
# to a GitHub user on the team); CANCELED = stopped before reaching READY.
FAILED_STATES = frozenset({"ERROR", "BLOCKED", "CANCELED"})
# In flight. Not alerted on; the next hourly run catches one that gets stuck
# (by age, or because it lands in a failed state).
TRANSIENT_STATES = frozenset({"BUILDING", "INITIALIZING", "QUEUED"})

PROJECTS = [
    {
        "name":    "cambridgetcg-admin",
        "id":      "prj_NGfGodqkx5LCMA6XoeShCAeZZm6u",
        "domain":  "admin.cambridgetcg.com",
        "appPath": "apps/admin",
    },
    {
        "name":    "cambridgetcg-storefront",
        "id":      "prj_zCHRH4oj7PVh6oXtyNFXF8yrQdRD",
        "domain":  "cambridgetcg.com",
        "appPath": "apps/storefront",
    },
    {
        "name":    "tcg-wholesale",
        "id":      "prj_t4pr1FszCa87GWAIgQXTbyXED8qr",
        "domain":  "wholesaletcgdirect.com",
        "appPath": "apps/wholesale",
        # Frozen pending retirement: no Git link and main is not promoted.
        # A redeploy of the same build (e.g. after a credential rotation)
        # keeps this sha. Age and drift are not checked; see the doc.
        "frozen": {
            "sha":   "b4386471",
            "since": "2026-10-11",
            "doc":   "docs/decisions/2026-10-11-wholesale-frozen-pending-retirement.md",
        },
    },
]


# --- pure helpers (no network, no git; unit-tested) --------------------------

def deployment_state(d: dict) -> str:
    """Upper-cased readyState of a Vercel deployment record ('' if absent).
    Falls back to `state`, which the list endpoint also carries."""
    return str(d.get("readyState") or d.get("state") or "").strip().upper()


def classify_state(state: str) -> str:
    """'live' | 'transient' | 'failed' | 'unknown' for a readyState value.

    Unknown or missing states are reported rather than ignored: an ERROR-only
    check let BLOCKED pass silently until 2026-10-11."""
    state = (state or "").strip().upper()
    if state == LIVE_STATE:
        return "live"
    if state in TRANSIENT_STATES:
        return "transient"
    if state in FAILED_STATES:
        return "failed"
    return "unknown"


def deployment_sha(d: dict | None) -> str:
    """Short (8-char) git sha a deployment was built from, or '?'."""
    if not d:
        return "?"
    sha = (d.get("meta") or {}).get("githubCommitSha") or ""
    return sha[:8] if sha else "?"


def deployment_reason(d: dict | None) -> str:
    """Vercel's explanation for a non-READY deployment, single-lined and
    truncated; '' when the record carries none. The /v6 list record carries
    errorMessage; the /v13 single-deployment record carries readyStateReason;
    errorCode is a last resort."""
    if not d:
        return ""
    for key in ("errorMessage", "readyStateReason", "errorCode"):
        val = d.get(key)
        if isinstance(val, str) and val.strip():
            text = " ".join(val.split())
            if len(text) > REASON_MAX_CHARS:
                text = text[: REASON_MAX_CHARS - 1] + "…"
            return text
    return ""


def age_hours(created_ms, now_ms: float) -> float:
    """Age in hours of a Vercel `created` timestamp (ms since epoch)."""
    return round((now_ms - (created_ms or 0)) / 1000 / 3600, 1)


def pick_live(deployments: list) -> dict | None:
    """First READY deployment in a newest-first list: normally the one Vercel
    keeps serving while later production deploys fail (not after an Instant
    Rollback to an older deploy). Checks the state itself, so it stays correct
    even if the API ignored the state filter."""
    for d in deployments or []:
        if deployment_state(d) == LIVE_STATE:
            return d
    return None


def describe_live(live: dict | None, now_ms: float, lookup_error: str = "") -> str:
    """One-line description of the newest READY production deployment."""
    if lookup_error:
        return f"unknown (lookup failed: {lookup_error})"
    if not live:
        return ("unknown (Vercel returned no READY production deploy; "
                "check the domain probe)")
    return (f"{live.get('uid', '?')} sha {deployment_sha(live)} "
            f"({age_hours(live.get('created'), now_ms)}h old), "
            f"normally the one serving production")


def state_issue(latest: dict, live: dict | None, now_ms: float,
                lookup_error: str = "") -> str | None:
    """Issue text for the latest production deployment's state, or None when
    it needs no alert (READY, or still in flight).

    For a failed or unrecognised state the text quotes Vercel's reason when
    present and names the newest READY production deploy, so a BLOCKED
    deploy is not mistaken for the one serving."""
    state = deployment_state(latest)
    kind = classify_state(state)
    if kind in ("live", "transient"):
        return None

    head = (f"latest prod deploy {latest.get('uid', '?')} "
            f"(sha {deployment_sha(latest)}) is {state or 'missing a state'}")
    if kind == "unknown":
        head += " (state not recognised by this script; check it by hand)"
    else:
        head += " and is NOT serving"
    lines = [head]
    reason = deployment_reason(latest)
    if reason:
        lines.append(f"reason: {reason}")
    lines.append(f"newest READY: {describe_live(live, now_ms, lookup_error)}")
    return "\n      ".join(lines)


def frozen_check(frozen: dict, live: dict | None,
                 lookup_error: str = "") -> tuple[str | None, str]:
    """(issue or None, note) for a project frozen at one build.

    The note always says the freeze replaced the age and drift checks. The
    one freeze-specific issue is a newest READY production deploy built
    from another sha: an unexpected promotion. When that sha is unknown
    (lookup failed, no READY deploy, no git metadata) the freeze is
    unconfirmed, which is a note, not an issue."""
    expected = frozen["sha"].strip().lower()
    note = (f"frozen at {frozen['sha']} since {frozen['since']} "
            f"(see {frozen['doc']}); age and drift not checked")
    full_sha = ((live or {}).get("meta") or {}).get("githubCommitSha") or ""
    if lookup_error:
        why = f"lookup failed: {lookup_error}"
    elif not live:
        why = "no READY production deploy found"
    elif not full_sha:
        why = f"{live.get('uid', '?')} carries no git sha"
    else:
        why = ""
    if why:
        return None, f"{note}; newest READY sha unknown ({why}), freeze unconfirmed"
    if full_sha.strip().lower().startswith(expected):
        return None, (f"{note}; newest READY {live.get('uid', '?')} "
                      f"sha {deployment_sha(live)} matches")
    issue = (f"newest READY prod deploy {live.get('uid', '?')} is sha "
             f"{deployment_sha(live)}, not the frozen {frozen['sha']} "
             f"(unexpected promotion; see {frozen['doc']})")
    return issue, note


# --- network / git ------------------------------------------------------------

def vercel_api(path: str) -> dict:
    token = os.environ["VERCEL_TOKEN"]
    sep = "&" if "?" in path else "?"
    url = f"https://api.vercel.com{path}{sep}teamId={TEAM_ID}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())


def last_touch(app_path: str) -> tuple[str, int]:
    """(SHA, unix_ts) of the most recent commit touching `app_path` on the
    current branch. Returns ('', 0) if no such commit found."""
    try:
        out = subprocess.check_output(
            ["git", "log", "-1", "--format=%H %ct", "--", app_path],
            stderr=subprocess.DEVNULL,
        ).decode().strip()
        if not out:
            return "", 0
        sha, ts = out.split()
        return sha, int(ts)
    except subprocess.CalledProcessError:
        return "", 0


def is_ancestor(sha: str) -> bool:
    """True if `sha` is reachable from HEAD."""
    if not sha:
        return False
    rc = subprocess.call(
        ["git", "merge-base", "--is-ancestor", sha, "HEAD"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    return rc == 0


def probe_url(url: str) -> tuple[int, str]:
    """Returns (status_code, body_summary). 0 status = connect error."""
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "cambridge-tcg-health/1.0"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, "ok"
    except urllib.error.HTTPError as e:
        return e.code, f"http {e.code}"
    except urllib.error.URLError as e:
        return 0, f"connect-error: {e.reason}"
    except Exception as e:
        return 0, f"error: {type(e).__name__}: {e}"


def newest_ready(p: dict) -> tuple[dict | None, str]:
    """(newest READY production deployment or None, lookup error or '')."""
    try:
        return pick_live(vercel_api(
            f"/v6/deployments?projectId={p['id']}&limit={LIVE_LOOKBACK}"
            f"&target=production&state={LIVE_STATE}"
        ).get("deployments", [])), ""
    except Exception as e:
        return None, f"{type(e).__name__}: {e}"


def check_project(p: dict) -> dict:
    out: dict = {"name": p["name"], "domain": p["domain"], "issues": []}
    frozen = p.get("frozen")
    if frozen:
        out["notes"] = []

    # 1. Latest prod deploy
    deps = vercel_api(
        f"/v6/deployments?projectId={p['id']}&limit=1&target=production"
    ).get("deployments", [])
    if not deps:
        out["issues"].append("no production deployments found")
        return out
    d = deps[0]
    now_ms = time.time() * 1000
    out["deploy_id"]    = d.get("uid")
    out["deploy_state"] = deployment_state(d)
    out["deploy_age_h"] = age_hours(d.get("created"), now_ms)
    out["deployed_sha"] = deployment_sha(d)

    # ERROR / BLOCKED / CANCELED / unrecognised: report it with Vercel's
    # reason and the newest READY sha. Don't alert on BUILDING /
    # INITIALIZING / QUEUED — those are transient and the next hourly check
    # will catch any that get stuck.
    kind = classify_state(out["deploy_state"])
    live, lookup_error = None, ""
    if kind in ("failed", "unknown"):
        if not deployment_reason(d) and d.get("uid"):
            # The list record normally carries errorMessage. When it has no
            # reason, the single-deployment record may carry readyStateReason.
            # Best effort: the issue is reported either way.
            try:
                d = {**d, **vercel_api(f"/v13/deployments/{d['uid']}")}
            except Exception:
                pass
        live, lookup_error = newest_ready(p)
        issue = state_issue(d, live, now_ms, lookup_error)
        if issue:
            out["issues"].append(issue)

    if frozen:
        # Deliberately left on one build: an old deploy and newer app commits
        # are expected, so the age and drift checks give way to a note. The
        # state issue above and the domain probe below still apply.
        if kind == "live":
            live, lookup_error = d, ""
        elif kind == "transient":
            live, lookup_error = newest_ready(p)
        issue, note = frozen_check(frozen, live, lookup_error)
        out["notes"].append(note)
        if issue:
            out["issues"].append(issue)
    else:
        age_and_drift(p, d, out)

    # 3. Domain probe
    code, msg = probe_url(f"https://{p['domain']}/")
    out["probe"] = f"{code} {msg}"
    if code == 0 or code >= 500:
        out["issues"].append(f"domain probe failed: {out['probe']}")

    return out


def age_and_drift(p: dict, d: dict, out: dict) -> None:
    """Age and drift issues for a project that is not frozen."""
    if out["deploy_age_h"] > MAX_DEPLOY_AGE_HOURS:
        out["issues"].append(f"latest prod deploy is {out['deploy_age_h']:.0f}h old (> {MAX_DEPLOY_AGE_HOURS}h)")

    # 2. Drift: a commit touching this app exists on HEAD that postdates the
    # deploy AND is not an ancestor of the deployed SHA. We don't flag drift
    # for apps that simply weren't touched by the latest commit (the deploy
    # there is still current).
    touch_sha, touch_ts = last_touch(p["appPath"])
    out["head_sha"] = touch_sha[:8] if touch_sha else "?"
    deploy_ts_ms = d.get("created", 0)
    deploy_ts = deploy_ts_ms / 1000 if deploy_ts_ms else 0
    if touch_sha and deploy_ts:
        # Skip drift check if the touching commit is older than the deploy
        # (the deploy already includes it).
        if touch_ts > deploy_ts + DRIFT_GRACE_MINUTES * 60:
            age_min = int((time.time() - touch_ts) / 60)
            out["issues"].append(
                f"app commit {touch_sha[:8]} ({age_min}m old) is newer than "
                f"deploy {out['deployed_sha']} ({out['deploy_age_h']}h)"
            )


def main(argv: list | None = None) -> int:
    argparse.ArgumentParser(
        description=(
            "Report each Vercel project's latest production deploy state "
            "(ERROR / BLOCKED / CANCELED are issues, named with Vercel's reason "
            "and the newest READY sha), deploy age, SHA drift and a domain "
            "probe. A frozen project (tcg-wholesale) gets a note instead of "
            "age and drift, and an issue if its newest READY sha is not the "
            "frozen one. Needs VERCEL_TOKEN with read access to the "
            "cambridgetcgs-projects team. Exit 0 = healthy, 1 = issues found."
        ),
    ).parse_args(argv)
    if not os.environ.get("VERCEL_TOKEN"):
        print("error: VERCEL_TOKEN not set", file=sys.stderr)
        return 2
    results = [check_project(p) for p in PROJECTS]
    width = max(len(r["name"]) for r in results)

    print("Cambridge TCG deploy/domain health\n")
    print(f"{'project':<{width}}  state    age      sha       domain")
    print("-" * (width + 60))
    for r in results:
        status = "✓" if not r["issues"] else "✗"
        print(
            f"{r['name']:<{width}}  "
            f"{(r.get('deploy_state','?') or '?'):<8} "
            f"{(str(r.get('deploy_age_h','?'))+'h'):<8} "
            f"{(r.get('deployed_sha','?')):<9} "
            f"{r['domain']}  [{status}] {r.get('probe','?')}"
        )

    print()
    notes = [(r["name"], n) for r in results for n in r.get("notes", [])]
    if notes:
        print("Notes:")
        for name, msg in notes:
            print(f"  {name}: {msg}")
        print()
    issues = [(r["name"], i) for r in results for i in r["issues"]]
    if issues:
        print("Issues:")
        for name, msg in issues:
            print(f"  {name}: {msg}")
        return 1
    print("All projects healthy.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
