"""Auth dependencies: cookie sessions, CSRF double-submit, role checks, login throttling."""
from __future__ import annotations

import time
from collections import defaultdict, deque
from collections.abc import Callable
from datetime import timedelta

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import User, UserSession, utcnow
from .security import token_digest

COOKIE = "aegis_session"
UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}


class ApiError(HTTPException):
    def __init__(self, status: int, code: str, message: str, extra: dict | None = None) -> None:
        super().__init__(status_code=status, detail={"code": code, "message": message, **(extra or {})})


class LoginThrottle:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        s = get_settings()
        now = time.monotonic()
        q = self._hits[key]
        while q and now - q[0] > s.login_window_seconds:
            q.popleft()
        if len(q) >= s.login_max_attempts:
            raise ApiError(429, "too_many_attempts", "Too many failed sign-in attempts. Try again later.")

    def fail(self, key: str) -> None:
        self._hits[key].append(time.monotonic())

    def clear(self, key: str) -> None:
        self._hits.pop(key, None)

    def reset(self) -> None:
        self._hits.clear()


throttle = LoginThrottle()


def current_session(request: Request, db: Session = Depends(get_db, scope="function")) -> UserSession:
    token = request.cookies.get(COOKIE)
    if not token:
        raise ApiError(401, "unauthenticated", "Sign in required.")
    sess = db.execute(select(UserSession).where(UserSession.token_hash == token_digest(token))).scalar_one_or_none()
    if sess is None or sess.expires_at < utcnow():
        raise ApiError(401, "session_expired", "Your session has expired. Sign in again.")
    if not sess.user.is_active:
        raise ApiError(401, "unauthenticated", "Account disabled.")
    if request.method in UNSAFE:
        sent = request.headers.get("x-csrf-token", "")
        if not sent or sent != sess.csrf_token:
            raise ApiError(403, "csrf_failed", "Missing or invalid CSRF token.")
    request.state.actor = sess.user.email
    # sliding expiry
    ttl = timedelta(minutes=get_settings().session_ttl_minutes)
    if sess.expires_at - utcnow() < ttl / 2:
        sess.expires_at = utcnow() + ttl
    return sess


def current_user(sess: UserSession = Depends(current_session)) -> User:
    return sess.user


def require(*roles: str) -> Callable[[User], User]:
    def dep(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise ApiError(403, "forbidden", f"This action requires one of: {', '.join(roles)}.")
        return user

    return dep


ANALYST_UP = require("admin", "analyst")
ADMIN_ONLY = require("admin")
