import os

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("AEGIS_MANIFEST_KEY", "test-manifest-key")
os.environ["AEGIS_STEP_DELAY_MS"] = "0"

from aegis import assistant, deps, seed  # noqa: E402
from aegis import db as dbm
from aegis.config import get_settings  # noqa: E402
from aegis.main import create_app  # noqa: E402

PW = get_settings().dev_seed_password


@pytest.fixture()
def app_db(tmp_path):
    dbm.configure(f"sqlite:///{(tmp_path / 't.db').as_posix()}")
    dbm.Base.metadata.create_all(dbm.engine())
    with dbm.session_scope() as s:
        seed.seed_all(s)
    deps.throttle.reset()
    assistant.set_provider_override(None)
    yield
    dbm.engine().dispose()


class Api:
    def __init__(self, app):
        self.c = TestClient(app, base_url="http://localhost")
        self.csrf = ""

    def login(self, who="analyst"):
        r = self.c.post("/api/v1/auth/login", json={"email": f"{who}@aegis.local", "password": PW})
        assert r.status_code == 200, r.text
        self.csrf = r.json()["csrf_token"]
        return r

    def req(self, method, path, **kw):
        headers = kw.pop("headers", {})
        headers.setdefault("X-CSRF-Token", self.csrf)
        return self.c.request(method, f"/api/v1{path}", headers=headers, **kw)

    def get(self, p, **kw):
        return self.req("GET", p, **kw)

    def post(self, p, **kw):
        return self.req("POST", p, **kw)

    def patch(self, p, **kw):
        return self.req("PATCH", p, **kw)

    def put(self, p, **kw):
        return self.req("PUT", p, **kw)

    def target(self, slug):
        return next(t for t in self.get("/targets").json() if t["slug"] == slug)


@pytest.fixture()
def api(app_db):
    return Api(create_app())


@pytest.fixture()
def analyst(api):
    api.login("analyst")
    return api


@pytest.fixture()
def admin(api):
    api.login("admin")
    return api


def run_all():
    from aegis.runner import run_pending
    return run_pending()
