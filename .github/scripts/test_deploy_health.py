#!/usr/bin/env python3
"""
Unit tests for deploy-health.py's state classification. Stdlib only, no
network, no git, no VERCEL_TOKEN.

Run from the repository root:
  python3 -m unittest discover -s .github/scripts -p 'test_*.py' -v
"""
import contextlib
import importlib.util
import io
import pathlib
import unittest
from unittest import mock

# deploy-health.py has a hyphen in its name, so load it by path. Importing it
# only defines constants and functions; main() runs under __main__ alone.
_PATH = pathlib.Path(__file__).with_name("deploy-health.py")
_SPEC = importlib.util.spec_from_file_location("deploy_health", _PATH)
dh = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(dh)

HOUR_MS = 3600 * 1000
NOW_MS = 1_800_000_000_000  # fixed clock: no dependence on the real time

# Fixture text, not Vercel's exact wording.
BLOCKED_MSG = "fixture: deployment blocked by the commit-author gate"


def deployment(state, sha="0123456789abcdef", uid="dpl_latest", age_h=1.0,
               state_key="readyState", **extra):
    d = {
        "uid": uid,
        "created": NOW_MS - age_h * HOUR_MS,
        "meta": {"githubCommitSha": sha},
    }
    if state is not None:
        d[state_key] = state
    d.update(extra)
    return d


LIVE = deployment("READY", sha="feedface00000000", uid="dpl_live", age_h=300.0)


class ClassifyState(unittest.TestCase):
    def test_ready_is_live(self):
        self.assertEqual(dh.classify_state("READY"), "live")

    def test_failed_states(self):
        for state in ("ERROR", "BLOCKED", "CANCELED"):
            with self.subTest(state=state):
                self.assertEqual(dh.classify_state(state), "failed")

    def test_transient_states(self):
        for state in ("BUILDING", "INITIALIZING", "QUEUED"):
            with self.subTest(state=state):
                self.assertEqual(dh.classify_state(state), "transient")

    def test_case_and_whitespace_insensitive(self):
        self.assertEqual(dh.classify_state(" blocked "), "failed")
        self.assertEqual(dh.classify_state("ready"), "live")

    def test_unknown_and_missing_are_not_silently_healthy(self):
        for state in ("DELETED", "SOMETHING_NEW", "", None):
            with self.subTest(state=state):
                self.assertEqual(dh.classify_state(state), "unknown")


class DeploymentFields(unittest.TestCase):
    def test_state_prefers_readyState_then_state(self):
        self.assertEqual(dh.deployment_state({"readyState": "blocked"}), "BLOCKED")
        self.assertEqual(dh.deployment_state({"state": "CANCELED"}), "CANCELED")
        self.assertEqual(
            dh.deployment_state({"readyState": "READY", "state": "ERROR"}), "READY")
        self.assertEqual(dh.deployment_state({}), "")

    def test_sha_is_short_or_placeholder(self):
        self.assertEqual(dh.deployment_sha(deployment("READY")), "01234567")
        self.assertEqual(dh.deployment_sha({"meta": {}}), "?")
        self.assertEqual(dh.deployment_sha({"meta": None}), "?")
        self.assertEqual(dh.deployment_sha({}), "?")
        self.assertEqual(dh.deployment_sha(None), "?")

    def test_reason_prefers_errorMessage(self):
        d = {"errorMessage": BLOCKED_MSG, "readyStateReason": "older field",
             "errorCode": "CODE"}
        self.assertEqual(dh.deployment_reason(d), BLOCKED_MSG)

    def test_reason_falls_back_to_older_fields(self):
        self.assertEqual(
            dh.deployment_reason({"readyStateReason": "could not associate"}),
            "could not associate")
        self.assertEqual(dh.deployment_reason({"errorCode": "BUILD_FAILED"}),
                         "BUILD_FAILED")
        self.assertEqual(dh.deployment_reason({"errorMessage": "   "}), "")
        self.assertEqual(dh.deployment_reason({}), "")
        self.assertEqual(dh.deployment_reason(None), "")

    def test_reason_is_single_line_and_bounded(self):
        text = dh.deployment_reason({"errorMessage": "line one\n  line two\t" + "x" * 1000})
        self.assertNotIn("\n", text)
        self.assertTrue(text.startswith("line one line two "))
        self.assertLessEqual(len(text), dh.REASON_MAX_CHARS)
        self.assertTrue(text.endswith("…"))

    def test_age_hours(self):
        self.assertEqual(dh.age_hours(NOW_MS - 267 * HOUR_MS, NOW_MS), 267.0)
        self.assertEqual(dh.age_hours(NOW_MS, NOW_MS), 0.0)


