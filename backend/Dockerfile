FROM python:3.12-slim-bookworm AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1
# Native deps:
#   curl, ca-certificates       — uv installer trust roots
#   libpango-1.0-0, libpangoft2-1.0-0, libharfbuzz0b,
#   libcairo2, libgdk-pixbuf-2.0-0
#                                — WeasyPrint's PDF rendering pipeline
#                                  (text shaping → glyph rendering →
#                                  raster compositing). Missing any of
#                                  these makes `weasyprint.HTML(...).write_pdf()`
#                                  fail at import with a cryptic OSError.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates \
    libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz0b \
    libcairo2 libgdk-pixbuf-2.0-0 \
 && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app

FROM base AS deps
COPY pyproject.toml uv.lock* /app/
RUN uv sync --frozen --no-dev --no-install-project || uv sync --no-dev --no-install-project

FROM base AS runtime
COPY --from=deps /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:${PATH}"
COPY app /app/app
COPY alembic /app/alembic
COPY alembic.ini /app/alembic.ini
RUN useradd --create-home --uid 1001 app && chown -R app:app /app
USER app
EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]