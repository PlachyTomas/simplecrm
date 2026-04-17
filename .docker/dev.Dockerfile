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

# pnpm + Claude Code CLI
RUN npm install -g pnpm@latest @anthropic-ai/claude-code

WORKDIR /workspace

# Container-scoped git identity — commits made inside the container
# are clearly attributable to the agent, not the human developer.
RUN git config --global user.name "Claude Dev" \
 && git config --global user.email "claude-dev@simplecrm.local" \
 && git config --global init.defaultBranch main \
 && git config --global --add safe.directory /workspace \
 && git config --global pull.rebase false

COPY .docker/dev-entrypoint.sh /usr/local/bin/dev-entrypoint.sh
RUN chmod +x /usr/local/bin/dev-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/dev-entrypoint.sh"]
CMD ["bash"]
