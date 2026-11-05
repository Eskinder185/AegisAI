"""Developer CLI: python -m aegis.cli migrate | seed | reset | check"""
from __future__ import annotations

import shutil
import subprocess
import sys

from . import seed
from .config import API_ROOT, get_settings
from .db import session_scope


def migrate() -> None:
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=API_ROOT, check=True)  # noqa: S603


def do_seed() -> None:
    s = get_settings()
    if s.environment == "production":
        raise SystemExit("Refusing to seed development users when AEGIS_ENVIRONMENT=production.")
    with session_scope() as db:
        seed.seed_all(db)
    print("Seeded demo targets and development-only users:")
    for email, _, role in seed.DEV_USERS:
        print(f"  {email}  ({role})  password: AEGIS_DEV_SEED_PASSWORD (default in .env.example)")


def reset() -> None:
    with session_scope() as db:
        print(seed.reset_demo_data(db))


def check() -> None:
    print(f"python      {sys.version.split()[0]}")
    print(f"database    {get_settings().database_url.split('@')[-1]}")
    print(f"docker      {'found' if shutil.which('docker') else 'not found (optional)'}")
    print(f"node        {'found' if shutil.which('node') else 'NOT FOUND (needed for the web UI)'}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
    {"migrate": migrate, "seed": do_seed, "reset": reset, "check": check}[cmd]()