class PickLive(unittest.TestCase):
    def test_first_ready_in_newest_first_list(self):
        older_ready = deployment("READY", uid="dpl_older")
        deps = [deployment("BLOCKED"), deployment("CANCELED", uid="dpl_c"),
                LIVE, older_ready]
        self.assertIs(dh.pick_live(deps), LIVE)

    def test_none_when_nothing_ready(self):
        self.assertIsNone(dh.pick_live([deployment("ERROR"), deployment("BLOCKED")]))
        self.assertIsNone(dh.pick_live([]))
        self.assertIsNone(dh.pick_live(None))

    def test_ignores_non_ready_even_if_api_filter_was_ignored(self):
        self.assertIsNone(dh.pick_live([deployment("BUILDING")]))


class StateIssue(unittest.TestCase):
    def test_ready_and_transient_need_no_issue(self):
        for state in ("READY", "BUILDING", "INITIALIZING", "QUEUED"):
            with self.subTest(state=state):
                self.assertIsNone(dh.state_issue(deployment(state), LIVE, NOW_MS))

    def test_blocked_is_reported_with_reason_and_live_sha(self):
        latest = deployment("BLOCKED", sha="b10cked0aaaaaaaa", uid="dpl_blocked",
                            age_h=267.0, errorMessage=BLOCKED_MSG)
        issue = dh.state_issue(latest, LIVE, NOW_MS)
        self.assertIsNotNone(issue)
        head, *rest = issue.split("\n")
        self.assertIn("BLOCKED", head)
        self.assertIn("dpl_blocked", head)
        self.assertIn("b10cked0", head)
        self.assertIn("NOT serving", head)
        self.assertTrue(any(BLOCKED_MSG in line and "reason:" in line for line in rest))
        live_line = [line for line in rest if "newest READY:" in line]
        self.assertEqual(len(live_line), 1)
        self.assertIn("dpl_live", live_line[0])
        self.assertIn("feedface", live_line[0])
        self.assertIn("300.0h", live_line[0])
        # Newest READY is normally, not provably, the deploy serving.
        self.assertIn("normally", live_line[0])

    def test_canceled_and_error_are_reported(self):
        for state in ("CANCELED", "ERROR"):
            with self.subTest(state=state):
                issue = dh.state_issue(deployment(state), LIVE, NOW_MS)
                self.assertIsNotNone(issue)
                self.assertIn(state, issue)
                self.assertIn("feedface", issue)

    def test_lowercase_state_from_state_key_is_reported(self):
        issue = dh.state_issue(deployment("blocked", state_key="state"), LIVE, NOW_MS)
        self.assertIsNotNone(issue)
        self.assertIn("BLOCKED", issue)

    def test_no_reason_line_when_vercel_gave_none(self):
        issue = dh.state_issue(deployment("CANCELED"), LIVE, NOW_MS)
        self.assertNotIn("reason:", issue)

    def test_unknown_state_is_reported_without_claiming_not_serving(self):
        issue = dh.state_issue(deployment("SOMETHING_NEW"), LIVE, NOW_MS)
        self.assertIsNotNone(issue)
        self.assertIn("SOMETHING_NEW", issue)
        self.assertIn("not recognised", issue)
        self.assertNotIn("NOT serving", issue)

    def test_missing_state_is_reported(self):
        issue = dh.state_issue(deployment(None), LIVE, NOW_MS)
        self.assertIsNotNone(issue)
        self.assertIn("missing a state", issue)

    def test_live_unknown_when_no_ready_deploy(self):
        issue = dh.state_issue(deployment("BLOCKED"), None, NOW_MS)
        self.assertIn("newest READY: unknown", issue)
        self.assertIn("no READY production deploy", issue)

    def test_live_unknown_when_lookup_failed(self):
        issue = dh.state_issue(deployment("BLOCKED"), None, NOW_MS,
                               lookup_error="HTTPError: HTTP Error 403: Forbidden")
        self.assertIn("lookup failed: HTTPError", issue)

    def test_issue_lines_are_indented_for_the_report(self):
        latest = deployment("BLOCKED", errorMessage=BLOCKED_MSG)
        lines = dh.state_issue(latest, LIVE, NOW_MS).split("\n")
        self.assertEqual(len(lines), 3)
        for line in lines[1:]:
            self.assertTrue(line.startswith("      "))


