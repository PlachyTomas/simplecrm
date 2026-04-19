#!/usr/bin/env bash
# Run this from the simplecrm repo root to fix the root-user issue.
# It patches the Dockerfile to use a non-root user and updates docker-compose volumes.
set -e

echo "Patching .docker/dev.Dockerfile..."
cat > .docker/dev.Dockerfile << 'DOCKERFILE'
FROM node:20-bookworm-slim

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    ca-certificates \
    python3 \
    python3-pip \
    python3-venv \
    postgresql-client \
    ripgrep \
    jq \
    less \
    vim-tiny \
    build-essential \
 && rm -rf /var/lib/apt/lists/*

# uv (Python package manager)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

# pnpm + Claude Code CLI (install globally as root, then switch user)
RUN npm install -g pnpm@latest @anthropic-ai/claude-code

# Create non-root user (Claude Code refuses --dangerously-skip-permissions as root)
RUN groupadd -g 1000 claude && \
    useradd -m -u 1000 -g claude -s /bin/bash claude

# Copy uv to the new user's path
RUN cp -r /root/.local /home/claude/.local && \
    chown -R claude:claude /home/claude/.local
ENV PATH="/home/claude/.local/bin:${PATH}"

# Switch to non-root user
USER claude
WORKDIR /workspace

# Container-scoped git identity
RUN git config --global user.name "Claude Dev" \
 && git config --global user.email "claude-dev@simplecrm.local" \
 && git config --global init.defaultBranch main \
 && git config --global --add safe.directory /workspace \
 && git config --global pull.rebase false

COPY --chown=claude:claude .docker/dev-entrypoint.sh /usr/local/bin/dev-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/dev-entrypoint.sh"]
CMD ["bash"]
DOCKERFILE

echo "Patching .docker/dev-entrypoint.sh..."
cat > .docker/dev-entrypoint.sh << 'ENTRYPOINT'
#!/usr/bin/env bash
set -e

# Re-assert git identity in case a volume mount shadowed it.
git config --global user.name "Claude Dev"
git config --global user.email "claude-dev@simplecrm.local"
git config --global --add safe.directory /workspace

# Restore Claude config from backup if needed
if [ ! -f "$HOME/.claude.json" ] && ls "$HOME/.claude/backups/.claude.json.backup."* 1>/dev/null 2>&1; then
    LATEST_BACKUP=$(ls -t "$HOME/.claude/backups/.claude.json.backup."* | head -1)
    cp "$LATEST_BACKUP" "$HOME/.claude.json"
    echo "Restored Claude config from backup"
fi

cat <<'BANNER'
================================================================
  SimpleCRM dev container
  ----------------------------------------------------------------
  user         : claude (non-root)
  git identity : Claude Dev <claude-dev@simplecrm.local>
  workspace    : /workspace  (your repo, mounted read-write)
  postgres     : postgres:5432  (db: simplecrm / user: simplecrm)
  claude code  : run  `claude --dangerously-skip-permissions`
  workflow     : single session, plans + builds + tests autonomously

  Isolation:
    - No access to host ~/.ssh, ~/.aws, or other host creds
    - No git push to remote (no SSH keys inside)
    - Commits are local only; push from your host after review

  Safety net:
    - This container is the sandbox. Everything done inside
      is bounded to /workspace and to the postgres service.
================================================================
BANNER

exec "$@"
ENTRYPOINT
chmod +x .docker/dev-entrypoint.sh

echo "Patching docker-compose.dev.yml..."
cat > docker-compose.dev.yml << 'COMPOSE'
services:
  dev:
    build:
      context: .
      dockerfile: .docker/dev.Dockerfile
    image: simplecrm-dev:latest
    working_dir: /workspace
    volumes:
      # The repository, mounted read-write.
      - .:/workspace
      # Claude Code auth persistence — mounted to non-root user's home.
      - ${HOME}/.claude:/home/claude/.claude
      # Cache persistence across runs.
      - claude-dev-node-cache:/home/claude/.npm
      - claude-dev-uv-cache:/home/claude/.cache/uv
      - claude-dev-pnpm-store:/home/claude/.local/share/pnpm
    environment:
      - DATABASE_URL=postgresql+asyncpg://simplecrm:simplecrm@postgres:5432/simplecrm
      - POSTGRES_HOST=postgres
      - POSTGRES_PORT=5432
      - POSTGRES_USER=simplecrm
      - POSTGRES_PASSWORD=simplecrm
      - POSTGRES_DB=simplecrm
      - HOME=/home/claude
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - simplecrm-dev
    stdin_open: true
    tty: true

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: simplecrm
      POSTGRES_PASSWORD: simplecrm
      POSTGRES_DB: simplecrm
    volumes:
      - postgres-data:/var/lib/postgresql/data
    ports:
      - "127.0.0.1:5432:5432"
    networks:
      - simplecrm-dev
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U simplecrm"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres-data:
  claude-dev-node-cache:
  claude-dev-uv-cache:
  claude-dev-pnpm-store:

networks:
  simplecrm-dev:
    driver: bridge
COMPOSE

echo ""
echo "Rebuilding dev image (this takes ~1-2 minutes)..."
docker compose -f docker-compose.dev.yml build --no-cache dev

echo ""
echo "Verifying non-root user..."
docker compose -f docker-compose.dev.yml run --rm --no-deps dev whoami

echo ""
echo "Verifying Claude Code CLI..."
docker compose -f docker-compose.dev.yml run --rm --no-deps dev claude --version

echo ""
echo "✅ Done. Run:  ./scripts/dev.sh claude"
