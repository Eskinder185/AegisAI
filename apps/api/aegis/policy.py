"""Deny-by-default scope/policy engine. Pure logic: no DB, no network (resolver is injected).

It is evaluated (1) before job creation and (2) again immediately before every tool invocation,
connection, redirect and target resolution. An LLM can never produce a PolicyDecision.
"""
from __future__ import annotations

import ipaddress
import socket
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from urllib.parse import urlsplit


class Mode(StrEnum):
    SIMULATION_ONLY = "SIMULATION_ONLY"
    LOCAL_LAB = "LOCAL_LAB"
    EXTERNAL_AUTHORIZED = "EXTERNAL_AUTHORIZED"  # designed + documented; runtime-disabled in v1


class Action(StrEnum):
    PASSIVE_HTTP_CHECK = "passive_http_check"
    CONFIG_ANALYSIS = "config_analysis"
    LOG_REPLAY = "log_replay"
    AGENT_EVAL = "agent_eval"
    APPLY_FIXTURE_CHANGE = "apply_fixture_change"
    ROLLBACK_FIXTURE_CHANGE = "rollback_fixture_change"


# Actions that always need an explicit, unexpired human approval record tied to target+detail.
APPROVAL_REQUIRED = {Action.APPLY_FIXTURE_CHANGE, Action.ROLLBACK_FIXTURE_CHANGE}

# Capabilities that are never grantable in any mode in v1. Listed so tests and docs can assert it.
FORBIDDEN_CAPABILITIES = frozenset(
    {
        "exploit",
        "credential_attack",
        "persistence",
        "lateral_movement",
        "evasion",
        "exfiltration",
        "network_scan",
        "shell",
        "destructive",
    }
)

MAX_FIXTURE_ENVIRONMENTS: dict[Mode, set[str]] = {
    Mode.SIMULATION_ONLY: {"fixture"},
    Mode.LOCAL_LAB: {"fixture", "lab_container"},
    Mode.EXTERNAL_AUTHORIZED: set(),  # nothing is runnable in v1
}


@dataclass(frozen=True)
class TargetScope:
    id: str
    name: str
    environment: str  # fixture | lab_container | external
    hosts: tuple[str, ...] = ()
    cidrs: tuple[str, ...] = ()
    allowed_actions: tuple[str, ...] = ()
    approval_status: str = "pending"
    window_start: datetime | None = None
    window_end: datetime | None = None
    rate_limit_per_min: int = 60


@dataclass(frozen=True)
class PolicyContext:
    mode: Mode = Mode.SIMULATION_ONLY
    kill_switch: bool = False
    now: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass(frozen=True)
class PolicyDecision:
    allowed: bool
    code: str  # machine-readable reason ("ok" when allowed)
    reason: str  # human-readable explanation
    requires_approval: bool = False
    resolved_ips: tuple[str, ...] = ()

    def as_dict(self) -> dict[str, object]:
        return {
            "allowed": self.allowed,
            "code": self.code,
            "reason": self.reason,
            "requires_approval": self.requires_approval,
            "resolved_ips": list(self.resolved_ips),
        }


def _deny(code: str, reason: str) -> PolicyDecision:
    return PolicyDecision(False, code, reason)


Resolver = Callable[[str], list[str]]


def default_resolver(host: str) -> list[str]:
    infos = socket.getaddrinfo(host, None, proto=socket.IPPROTO_TCP)
    return sorted({i[4][0] for i in infos})


def _is_dangerous_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> str | None:
    """Addresses never reachable regardless of scope (metadata, link-local, multicast, unspecified)."""
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    if ip.is_link_local:  # includes 169.254.169.254 (cloud metadata) and fe80::/10
        return "link-local/metadata address"
    if ip.is_multicast or ip.is_unspecified or ip.is_reserved:
        return "multicast/unspecified/reserved address"
    if str(ip) in {"169.254.169.254", "fd00:ec2::254", "100.100.100.200"}:
        return "cloud metadata address"
    return None


def check_ip_in_scope(ip_text: str, cidrs: tuple[str, ...]) -> PolicyDecision:
    try:
        ip = ipaddress.ip_address(ip_text)
    except ValueError:
        return _deny("invalid_ip", f"'{ip_text}' is not a valid IP address.")
    danger = _is_dangerous_ip(ip)
    if danger:
        return _deny("blocked_address", f"{ip} is a {danger}; never reachable.")
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    for c in cidrs:
        try:
            net = ipaddress.ip_network(c, strict=False)
        except ValueError:
            continue
        if ip.version == net.version and ip in net:
            return PolicyDecision(True, "ok", f"{ip} is inside scope CIDR {c}.", resolved_ips=(str(ip),))
    return _deny("ip_out_of_scope", f"{ip} is not inside any approved scope CIDR.")


