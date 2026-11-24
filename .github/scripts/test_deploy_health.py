"""deploy-health.py's judgements, with Vercel, git and the probe replaced.
Run by health.yml when either file changes, or by hand:
  python3 -m unittest discover -s .github/scripts
"""
import importlib.util
import pathlib
import time
import unittest
from unittest import mock

_spec = importlib.util.spec_from_file_location("deploy_health", pathlib.Path(__file__).with_name("deploy-health.py"))
dh = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(dh)

PROJECT = {"name": "site", "id": "prj_test", "domain": "site.example", "appPath": "apps/site", "probePath": "/api/v1/health"}


def deployment(state, age_min=600, sha="feedface00"):
    return {"readyState": state, "created": (time.time() - age_min * 60) * 1000, "meta": {"githubCommitSha": sha}}


def issues(newest, live, touched_min_ago=10_000, code=200, project=PROJECT):
    def api(path):
        return {"deployments": [live] if "state=READY" in path and live else newest if "limit=100" in path else []}
    with mock.patch.object(dh, "vercel_api", side_effect=api), \
         mock.patch.object(dh, "last_touch", return_value=("abc1234", int(time.time() - touched_min_ago * 60))), \
         mock.patch.object(dh, "probe_url", **({"side_effect": code} if isinstance(code, list) else {"return_value": code})), \
         mock.patch.object(dh.time, "sleep"):
        return dh.check_project(project)["issues"]


class Judgements(unittest.TestCase):
    def test_a_ready_build_as_new_as_main_is_fine_however_old(self):
        self.assertEqual(issues([deployment("READY", 60 * 24 * 30)], deployment("READY", 60 * 24 * 30), 60 * 24 * 31), [])

    def test_a_blocked_failed_or_unknown_build_is_an_issue_and_a_waiting_one_is_not(self):
        for state in ("BLOCKED", "ERROR", "SOMETHING_NEW"):
            with self.subTest(state=state):
                self.assertEqual(issues([deployment(state)], deployment("READY")), [f"newest production deployment is {state}, so it is not serving"])
        for state in ("BUILDING", "INITIALIZING", "QUEUED"):
            with self.subTest(state=state):
                self.assertEqual(issues([deployment(state)], deployment("READY")), [])

    def test_a_skipped_build_hides_neither_a_failed_one_nor_drift(self):
        self.assertEqual(len(issues([deployment("CANCELED", 1), deployment("ERROR", 60)], deployment("READY"))), 1)
        self.assertIn("commit abc1234", issues([deployment("CANCELED", 1), deployment("READY")], deployment("READY"), touched_min_ago=300)[0])

    def test_drift_waits_for_the_grace(self):
        self.assertEqual(issues([deployment("READY", 60)], deployment("READY", 60), touched_min_ago=45), [])

    def test_a_health_endpoint_must_answer_2xx_and_a_plain_site_anything_below_500(self):
        ready = [deployment("READY")], deployment("READY")
        self.assertEqual(issues(*ready, code=503), ["site.example/api/v1/health answered 503"])
        self.assertEqual(issues(*ready, code=404), ["site.example/api/v1/health answered 404"])
        self.assertEqual(issues(*ready, code=0), ["site.example/api/v1/health answered no answer"])
        plain = {k: v for k, v in PROJECT.items() if k != "probePath"}
        self.assertEqual(issues(*ready, code=404, project=plain), [])
        self.assertEqual(issues(*ready, code=500, project=plain), ["site.example/ answered 500"])

    def test_one_bad_answer_is_looked_at_again(self):
        self.assertEqual(issues([deployment("READY")], deployment("READY"), code=[503, 200]), [])

    def test_nothing_ready_is_an_issue(self):
        self.assertEqual(issues([deployment("ERROR")], None)[-1], "no READY production deployment found")

    def test_wholesale_is_not_watched(self):
        self.assertEqual([p["name"] for p in dh.PROJECTS], ["cambridgetcg-admin", "cambridgetcg-storefront", "rewardspro-production"])


if __name__ == "__main__":
    unittest.main()
