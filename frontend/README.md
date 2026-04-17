# frontend

React 18 + Vite + TypeScript + Tailwind + shadcn/ui, managed with `pnpm`.

## Local dev

```bash
cd frontend
pnpm install
pnpm dev              # http://localhost:5173
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm preview
```

## Theme tokens

All colors, spacing, radii, typography, and motion tokens live in
`src/theme/tokens.css`. Components reference **semantic tokens only** — grep
for `#`, `rgb(`, or `bg-blue-\d+` to catch violations.

Theme is applied via a `data-theme="dark|light"` attribute on `<html>`. A small
inline script in `index.html` restores the saved theme before paint to prevent
a flash of wrong theme on load.

See `.claude/skills/ui-design.md` for the authoritative design rules.

## Dev-container pnpm store workaround

Inside the current dev container `/home/node/.local/share/pnpm` is root-owned,
so pnpm's default global store can't initialize. Export a writable location
before running pnpm:

```bash
export PNPM_HOME=/tmp/pnpm-home
```

The per-project store dir is already configured at `/tmp/pnpm-store`. This only
affects the dev container; CI and the production Dockerfile are unaffected.
