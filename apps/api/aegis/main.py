"""FastAPI application factory."""
from __future__ import annotations

import json
import logging
import time
import uuid
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import BRAND, get_settings
from .routers import admin, core, work

log = logging.getLogger("aegis")
if not log.handlers:
    h = logging.StreamHandler()
    h.setFormatter(logging.Formatter("%(message)s"))
    log.addHandler(h)
    log.setLevel(logging.INFO)

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "same-site",
    "Permissions-Policy": "geolocation=(), camera=(), microphone=()",
}


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[no-untyped-def]
    yield


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(title=f"{BRAND['name']} API", version="0.1.0", lifespan=lifespan,
                  description="Lab-bound AI security validation platform. All assessment evidence is SIMULATED against fixtures.",
                  docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)
    app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in s.cors_origins.split(",") if o.strip()],
                       allow_credentials=True, allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
                       allow_headers=["Content-Type", "X-CSRF-Token", "Idempotency-Key"])

    @app.middleware("http")
    async def mw(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        rid = request.headers.get("x-request-id", "")[:36] or str(uuid.uuid4())
        request.state.request_id = rid
        t0 = time.perf_counter()
        resp = await call_next(request)
        for k, v in SECURITY_HEADERS.items():
            resp.headers.setdefault(k, v)
        resp.headers.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
        resp.headers["X-Request-ID"] = rid
        resp.headers["Cache-Control"] = resp.headers.get("Cache-Control", "no-store")
        if request.url.path != "/api/v1/health":
            log.info(json.dumps({"rid": rid, "method": request.method, "path": request.url.path, "status": resp.status_code,
                                 "ms": round((time.perf_counter() - t0) * 1000, 1)}))
        return resp

    @app.exception_handler(HTTPException)
    async def http_exc(request: Request, exc: HTTPException) -> JSONResponse:
        d = exc.detail if isinstance(exc.detail, dict) else {"code": "http_error", "message": str(exc.detail)}
        return JSONResponse({"error": d, "request_id": getattr(request.state, "request_id", None)}, status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def val_exc(request: Request, exc: RequestValidationError) -> JSONResponse:
        errs = [{"field": ".".join(str(x) for x in e["loc"][1:]), "message": e["msg"]} for e in exc.errors()][:10]
        return JSONResponse({"error": {"code": "validation_error", "message": "The request was not valid.", "fields": errs},
                             "request_id": getattr(request.state, "request_id", None)}, status_code=422)

    @app.exception_handler(Exception)
    async def any_exc(request: Request, exc: Exception) -> JSONResponse:
        rid = getattr(request.state, "request_id", None)
        log.error(json.dumps({"rid": rid, "error": type(exc).__name__}))
        return JSONResponse({"error": {"code": "internal_error", "message": "Something went wrong. Reference the request id."},
                             "request_id": rid}, status_code=500)

    for r in (core.router, work.router, admin.router):
        app.include_router(r, prefix="/api/v1")
    return app


app = create_app()