def evaluate(
    ctx: PolicyContext,
    target: TargetScope,
    action: str,
    destination: str | None = None,
    resolver: Resolver | None = None,
) -> PolicyDecision:
    """Return a PolicyDecision. Every branch fails closed."""
    if ctx.kill_switch:
        return _deny("kill_switch", "Global kill switch is engaged; all execution is stopped.")
    if ctx.mode == Mode.EXTERNAL_AUTHORIZED:
        return _deny("mode_disabled", "EXTERNAL_AUTHORIZED mode is designed but disabled in this version.")
    if action in FORBIDDEN_CAPABILITIES:
        return _deny("forbidden_capability", f"'{action}' is a forbidden capability and cannot be granted.")
    try:
        act = Action(action)
    except ValueError:
        return _deny("unknown_action", f"'{action}' is not an allowlisted action.")
    if target.environment not in MAX_FIXTURE_ENVIRONMENTS.get(ctx.mode, set()):
        return _deny(
            "environment_not_permitted",
            f"Target environment '{target.environment}' is not permitted in {ctx.mode.value} mode.",
        )
    if target.approval_status != "approved":
        return _deny("target_not_approved", f"Target '{target.name}' approval status is '{target.approval_status}'.")
    if act.value not in target.allowed_actions:
        return _deny("action_not_allowed", f"Action '{act.value}' is not allowed on target '{target.name}'.")
    now = ctx.now if ctx.now.tzinfo else ctx.now.replace(tzinfo=UTC)
    if target.window_start and now < target.window_start:
        return _deny("outside_window", "Target's approved time window has not started.")
    if target.window_end and now > target.window_end:
        return _deny("outside_window", "Target's approved time window has expired.")

    ips: tuple[str, ...] = ()
    if destination is not None:
        dec = check_destination(target, destination, resolver)
        if not dec.allowed:
            return dec
        ips = dec.resolved_ips
    return PolicyDecision(
        True,
        "ok",
        f"Action '{act.value}' permitted on '{target.name}' in {ctx.mode.value} mode.",
        requires_approval=act in APPROVAL_REQUIRED,
        resolved_ips=ips,
    )


def check_destination(target: TargetScope, destination: str, resolver: Resolver | None = None) -> PolicyDecision:
    """Validate a URL/host destination: scheme, host allowlist, resolved IPs, ports."""
    try:
        parts = urlsplit(destination if "://" in destination else f"//{destination}")
    except ValueError:
        return _deny("invalid_destination", "Destination could not be parsed.")
    scheme = (parts.scheme or "").lower()
    if scheme not in {"fixture", "http", "https", ""}:
        return _deny("scheme_blocked", f"Scheme '{scheme}' is not permitted.")
    if parts.username or parts.password:
        return _deny("userinfo_blocked", "Credentials embedded in a destination URL are not permitted.")
    host = (parts.hostname or "").lower()
    if not host:
        return _deny("invalid_destination", "Destination has no host.")

    # Fixture targets are resolved by identity, never over the network.
    if scheme == "fixture" or target.environment == "fixture":
        if scheme not in {"fixture", ""}:
            return _deny("scheme_blocked", "Fixture targets are addressed only with fixture:// identities.")
        if host in {h.lower() for h in target.hosts}:
            return PolicyDecision(True, "ok", f"Fixture identity '{host}' matches target.")
        return _deny("host_out_of_scope", f"Fixture identity '{host}' is not part of target '{target.name}'.")

    # lab_container: explicit container hostnames only, then every resolved IP must be inside scope CIDRs.
    if host not in {h.lower() for h in target.hosts}:
        return _deny("host_out_of_scope", f"Host '{host}' is not in the approved host list.")
    try:
        literal = ipaddress.ip_address(host)
        ips = [str(literal)]
    except ValueError:
        try:
            ips = (resolver or default_resolver)(host)
        except OSError:
            return _deny("unresolvable", f"Host '{host}' did not resolve.")
    if not ips:
        return _deny("unresolvable", f"Host '{host}' did not resolve.")
    for ip in ips:  # ALL answers must be in scope (defeats rebinding via mixed A records)
        dec = check_ip_in_scope(ip, target.cidrs)
        if not dec.allowed:
            return dec
    return PolicyDecision(True, "ok", f"'{host}' resolves only to in-scope addresses.", resolved_ips=tuple(ips))


def check_redirect(
    target: TargetScope, current_url: str, location: str, resolver: Resolver | None = None
) -> PolicyDecision:
    """Redirect targets are re-validated from scratch; relative redirects are resolved against current."""
    from urllib.parse import urljoin

    nxt = urljoin(current_url, location)
    return check_destination(target, nxt, resolver)


class RateLimiter:
    """Sliding-window limiter keyed by (target, action). Deterministic via injectable clock."""

    def __init__(self, clock: Callable[[], float]) -> None:
        self._clock = clock
        self._hits: dict[str, list[float]] = {}

    def allow(self, key: str, per_minute: int) -> bool:
        now = self._clock()
        window = [t for t in self._hits.get(key, []) if now - t < 60.0]
        if len(window) >= per_minute:
            self._hits[key] = window
            return False
        window.append(now)
        self._hits[key] = window
        return True
