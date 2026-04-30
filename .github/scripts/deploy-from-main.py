#!/usr/bin/env python3
"""
Trigger a Vercel production deploy of one of the three monorepo projects
from the current main HEAD.

Usage:
  VERCEL_TOKEN=... python3 deploy-from-main.py admin
  VERCEL_TOKEN=... python3 deploy-from-main.py storefront
  VERCEL_TOKEN=... python3 deploy-from-main.py wholesale

Pulls main HEAD SHA from the local git repo (no GITHUB_TOKEN needed when
run from a checkout) and asks Vercel to deploy that SHA via gitSource.
This is the same code path as the admin /system/deploys "Redeploy from
main" button, just usable from a shell.
"""
import json
import os
import subprocess
import sys
import urllib.request

TEAM_ID = "team_HR4tb4WB0KZsKxqroSCTQrof"
REPO_ID = 1223740492  # cambridgetcg/Cambridge-TCG-monorepo

PROJECTS = {
    "admin":      ("cambridgetcg-admin",      "prj_NGfGodqkx5LCMA6XoeShCAeZZm6u"),
    "storefront": ("cambridgetcg-storefront", "prj_zCHRH4oj7PVh6oXtyNFXF8yrQdRD"),
    "wholesale":  ("tcg-wholesale",           "prj_t4pr1FszCa87GWAIgQXTbyXED8qr"),
}


def vercel(method: str, path: str, body=None) -> dict:
    token = os.environ["VERCEL_TOKEN"]
    sep = "&" if "?" in path else "?"
    url = f"https://api.vercel.com{path}{sep}teamId={TEAM_ID}"
    req = urllib.request.Request(url, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data=data, timeout=30) as r:
            return json.loads(r.read() or "{}")
    except urllib.error.HTTPError as e:
        raise SystemExit(f"Vercel API {e.code}: {e.read().decode()[:500]}")


def main() -> int:
    if not os.environ.get("VERCEL_TOKEN"):
        print("error: VERCEL_TOKEN not set", file=sys.stderr)
        return 2

    if len(sys.argv) != 2 or sys.argv[1] not in PROJECTS:
        print(f"usage: {sys.argv[0]} {{{'|'.join(PROJECTS)}}}", file=sys.stderr)
        return 2

    proj_name, _ = PROJECTS[sys.argv[1]]
    sha = subprocess.check_output(
        ["git", "rev-parse", "main"],
        cwd=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    ).decode().strip()

    print(f"Deploying {proj_name} from main = {sha[:12]}…")
    body = {
        "name": proj_name,
        "target": "production",
        "gitSource": {
            "type": "github",
            "repoId": REPO_ID,
            "ref": "main",
            "sha": sha,
        },
        "projectSettings": {},
    }
    dep = vercel(
        "POST",
        "/v13/deployments?forceNew=1&skipAutoDetectionConfirmation=1",
        body,
    )
    print(f"  id:     {dep.get('id')}")
    print(f"  url:    https://{dep.get('url')}")
    print(f"  state:  {dep.get('readyState')}")
    print(f"\nWatch progress at https://vercel.com/cambridgetcgs-projects/{proj_name}/{dep.get('id', '').replace('dpl_', '')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
