#!/usr/bin/env python3
"""
Cambridge TCG deploy & domain health probe.

For each of the three Vercel projects:
  1. Fetch the latest production deployment via the Vercel REST API
  2. Compare its commit SHA to git main HEAD (drift)
  3. HTTP-probe its custom domain for a 2xx/3xx response

Exits non-zero (1) if any of:
  - latest production deploy is in ERROR state
  - latest production deploy is older than MAX_DEPLOY_AGE_HOURS
  - HEAD differs from latest deployed SHA AND the most recent commit
    touching that app is older than DRIFT_GRACE_MINUTES
  - HTTP probe returns 5xx or fails to connect

Usage: VERCEL_TOKEN=... python3 deploy-health.py

Designed to run from `.github/workflows/health.yml` on an hourly cron.
Pure stdlib — no pip install needed in the runner.
"""
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
    },
]


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


def check_project(p: dict) -> dict:
    out: dict = {"name": p["name"], "domain": p["domain"], "issues": []}

    # 1. Latest prod deploy
    deps = vercel_api(
        f"/v6/deployments?projectId={p['id']}&limit=1&target=production"
    ).get("deployments", [])
    if not deps:
        out["issues"].append("no production deployments found")
        return out
    d = deps[0]
    out["deploy_id"]    = d.get("uid")
    out["deploy_state"] = d.get("readyState")
    out["deploy_age_h"] = round((time.time() * 1000 - d.get("created", 0)) / 1000 / 3600, 1)
    out["deployed_sha"] = (d.get("meta") or {}).get("githubCommitSha", "?")[:8]

    if out["deploy_state"] == "ERROR":
        out["issues"].append(f"latest prod deploy is ERROR (id={out['deploy_id']})")
    elif out["deploy_state"] != "READY":
        out["issues"].append(f"latest prod deploy is {out['deploy_state']} (still building?)")
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

    # 3. Domain probe
    code, msg = probe_url(f"https://{p['domain']}/")
    out["probe"] = f"{code} {msg}"
    if code == 0 or code >= 500:
        out["issues"].append(f"domain probe failed: {out['probe']}")

    return out


def main() -> int:
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
