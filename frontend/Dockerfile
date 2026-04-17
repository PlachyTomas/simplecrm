FROM node:20-bookworm-slim AS builder

ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:${PATH}"

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY tsconfig*.json vite.config.ts tailwind.config.ts postcss.config.cjs index.html ./
COPY src ./src

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm build


FROM nginx:1.27-alpine AS runtime

COPY --from=builder /app/dist /usr/share/nginx/html

# SPA fallback: serve index.html for any unmatched route.
RUN printf '%s\n' \
    'server {' \
    '  listen 80;' \
    '  server_name _;' \
    '  root /usr/share/nginx/html;' \
    '  location / { try_files $uri $uri/ /index.html; }' \
    '  location ~* \.(js|css|png|svg|woff2?)$ { expires 7d; add_header Cache-Control "public"; }' \
    '}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