class CheckProjectWiring(unittest.TestCase):
    """check_project() / main() with every network and git call mocked."""

    PROJECT = {"name": "cambridgetcg-admin", "id": "prj_test",
               "domain": "admin.example.invalid", "appPath": "apps/admin"}

    def run_check(self, responses, touch=("", 0)):
        calls = []

        def fake_api(path):
            calls.append(path)
            for expected_path, resp in responses:
                if path == expected_path:
                    if isinstance(resp, Exception):
                        raise resp
                    return resp
            raise AssertionError(f"unexpected Vercel call: {path}")

        with mock.patch.object(dh, "vercel_api", side_effect=fake_api), \
             mock.patch.object(dh, "last_touch", return_value=touch), \
             mock.patch.object(dh, "probe_url", return_value=(200, "ok")), \
             mock.patch.object(dh.time, "time", return_value=NOW_MS / 1000):
            return dh.check_project(self.PROJECT), calls

    def test_blocked_fetches_reason_and_live_deploy(self):
        blocked = deployment("BLOCKED", sha="b10cked0aaaaaaaa", uid="dpl_blocked",
                             age_h=267.0)
        result, calls = self.run_check([
            ("/v6/deployments?projectId=prj_test&limit=20&target=production&state=READY",
             {"deployments": [LIVE]}),
            ("/v6/deployments?projectId=prj_test&limit=1&target=production",
             {"deployments": [blocked]}),
            # /v13 carries readyStateReason, not errorMessage, for BLOCKED.
            ("/v13/deployments/dpl_blocked", {"readyStateReason": BLOCKED_MSG}),
        ])
        self.assertEqual(result["deploy_state"], "BLOCKED")
        self.assertEqual(result["deployed_sha"], "b10cked0")
        self.assertEqual(len(calls), 3)
        self.assertEqual(len(result["issues"]), 1)
        issue = result["issues"][0]
        self.assertIn("BLOCKED", issue)
        self.assertIn(BLOCKED_MSG, issue)
        self.assertIn("feedface", issue)

    def test_reason_from_list_skips_detail_call(self):
        blocked = deployment("BLOCKED", uid="dpl_blocked", errorMessage=BLOCKED_MSG)
        result, calls = self.run_check([
            ("/v6/deployments?projectId=prj_test&limit=20&target=production&state=READY",
             {"deployments": [LIVE]}),
            ("/v6/deployments?projectId=prj_test&limit=1&target=production",
             {"deployments": [blocked]}),
        ])
        self.assertEqual(len(calls), 2)
        self.assertIn(BLOCKED_MSG, result["issues"][0])

    def test_lookup_failures_do_not_crash_the_report(self):
        blocked = deployment("BLOCKED", uid="dpl_blocked")
        result, _ = self.run_check([
            ("/v6/deployments?projectId=prj_test&limit=20&target=production&state=READY",
             OSError("network down")),
            ("/v6/deployments?projectId=prj_test&limit=1&target=production",
             {"deployments": [blocked]}),
            ("/v13/deployments/dpl_blocked", OSError("network down")),
        ])
        self.assertEqual(len(result["issues"]), 1)
        self.assertIn("lookup failed: OSError", result["issues"][0])

    def test_ready_latest_makes_one_call_and_no_issue(self):
        result, calls = self.run_check([
            ("/v6/deployments?projectId=prj_test&limit=1&target=production",
             {"deployments": [deployment("READY")]}),
        ])
        self.assertEqual(len(calls), 1)
        self.assertEqual(result["issues"], [])

    def test_unrecognised_or_missing_state_is_wired_to_an_issue(self):
        for state in ("DELETED", None):
            with self.subTest(state=state):
                odd = deployment(state, uid="dpl_odd", errorMessage="fixture reason")
                result, _ = self.run_check([
                    ("/v6/deployments?projectId=prj_test&limit=20&target=production&state=READY",
                     {"deployments": [LIVE]}),
                    ("/v6/deployments?projectId=prj_test&limit=1&target=production",
                     {"deployments": [odd]}),
                ])
                self.assertEqual(len(result["issues"]), 1)
                self.assertIn("not recognised", result["issues"][0])
                self.assertIn("feedface", result["issues"][0])

    def test_deploy_state_is_normalised_from_lowercase_state_key(self):
        canceled = deployment("canceled", uid="dpl_c", state_key="state",
                              errorMessage="fixture reason")
        result, _ = self.run_check([
            ("/v6/deployments?projectId=prj_test&limit=20&target=production&state=READY",
             {"deployments": [LIVE]}),
            ("/v6/deployments?projectId=prj_test&limit=1&target=production",
             {"deployments": [canceled]}),
        ])
        self.assertEqual(result["deploy_state"], "CANCELED")
        self.assertEqual(len(result["issues"]), 1)
        self.assertIn("CANCELED", result["issues"][0])

    def test_old_ready_deploy_raises_the_age_issue(self):
        old = deployment("READY", age_h=dh.MAX_DEPLOY_AGE_HOURS + 10)
        result, calls = self.run_check([
            ("/v6/deployments?projectId=prj_test&limit=1&target=production",
             {"deployments": [old]}),
        ])
        self.assertEqual(len(calls), 1)
        self.assertEqual(result["deploy_age_h"], float(dh.MAX_DEPLOY_AGE_HOURS + 10))
        self.assertEqual(len(result["issues"]), 1)
        self.assertIn(f"> {dh.MAX_DEPLOY_AGE_HOURS}h", result["issues"][0])

    def test_drift_compares_app_commit_time_with_deploy_time(self):
        ready = [("/v6/deployments?projectId=prj_test&limit=1&target=production",
                  {"deployments": [deployment("READY", age_h=2.0)]})]
        deploy_s = (NOW_MS - 2.0 * HOUR_MS) / 1000
        grace_s = dh.DRIFT_GRACE_MINUTES * 60
        # App commit made well after the deploy (beyond the grace): drift.
        result, _ = self.run_check(ready, touch=("abcdef0123456789", deploy_s + grace_s + 60))
        self.assertEqual(len(result["issues"]), 1)
        self.assertIn("app commit abcdef01", result["issues"][0])
        self.assertEqual(result["head_sha"], "abcdef01")
        # App commit before the deploy, or within the grace: no drift.
        for ts in (deploy_s - 60, deploy_s + grace_s - 60):
            with self.subTest(ts=ts):
                result, _ = self.run_check(ready, touch=("abcdef0123456789", ts))
                self.assertEqual(result["issues"], [])

    def test_main_lists_blocked_under_issues_and_exits_1(self):
        blocked_result = {"name": "cambridgetcg-admin", "domain": "d",
                          "deploy_state": "BLOCKED", "deploy_age_h": 267.0,
                          "deployed_sha": "b10cked0", "probe": "200 ok",
                          "issues": [dh.state_issue(
                              deployment("BLOCKED", errorMessage=BLOCKED_MSG),
                              LIVE, NOW_MS)]}
        out = io.StringIO()
        with mock.patch.dict(dh.os.environ, {"VERCEL_TOKEN": "unit-test-placeholder"}), \
             mock.patch.object(dh, "PROJECTS", [self.PROJECT]), \
             mock.patch.object(dh, "check_project", return_value=blocked_result), \
             contextlib.redirect_stdout(out):
            rc = dh.main([])
        self.assertEqual(rc, 1)
        report = out.getvalue()
        issues_section = report.split("Issues:", 1)[1]
        self.assertIn("BLOCKED", issues_section)
        self.assertIn("newest READY:", issues_section)

    def test_main_without_token_exits_2_before_any_call(self):
        env = {k: v for k, v in dh.os.environ.items() if k != "VERCEL_TOKEN"}
        err = io.StringIO()
        with mock.patch.dict(dh.os.environ, env, clear=True), \
             mock.patch.object(dh, "check_project") as check, \
             contextlib.redirect_stderr(err):
            rc = dh.main([])
        self.assertEqual(rc, 2)
        check.assert_not_called()
        self.assertIn("VERCEL_TOKEN not set", err.getvalue())


if __name__ == "__main__":
    unittest.main()
