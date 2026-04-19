FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl ca-certificates python3 python3-pip python3-venv \
    postgresql-client ripgrep jq less vim-tiny build-essential \
 && rm -rf /var/lib/apt/lists/*

RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

RUN npm install -g pnpm@latest @anthropic-ai/claude-code

# Reuse the existing node user (UID 1000) — give it uv
RUN cp -r /root/.local /home/node/.local && \
    chown -R node:node /home/node/.local
ENV PATH="/home/node/.local/bin:${PATH}"

USER node
WORKDIR /workspace

RUN git config --global user.name "Claude Dev" \
 && git config --global user.email "claude-dev@simplecrm.local" \
 && git config --global init.defaultBranch main \
 && git config --global --add safe.directory /workspace \
 && git config --global pull.rebase false

COPY --chown=node:node .docker/dev-entrypoint.sh /usr/local/bin/dev-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/dev-entrypoint.sh"]
CMD ["bash"]
