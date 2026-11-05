"""Scope-bypass and policy tests. These are the most important tests in the repo."""
from datetime import UTC, datetime, timedelta

import pytest

from aegis.policy import (
    Mode,
    PolicyContext,
    RateLimiter,
    TargetScope,
    check_ip_in_scope,
    check_redirect,
    evaluate,
)

NOW = datetime(2026, 11, 5, 12, 0, tzinfo=UTC)
CTX = PolicyContext(mode=Mode.SIMULATION_ONLY, now=NOW)
LAB_CTX = PolicyContext(mode=Mode.LOCAL_LAB, now=NOW)


def fixture_target(**kw):
    base = dict(
        id="t1", name="demo-web", environment="fixture", hosts=("demo-web.fixture",),
        allowed_actions=("passive_http_check", "apply_fixture_change"), approval_status="approved",
    )
    base.update(kw)
    return TargetScope(**base)


def lab_target(**kw):
    base = dict(
        id="t2", name="lab-web", environment="lab_container", hosts=("lab-web",), cidrs=("172.28.0.0/24",),
        allowed_actions=("passive_http_check",), approval_status="approved",
    )
    base.update(kw)
    return TargetScope(**base)


def test_happy_path_fixture():
    d = evaluate(CTX, fixture_target(), "passive_http_check", "fixture://demo-web.fixture/")
    assert d.allowed and d.code == "ok"


def test_apply_change_requires_approval_flag():
    d = evaluate(CTX, fixture_target(), "apply_fixture_change")
    assert d.allowed and d.requires_approval


def test_kill_switch_denies_everything():
    d = evaluate(PolicyContext(kill_switch=True, now=NOW), fixture_target(), "passive_http_check")
    assert not d.allowed and d.code == "kill_switch"


def test_external_mode_is_disabled():
    d = evaluate(PolicyContext(mode=Mode.EXTERNAL_AUTHORIZED, now=NOW), fixture_target(), "passive_http_check")
    assert not d.allowed and d.code == "mode_disabled"


@pytest.mark.parametrize("cap", ["exploit", "credential_attack", "persistence", "network_scan", "shell", "exfiltration"])
def test_forbidden_capabilities_never_allowed(cap):
    t = fixture_target(allowed_actions=(cap,))  # even if someone put it in the allowlist
    assert not evaluate(CTX, t, cap).allowed


def test_unknown_action_denied():
    assert evaluate(CTX, fixture_target(), "run_arbitrary").code == "unknown_action"


def test_unapproved_target_denied():
    for status in ("pending", "revoked"):
        assert evaluate(CTX, fixture_target(approval_status=status), "passive_http_check").code == "target_not_approved"


def test_action_not_in_target_allowlist():
    assert evaluate(CTX, fixture_target(), "log_replay").code == "action_not_allowed"


def test_external_environment_never_runnable():
    t = fixture_target(environment="external")
    assert evaluate(CTX, t, "passive_http_check").code == "environment_not_permitted"
    assert evaluate(LAB_CTX, t, "passive_http_check").code == "environment_not_permitted"


def test_lab_container_requires_local_lab_mode():
    t = lab_target()
    assert evaluate(CTX, t, "passive_http_check").code == "environment_not_permitted"
    assert evaluate(LAB_CTX, t, "passive_http_check", "http://lab-web/", lambda h: ["172.28.0.5"]).allowed


def test_time_window_enforced():
    t = fixture_target(window_end=NOW - timedelta(minutes=1))
    assert evaluate(CTX, t, "passive_http_check").code == "outside_window"
    t = fixture_target(window_start=NOW + timedelta(hours=1))
    assert evaluate(CTX, t, "passive_http_check").code == "outside_window"


def test_fixture_unknown_host_denied():
    d = evaluate(CTX, fixture_target(), "passive_http_check", "fixture://other.fixture/")
    assert d.code == "host_out_of_scope"


def test_fixture_rejects_real_network_scheme():
    d = evaluate(CTX, fixture_target(), "passive_http_check", "http://demo-web.fixture/")
    assert not d.allowed


@pytest.mark.parametrize("dest", ["http://example.com/", "http://8.8.8.8/", "ftp://lab-web/", "file:///etc/passwd"])
def test_public_and_bad_scheme_denied(dest):
    d = evaluate(LAB_CTX, lab_target(), "passive_http_check", dest, lambda h: ["93.184.216.34"])
    assert not d.allowed


def test_metadata_and_link_local_blocked_even_if_in_cidr():
    t = lab_target(cidrs=("169.254.0.0/16", "172.28.0.0/24"), hosts=("169.254.169.254", "lab-web"))
    d = evaluate(LAB_CTX, t, "passive_http_check", "http://169.254.169.254/latest/meta-data/")
    assert d.code == "blocked_address"
    assert check_ip_in_scope("fe80::1", ("fe80::/10",)).code == "blocked_address"
    assert check_ip_in_scope("::ffff:169.254.169.254", ("0.0.0.0/0",)).code == "blocked_address"


def test_dns_rebinding_mixed_answers_denied():
    answers = ["172.28.0.5", "10.0.0.7"]  # second answer is a real internal host outside the lab
    d = evaluate(LAB_CTX, lab_target(), "passive_http_check", "http://lab-web/", lambda h: answers)
    assert d.code == "ip_out_of_scope"


def test_dns_resolving_to_metadata_denied():
    d = evaluate(LAB_CTX, lab_target(), "passive_http_check", "http://lab-web/", lambda h: ["169.254.169.254"])
    assert d.code == "blocked_address"


def test_hostname_not_in_allowlist_denied_before_resolution():
    called = []
    d = evaluate(LAB_CTX, lab_target(), "passive_http_check", "http://evil.test/", lambda h: called.append(h) or [])
    assert d.code == "host_out_of_scope" and not called


def test_userinfo_trick_denied():
    d = evaluate(LAB_CTX, lab_target(), "passive_http_check", "http://lab-web@evil.test/", lambda h: ["172.28.0.5"])
    assert not d.allowed


def test_redirect_to_blocked_address_denied():
    t = lab_target()
    ok = check_redirect(t, "http://lab-web/", "/login", lambda h: ["172.28.0.5"])
    assert ok.allowed
    bad = check_redirect(t, "http://lab-web/", "http://169.254.169.254/", lambda h: ["169.254.169.254"])
    assert not bad.allowed
    bad2 = check_redirect(t, "http://lab-web/", "https://example.com/x", lambda h: ["93.184.216.34"])
    assert bad2.code == "host_out_of_scope"


def test_unresolvable_fails_closed():
    def boom(_):
        raise OSError("nxdomain")

    assert evaluate(LAB_CTX, lab_target(), "passive_http_check", "http://lab-web/", boom).code == "unresolvable"


def test_rate_limiter_deterministic():
    t = [0.0]
    rl = RateLimiter(lambda: t[0])
    assert all(rl.allow("k", 3) for _ in range(3))
    assert not rl.allow("k", 3)
    t[0] = 61.0
    assert rl.allow("k", 3)
