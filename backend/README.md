# backend

FastAPI + SQLAlchemy 2.0 (async) + Alembic, managed with [`uv`](https://github.com/astral-sh/uv).

## Local dev

```bash
cd backend
uv sync               # creates .venv and installs deps
uv run ruff check .
uv run ruff format --check .
uv run mypy app
uv run pytest
uv run uvicorn app.main:app --reload --port 8000
```

Then open <http://localhost:8000/api/v1/docs> for Swagger UI.

## Layout

```
backend/
├── app/
│   ├── api/v1/        # Versioned HTTP routes
│   ├── core/          # Config, security, deps
│   ├── db/            # Models, session (added in Task 0.4)
│   ├── schemas/       # Pydantic request/response schemas
│   ├── services/      # Business logic (ARES, auto-free, etc.)
│   └── main.py
├── alembic/           # Migrations (added in Task 0.4)
├── tests/
│   ├── api/v1/        # One test file per route module
│   ├── services/      # Unit tests for business logic
│   ├── conftest.py    # Shared fixtures
│   └── factories.py   # (added later)
├── pyproject.toml
└── Dockerfile
```

## Dev-container uv cache workaround

Inside the current `simplecrm-dev` container, `/home/node/.cache` and
`/home/node/.local/share` are root-owned, so `uv` cannot write its default caches
there. Until the container image is rebuilt with correct ownership (see
`fix-docker.sh`), export these before running `uv`:

```bash
export UV_CACHE_DIR=/tmp/uv-cache
export UV_PYTHON_INSTALL_DIR=/tmp/uv-python
export XDG_DATA_HOME=/tmp/share
export XDG_CACHE_HOME=/tmp/cache
```

This only affects the dev container; CI and the production Dockerfile are unaffected.
