#!/usr/bin/env python3
"""
Cambridge TCG deploy health: is each Vercel project's newest production
build fine, is it as new as main, and does its site answer.

For each project in PROJECTS it reports an issue when:
  - the newest production deployment that was not skipped is ERROR or
    BLOCKED, or in a state this script does not know
  - the newest commit on main touching the app is not in the live (newest
    READY) deployment, and is more than DRIFT_GRACE_MINUTES old
  - the probe does not connect, or answers 5xx; for an entry with a
    probePath (a health endpoint), answers anything but 2xx

A CANCELED deployment is a skipped or superseded build and says nothing
about what is live; a build cancelled by mistake shows as drift. Age alone
is not an issue: a quiet app deploys rarely. tcg-wholesale is not here: it
is frozen on purpose since 2026-10-11, pending retirement, and not linked to
Git, so it would always look stuck.

The last line names the projects with an issue, for health.yml to compare.
Exits 1 when there is one. Standard library only.

Usage: VERCEL_TOKEN=... python3 deploy-health.py
"""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

TEAM_ID = "team_HR4tb4WB0KZsKxqroSCTQrof"
DRIFT_GRACE_MINUTES = 30          # tolerate fresh commits not yet deployed
PAUSE_SECONDS = 10                # before a second look
WAITING_STATES = {"BUILDING", "INITIALIZING", "QUEUED"}  # a stuck one shows as drift

PROJECTS = [
    {
        "name":    "cambridgetcg-admin",
        "id":      "prj_NGfGodqkx5LCMA6XoeShCAeZZm6u",
        "domain":  "admin.cambridgetcg.com",
        "appPath": "apps/admin",
    },
    {
        # /api/v1/health answers 200 only when the database answered.
        "name":      "cambridgetcg-storefront",
        "id":        "prj_zCHRH4oj7PVh6oXtyNFXF8yrQdRD",
        "domain":    "cambridgetcg.com",
        "appPath":   "apps/storefront",
        "probePath": "/api/v1/health",
    },
    {
        # RewardsPro (spec 9.2). /api/health answers 200 only when the
        # database answered, 503 otherwise. The project builds apps/rewards
        # since the switch (apps/rewards/docs/switch.md).
        "name":      "rewardspro-production",
        "id":        "prj_olcLaLOcmg3jKh28LjW2dgh6mUHi",
        "domain":    "rewardspro-production.vercel.app",
        "appPath":   "apps/rewards",
        "probePath": "/api/health",
    },
]


def vercel_api(path: str) -> dict:
    req = urllib.request.Request(
        f"https://api.vercel.com{path}&teamId={TEAM_ID}",
        headers={"Authorization": f"Bearer {os.environ['VERCEL_TOKEN']}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read())
    except (OSError, ValueError):  # refused, timed out, not JSON: one more try, then it counts
        time.sleep(PAUSE_SECONDS)
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read())


def last_touch(app_path: str) -> tuple[str, int]:
    """(short sha, unix time) of the newest commit on main touching `app_path`, or
    ('', 0). Of a merge, the merge itself: its branch's commits can be days older."""
    out = subprocess.run(
        ["git", "log", "-1", "--first-parent", "--format=%h %ct", "--", app_path],
        capture_output=True, text=True,
    ).stdout.split()
    return (out[0], int(out[1])) if len(out) == 2 else ("", 0)


def holds(live_sha: str, sha: str) -> bool:
    """Whether the live deployment's commit has `sha` in its history."""
    return subprocess.run(["git", "merge-base", "--is-ancestor", sha, live_sha], stderr=subprocess.DEVNULL).returncode == 0


def probe_url(url: str) -> int:
    """The HTTP status, or 0 when nothing answered."""
    req = urllib.request.Request(url, headers={"User-Agent": "cambridge-tcg-health/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return 0


def deployments(project_id: str, query: str) -> list:
    return vercel_api(f"/v6/deployments?projectId={project_id}&target=production&{query}").get("deployments", [])


def check_project(p: dict) -> dict:
    out: dict = {"name": p["name"], "domain": p["domain"], "state": "?", "sha": "?", "issues": []}

    newest = next((d for d in deployments(p["id"], "limit=100") if d.get("readyState") not in ("CANCELED", "DELETED")), None)
    live = next(iter(deployments(p["id"], "limit=1&state=READY")), None)
    if newest:
        out["state"] = newest.get("readyState") or "?"
        if out["state"] != "READY" and out["state"] not in WAITING_STATES:
            out["issues"].append(f"newest production deployment is {out['state']}, so it is not serving")
    if live:
        live_sha = (live.get("meta") or {}).get("githubCommitSha") or "?"
        out["sha"] = live_sha[:8]
        sha, touched = last_touch(p["appPath"])
        if sha and touched < time.time() - DRIFT_GRACE_MINUTES * 60 and not holds(live_sha, sha):
            out["issues"].append(f"commit {sha} ({int((time.time() - touched) / 60)} min old) is not in the live deployment {out['sha']}")
    else:
        out["issues"].append("no READY production deployment found")

    # A site's `/` may redirect or answer 4xx and still be up. A bad answer
    # counts only when a second one, after a pause, is bad too.
    target = f"{p['domain']}{p.get('probePath', '/')}"
    for look in (1, 2):
        code = probe_url(f"https://{target}")
        out["probe"] = code or "no answer"
        bad = code == 0 or code >= 500 or (p.get("probePath") and not 200 <= code < 300)
        if not bad:
            break
        if look == 1:
            time.sleep(PAUSE_SECONDS)
    if bad:
        out["issues"].append(f"{target} answered {out['probe']}")
    return out


def main() -> int:
    if not os.environ.get("VERCEL_TOKEN"):
        print("VERCEL_TOKEN is not set (repository settings, Secrets, Actions).\n\nfailing: vercel-token")
        return 1
    results = [check_project(p) for p in PROJECTS]
    for r in results:
        print(f"{'ok  ' if not r['issues'] else 'FAIL'}  {r['name']:<24} {r['state']:<9} {r['sha']:<9} {r['domain']} {r['probe']}")
        for issue in r["issues"]:
            print(f"        {issue}")
    failing = [r["name"] for r in results if r["issues"]]
    print(f"\nfailing: {' '.join(failing) or 'none'}")
    return 1 if failing else 0


if __name__ == "__main__":
    sys.exit(main())
