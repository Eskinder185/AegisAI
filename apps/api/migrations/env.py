from alembic import context

from aegis import models  # noqa: F401  (register tables)
from aegis.config import get_settings
from aegis.db import Base, configure, engine

configure(get_settings().database_url)
target_metadata = Base.metadata


def run_migrations_online() -> None:
    with engine().connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, render_as_batch=True)
        with context.begin_transaction():
            context.run_migrations()


run_migrations_online()
