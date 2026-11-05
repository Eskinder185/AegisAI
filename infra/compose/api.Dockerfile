FROM python:3.12-slim
WORKDIR /app
COPY apps/api/pyproject.toml apps/api/
COPY apps/api/aegis apps/api/aegis
COPY apps/api/migrations apps/api/migrations
COPY apps/api/alembic.ini apps/api/
COPY services/worker services/worker
RUN pip install --no-cache-dir -e "apps/api" && useradd -m aegis && mkdir -p /data && chown aegis /data
USER aegis
WORKDIR /app/apps/api
ENV AEGIS_DATABASE_URL=sqlite:////data/aegis.db AEGIS_ARTIFACT_DIR=/data/artifacts
CMD ["uvicorn", "aegis.main:app", "--host", "0.0.0.0", "--port", "8000"]
