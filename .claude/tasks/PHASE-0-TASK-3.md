# Task 0.3 — Frontend skeleton

## Goal
A runnable Vite + React + TS app with Tailwind wired to the theme-token system
described in `.claude/skills/ui-design.md`. One sample page exercises the tokens
so we can eyeball dark/light themes at `/`. ESLint, Prettier, Vitest all pass.

## Files in scope
- `frontend/package.json` — deps: react, react-dom, react-router-dom, @tanstack/react-query,
  clsx, tailwind-merge, lucide-react. dev: vite, typescript, tailwindcss,
  postcss, autoprefixer, vitest, @vitest/coverage-v8, jsdom, @testing-library/react,
  @testing-library/jest-dom, @testing-library/user-event, eslint, @eslint/js,
  typescript-eslint, eslint-plugin-react-hooks, eslint-plugin-react-refresh,
  prettier, prettier-plugin-tailwindcss.
- `frontend/tsconfig.json` — references the two project configs.
- `frontend/tsconfig.app.json` — strict TS for `src/`.
- `frontend/tsconfig.node.json` — for vite config.
- `frontend/vite.config.ts` — with Vitest `test` config and `@` → `src` alias.
- `frontend/tailwind.config.ts` — semantic-token mapping per ui-design.md §2.4.
- `frontend/postcss.config.cjs` — tailwind + autoprefixer.
- `frontend/index.html`
- `frontend/src/main.tsx` — bootstraps React.
- `frontend/src/App.tsx` — sample landing-ish page exercising tokens.
- `frontend/src/index.css` — loads tokens then tailwind.
- `frontend/src/theme/tokens.css` — both dark and light themes from §2.1–2.3.
- `frontend/src/theme/theme.ts` — tiny helper to apply a theme via `data-theme`.
- `frontend/src/lib/utils.ts` — `cn()` helper (shadcn convention).
- `frontend/components.json` — shadcn config (so future tasks can `shadcn add`).
- `frontend/eslint.config.js` — flat config with TS + react-hooks rules.
- `frontend/.prettierrc.json` — formatter config with tailwind plugin.
- `frontend/src/__tests__/App.test.tsx` — Vitest renders App and asserts the
  hero headline is present.
- `frontend/src/test-setup.ts` — jest-dom matchers.
- `frontend/Dockerfile` — multi-stage (builder produces static assets; runtime
  nginx or similar). Skipped actual docker build here; CI in Task 0.5 will run it.

## Acceptance criteria
1. `cd frontend && pnpm install` succeeds.
2. `pnpm lint` passes.
3. `pnpm run typecheck` (alias for `tsc --noEmit`) passes in strict mode.
4. `pnpm test` passes with ≥ 1 test.
5. `pnpm build` produces `dist/` without errors.
6. `pnpm dev` boots and serves `localhost:5173` showing the sample page in
   dark mode by default; a theme toggle switches to light.
7. Tokens file contains both `[data-theme="dark"]` and `[data-theme="light"]`
   blocks matching the values in ui-design.md.
8. No hex codes in component `tsx` files (grep).
9. One commit: `feat(frontend): Vite + React + Tailwind + theme tokens — Task 0.3`.

## Non-goals
- Full shadcn/ui component library build-out (button.tsx, card.tsx etc.). Those
  get added in the task that needs them.
- Routing for actual app routes (lands on landing in Phase 11, app shell in 4.1).
- i18n — Czech strings stay in components.
