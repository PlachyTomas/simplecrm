# Supply-chain security audit — 2026-07-22

Scope: backend `uv.lock` (82 pkgs), frontend `pnpm-lock.yaml` (lockfile v9), Claude Code tooling surface (skills, plugins, hooks, MCP servers), CI workflow, docker images, repo scripts. Audit only — **no fixes applied**. Fix plan at the bottom.

Method: `pnpm audit` (GitHub advisory DB), `pip-audit` (PyPA/OSV) on a `uv export` of the lockfile, lockfile provenance greps, full-content scan of every installed skill/plugin/hook for exfiltration patterns, plus a web-research pass on supply-chain incidents through July 2026 (sources at bottom).

## Verdict (TL;DR)

**No evidence of compromise anywhere in the stack.** No malicious package versions in either lockfile, no known-bad packages present at all, all Python packages resolve from pypi.org, all plugins come from Anthropic's official marketplace and their hook/script contents were read and are benign. What the audit did find: **a stack of ordinary known CVEs** (headlined by an EOL vite 5 / vitest 2 line and several backend libs a patch behind), and **a handful of hardening gaps** (no install cooldown, `@latest` MCP fetch, tag-pinned GitHub Actions) that are exactly the vectors 2025/26 npm attacks exploited.

## 1. Malicious-package check (the actual supply-chain question)

### npm — CLEAN, with receipts

- **Sept 2025 "qix" phishing wave** (chalk/debug/ansi-styles et al.): lockfile pins the **post-incident fixed releases** of every affected package that appears in the tree — `debug@4.4.3` (malicious was 4.4.2), `ansi-styles@6.2.3` (mal. 6.2.2), `strip-ansi@7.2.0` (mal. 7.1.1), `ansi-regex@6.2.2` (mal. 6.2.1), `supports-color@10.2.2` (mal. 10.2.1); `chalk@4.1.2` and `color-convert@2.0.1` are older-major, unaffected. `error-ex`, `simple-swizzle`, `is-arrayish` not in tree.
- **Shai-Hulud worm waves 1 & 2** (Sept/Nov 2025): none of the seed/high-profile packages (`@ctrl/tinycolor`, `nx`, `posthog-*`, `@asyncapi/*`, Zapier/ENS packages) appear in the tree.
- **eslint-config-prettier (July 2025)**: not a dependency (prettier runs standalone here).
- Lockfile hygiene: zero git/tarball/http dependencies — every entry resolves from the npm registry; `excludeLinksFromLockfile: false`, lockfile v9, CI installs with `--frozen-lockfile`.

### PyPI — CLEAN

- All 82 packages in `uv.lock` resolve from `https://pypi.org/simple` with hashes; the only non-registry entry is the project itself (`editable = "."`). No typosquat-shaped names; `pip-audit` (which includes OSV malicious-package advisories) flagged no malware entries, only CVEs (§2).

### Claude Code tooling — CLEAN

- **Plugins**: all five (`superpowers@6.1.1`, `frontend-design`, `code-simplifier`, `playwright`, `claude-md-management`) install from the official `anthropics/claude-plugins-official` GitHub marketplace; install paths, versions, and (for superpowers) the git SHA are recorded in `installed_plugins.json`.
- **Hooks**: exactly one auto-run hook exists — superpowers' SessionStart. Its script (`hooks/session-start`) was read in full: it cats a SKILL.md into JSON context. No network, no credential access, no eval.
- **Skills**: all 5 project skills + 2 user skills + `~/.claude/tools/ultracode-watch.sh` (295 lines, local rendering only) scanned for exfil patterns (curl/wget to external hosts, base64-decode, `/dev/tcp`, keychain access, token greps, webhook/pastebin/discord endpoints): **zero hits**. The only pattern matches in the plugin cache are superpowers' own localhost test suites and eval docs.
- **MCP servers**: `pencil` runs a local binary from the Pencil desktop app install (`~/.pencil/mcp/...`) — trusted-local, not a registry fetch. The playwright plugin, however, runs `npx @playwright/mcp@latest` — see §3.
- **Permissions posture** (already good): project settings deny `curl|sh`, `wget|bash`, `sudo`, `rm -rf`, and all reads/edits of `.env*` — these deny rules are precisely what blunts the `~/.claude`-credential-theft angle used by nx "s1ngularity".

## 2. Known-CVE findings (not supply-chain attacks, but in scope for the fix plan)

### Frontend (`pnpm audit`: 16 findings — 1 critical, 7 high, 7 moderate, 1 low)

Runtime-relevant (ships to users):

| Package | Have | Finding | Fix |
|---|---|---|---|
| react-router (via react-router-dom) | 6.30.3 | open redirect via `//` protocol-relative path (GHSA-2j2x-hqr9-3h42, moderate) | ≥6.30.4 |

Dev-tooling only (never in the production bundle; exploitability needs a dev server or test UI running):

- **vitest 2.1.9** — critical GHSA-5xrq-8626-4rwp (arbitrary file read+execute when Vitest **UI server** is listening; we don't run `--ui`, but the fix line is vitest ≥3.2.6 — v2 is unpatched).
- **vite 5.4.21** — high `server.fs.deny` bypass (Windows-only), moderate path traversal in optimized-deps `.map`, moderate NTLMv2 hash leak via launch-editor (Windows). All patched only in vite ≥6.4.2/6.4.3 — **vite 5 is EOL for security fixes**.
- **esbuild 0.21.5** (pinned by vite 5) — moderate: any website can hit the dev server and read responses (GHSA-67mh-4wv8-2f99).
- **ws 8.20.0** (via jsdom) — high memory-exhaustion DoS + moderate uninit-memory disclosure; fix ≥8.21.0.
- **form-data 4.0.5** (via jsdom) — high CRLF injection; fix ≥4.0.6.
- **brace-expansion** (3 ranges via minimatch consumers) — high/moderate ReDoS; fixes 1.1.16 / 2.1.2 / 5.0.7.
- **js-yaml 4.1.1** (via eslint) — high + moderate quadratic-CPU DoS; fix ≥4.3.0.
- **@babel/core 7.29.0** — low arbitrary file read via sourceMappingURL; fix ≥7.29.1.

Root cause of most of the list: the **vite 5 + vitest 2** train is past its patch line. One coordinated dev-stack upgrade clears the critical, all three vite advisories, and the esbuild advisory at once.

### Backend (`pip-audit` on uv.lock export)

Prioritized by exposure:

| Package | Have | Why it matters here | Fix version |
|---|---|---|---|
| authlib | 1.6.11 | OAuth/session auth path (Google sync!) — PYSEC-2026-188 | 1.6.12 (patch) |
| starlette | 1.0.0 | ASGI layer under every request — PYSEC-2026-161/248/249/2280/2281 | 1.0.1 minimum; 1.3.1 full (via fastapi bump) |
| python-multipart | 0.0.28 | parses the feedback endpoint's `UploadFile` — PYSEC-2026-3036/3037/3040 | 0.0.31 |
| pillow | 12.2.0 | WeasyPrint image decoding in invoice PDFs (attacker-influenced content) — 8 PYSEC + 4 CVE entries | 12.3.0 |
| pydantic-settings | 2.13.1 | GHSA-4xgf-cpjx-pc3j | 2.14.2 |
| cryptography | 46.0.7 | GHSA-537c-gmf6-5ccf | 48.0.1 (major) |
| weasyprint | 63.1 | PYSEC-2026-2034 + PYSEC-2026-3412 | **68.0 — conflicts with the deliberate `<64` pin** (stored `pdf_sha256` stability). Decision needed: accept hash invalidation/migration vs. accept the CVEs. One advisory has **no fix version listed** → check applicability. |
| ecdsa | 0.19.2 | via python-jose — PYSEC-2026-1325, **no fix released** | none; see fix plan (python-jose replacement is the real fix) |
| mako / click / idna / pyasn1 | — | low-exposure transitive DoS/parsing issues | 1.3.12 / 8.3.3 / 3.15 / 0.6.4 |

## 3. Hardening gaps (the "next Shai-Hulud" checklist)

1. **Install cooldown not explicitly configured.** pnpm 11 ships a `minimumReleaseAge` default of 1440 min (per pnpm's Dec 2025 supply-chain announcement), but nothing in this repo sets or asserts it. This is the single highest-value control against fast-burning npm compromises — every 2025/26 wave was unpublished within hours-to-days. Set it explicitly (with `minimumReleaseAgeStrict: true` so pnpm hard-fails instead of silently downgrading).
2. **`npx @playwright/mcp@latest`** in the playwright plugin re-resolves a floating tag from the registry — a compromise of that package would execute on next session start with zero cooldown. Pin a reviewed version (local `.mcp.json` override) or vendor the plugin config.
3. **GitHub Actions pinned by mutable tag** (`actions/checkout@v4`, `astral-sh/setup-uv@v3`, `pnpm/action-setup@v4`, `actions/setup-node@v4`) — the tj-actions/changed-files compromise (Mar 2025) was exactly a retagged action. Pin to commit SHAs.
4. **`uv sync --all-extras` in CI without `--locked`** — respects the lockfile but silently re-resolves if lock and manifest drift; `--locked` makes drift a hard failure.
5. **No scheduled advisory scanning** — `pnpm audit` / `pip-audit` (or osv-scanner) run only when a human remembers. Add a CI job (non-blocking warn, or scheduled).
6. **`fix-docker.sh` pipes `https://astral.sh/uv/install.sh` to `sh`** unpinned (official source, but no version/checksum pin). Note: project deny-rules block Claude from running curl|sh, but the Dockerfile does it in-image.
7. **`postgres:16-alpine` floating tag** in dev + prod compose files — pin prod by digest.
8. **pnpm build-script allowlist duplicated, one copy dead.** pnpm 11.9.0 warns that the `pnpm` field in `package.json` is no longer read (`pnpm.onlyBuiltDependencies` ignored). Correction found during implementation: the *live* allowlist already exists in `frontend/pnpm-workspace.yaml` as `allowBuilds: {esbuild: true}` (the earlier "pnpm 11 allowBuilds fix") — so scripts were correctly gated all along; the `package.json` copy was a stale duplicate to delete.

## 4. Incident intel (research pass, through July 2026)

Condensed from a multi-source research pass (Unit42, Socket, StepSecurity, Wiz, Snyk, JFrog, Check Point, Datadog, Aikido, Microsoft, Trend Micro — URLs at bottom). Items marked **UNVERIFIED** were seen in only one source.

### npm timeline

- **2025-07 — eslint-config-prettier phishing** (CVE-2025-54313): malicious `eslint-config-prettier@8.10.1/9.1.1/10.1.6/10.1.7`, `synckit@0.11.9`, `@pkgr/core@0.9.9`, `napi-postinstall`; Windows DLL payload. Live ~3h.
- **2025-08 — nx "s1ngularity"**: credential stealer that specifically harvested **`~/.claude` and other AI-CLI credentials** (first known case); phase 2 flipped victims' private repos public.
- **2025-09-08 — "qix" wave**: 18 packages, ~2B downloads/wk (`chalk@5.6.1`, `debug@4.4.2`, `ansi-styles@6.2.2`, `strip-ansi@7.1.1`, `color-convert@3.1.1`, `color-name@2.0.1`, `supports-color@10.2.1`, `ansi-regex@6.2.1`, `wrap-ansi@9.0.1`, `slice-ansi@7.1.1`, …); browser crypto-wallet drainer; pulled within ~2–3h.
- **2025-09 — Shai-Hulud wave 1**: first self-replicating npm worm (`@ctrl/tinycolor` + ~200–500 pkgs); secrets exfiltrated to public GitHub repos.
- **2025-11 — Shai-Hulud 2.0 "Second Coming"**: ~600–800 packages, 25k+ GitHub repos, ~14k secrets across 487 orgs (Zapier, PostHog, Postman, Zscaler).
- **2026-03 — Trivy GitHub Actions compromise** (TeamPCP debut) and **axios account takeover** (DPRK-attributed; affected version strings UNVERIFIED).
- **2026-04/05 — "Mini Shai-Hulud" waves** (CVE-2026-45321): SAP/CAP wave (`mbt`, `@cap-js/*`, Apr 29); **TanStack wave (May 11)** — 84 malicious versions across 42 `@tanstack/*` packages in ~6 min via Actions cache-poisoning + OIDC token theft, **published with valid SLSA provenance** (Router/Start only; react-query/react-table explicitly NOT hit); **@antv wave (May 19)** — 325 versions in ~1h, adds password-manager harvesting (`echarts-for-react`, `timeago.js`, `size-sensor` also hit).
- **2026-06 — Miasma / `@redhat-cloud-services`** (32 pkgs, valid provenance again) and **Mastra** (140+ pkgs poisoned via typosquat dep `easy-day-js`; DPRK Sapphire Sleet).
- **2026-07-07 — npm+PyPI payment-SDK typosquats** (Paysafe/Skrill/Neteller impersonations).
- **UNVERIFIED leads**: `@bitwarden/cli` "Third Coming" (2026-04-22), `@asyncapi/generator@3.3.1` "miasma-train" (2026-07-14), a `lucide-react`/node-gyp June-2026 claim (looks like a search-summarizer artifact), MCPJam Inspector CVE-2026-23744, "AgentBaiting" fake-skill campaign.
- Scale: 454,600 new malicious packages in 2025, +75% YoY (Sonatype).

### PyPI timeline

- **2026-04/05 — Mini Shai-Hulud went cross-ecosystem** (first simultaneous npm+PyPI worm): `mistralai@2.4.6`, `guardrails-ai@0.10.1`, `pytorch-lightning`/`lightning` 2.6.2–2.6.3; import-time hook fetches a Bun runtime + obfuscated stealer.
- **Early 2026 — typosquat flood**: 500+ packages in two waves, single-char squats of `boto3`/`requests`/`numpy`/`flask` (Check Point); GitLab-reported Shai-Hulud copycat (2026-06). Typosquats don't touch a pinned exact-name `uv.lock`.
- No uv-tool or uv-registry incident surfaced.

### Claude Code / agent-tooling threats

- **CVE-2025-59536** (CVSS 8.7): repo-controlled `.claude/settings.json` hooks + `.mcp.json` executed **before the trust dialog** → RCE on clone-and-open. Fixed in Claude Code ≥1.0.111. **This machine runs 2.1.212 ✓.** Companion **CVE-2026-21852** (`.mcp.json` auto-approval) also patched.
- **Snyk "ToxicSkills" audit (Feb 2026)** of the third-party ClawHub skill marketplace: 76 skills with confirmed malicious payloads, prompt injection in ~36% — third-party skill marketplaces are hostile territory. The official `claude-plugins-official` marketplace has **no confirmed compromise** (one UNVERIFIED "Hookify" prompt-injection report; that plugin is not installed here).
- **Malicious MCP precedent**: `postmark-mcp` npm server silently BCC'd all email to its author (2025). Vetting rules that held up in 2026: prefer the smallest primitive (skill > plugin > MCP server), read every SKILL.md/hook before first run, pin plugin versions, treat plugin install as transitive trust over every bundled hook/binary.
- **Strategic lesson of 2026**: provenance/OIDC attestation is *not* benignity — the TanStack and Red Hat waves shipped with **valid SLSA provenance** by hijacking CI runners mid-workflow. Cooldown windows (`minimumReleaseAge`) remain the control that would have blunted every wave above.

### Cross-check of this intel against this repo/machine — ALL CLEAN

| Check | Result |
|---|---|
| All 10 qix-wave IOC version strings vs `pnpm-lock.yaml` | 0 matches (tree pins the post-incident releases) |
| eslint-config-prettier wave (`synckit`, `@pkgr/core`, `napi-postinstall`) | only `synckit@0.4.0` present — not the malicious 0.11.9; others absent |
| `@tanstack/*` | only `react-query@5.99.0` / `react-table` (uncompromised); no Router/Start packages in tree |
| `axios`, `@antv/*`, `mastra`, `easy-day-js`, `echarts-for-react`, `timeago.js`, `size-sensor` | absent |
| PyPI: `pytorch-lightning`, `lightning`, `mistralai`, `guardrails-ai`, `rsquests`/`tlask`/`rlask` | absent from `uv.lock` |
| `lucide-react` (UNVERIFIED lead) | pinned `0.468.0`, locked ~Dec 2024 — predates the alleged June-2026 event by 18 months; unaffected even if the lead is real |
| Claude Code CLI ≥1.0.111 (CVE-2025-59536) | 2.1.212 ✓ |

## 5. Fix plan (ordered; nothing implemented yet)

### P0 — runtime-exposed patch bumps (small, safe, do first)

1. Backend: `uv lock --upgrade-package authlib --upgrade-package starlette --upgrade-package python-multipart --upgrade-package pillow --upgrade-package pydantic-settings` (+ `mako click idna pyasn1`), run tests. All are patch/minor.
2. Frontend: bump `react-router-dom` to pull react-router ≥6.30.4 (patch).
3. Frontend transitives: `pnpm update ws form-data js-yaml brace-expansion "@babel/core"` (all within existing ranges or via `pnpm.overrides` if a parent pins).

### P1 — the two real projects

4. **Dev-stack upgrade: vite 5→6/7(current) + vitest 2→3, `@vitejs/plugin-react` + `@vitest/coverage-v8` to match.** Clears the critical vitest advisory, all vite advisories, and EOL esbuild. Touches `vite.config`, vitest config, possibly jsdom env — run full FE suite + `npx vite build` + a playwright smoke pass.
5. **WeasyPrint decision (owner call, blocked on product not code):** upgrading 63→68 fixes 2 advisories but breaks the `pdf_sha256` stability contract (`backend/pyproject.toml` pins `<64` for this). Options: (a) accept + migrate: re-render or grandfather stored hashes (hash column keyed by renderer version); (b) verify whether the two PYSEC advisories are reachable in our usage (server-side rendering of our own templates — likely low exposure) and document acceptance. Recommend (b) now, (a) at the next invoice-schema change.
6. `cryptography` 46→48 (major): bump together with an `authlib`/`python-jose` compatibility check.

### P2 — hardening (one config-only PR)

7. Create `frontend/pnpm-workspace.yaml` with the settings pnpm 11 actually reads: `onlyBuiltDependencies: [esbuild]` (moving the dead `package.json` field — §3.8), `minimumReleaseAge: 4320` (3 days), `minimumReleaseAgeStrict: true`, plus a `minimumReleaseAgeExclude` escape hatch for urgent security patches. Then delete the ignored `pnpm` block from `package.json`.
8. Pin all GitHub Actions to commit SHAs (+ optionally add dependabot for actions updates).
9. CI: change backend install to `uv sync --all-extras --locked`; add a (non-blocking) `pip-audit` + `pnpm audit --prod` step or a weekly scheduled scan workflow.
10. Pin `@playwright/mcp` to an exact reviewed version in the plugin's MCP invocation (project-level `.mcp.json` override).
11. Pin `postgres` image by digest in `docker-compose.prod.yml`; pin the uv installer version/checksum in `fix-docker.sh`.

### P3 — structural / watch items

12. **Replace `python-jose` + `ecdsa`** (unfixed PYSEC-2026-1325; python-jose is lightly maintained) with `pyjwt` + `cryptography` for the JWT paths — removes two weak links from the auth chain. Medium refactor, plan alongside the next auth touch.
13. Re-audit cadence: repeat this audit (both `audit` runs + this doc's checklist) quarterly or after any incident headline; keep plugins updated via the official marketplace only; keep the `.env`/`curl|sh` deny rules in project settings; keep Claude Code current (≥1.0.111 is the RCE-fix floor; running 2.1.212 today). Re-check the UNVERIFIED leads (§4) if any get vendor confirmation — none affect pinned versions here.

## Implementation log (2026-07-23) — fix plan EXECUTED

Everything below is implemented on branch `supply-chain-fixes` and verified against the full local CI checklist (backend: ruff · format · mypy · alembic · **792/792 tests**; frontend: eslint · tsc · prettier · **298/298 vitest** · vite build · api-types freshness · i18n parity).

**Backend (P0 + P1 + P3):**
- Bumped: authlib 1.6.11→1.7.2, fastapi 0.136→0.139.2, starlette 1.0.0→1.3.1, python-multipart →0.0.32, pillow →12.3.0, pydantic-settings →2.14.2, cryptography 46→49.0.0, mako/click/idna to fixed versions.
- **WeasyPrint 63.1→68.1** — the `<64` pin's stated reason didn't survive contact with the code: `pdf_sha256` is recorded at issuance and verified against *stored* bytes, so a renderer upgrade never invalidates archived invoices. Determinism only needs to hold within one version, and the same-process determinism tests **passed unchanged** — no test relaxation was needed (no cross-version byte-hash pins existed; the pinned hashes are HTML-layer).
- **python-jose replaced with PyJWT 2.13** (`app/core/security.py` — same encode/decode API; `JWTError` aliased to `PyJWTError`, all consumers import via the re-export). Removes `ecdsa` (unfixed PYSEC-2026-1325), `pyasn1`, `rsa`, `python-jose` from the tree entirely.
- Fallout fixed: (a) Starlette 1.3 renamed the 422 constant — `HTTP_422_UNPROCESSABLE_ENTITY` → `HTTP_422_UNPROCESSABLE_CONTENT` across 14 routers + tests (deprecation warning was promoted to error by pytest config); (b) dev-default JWT secret lengthened to ≥32 bytes (PyJWT enforces RFC 7518 HS256 key-length as a warning; prod secrets shorter than 32 bytes now warn at runtime — intentional pressure, no hard enforcement so existing deployments can't brick).
- **`pip-audit` after: 1 finding total** — weasyprint PYSEC-2026-3412, which has **no fixed release upstream**. Accepted/watch: the renderer only processes app-generated invoice HTML from DB fields, never attacker-supplied markup.

**Frontend (P0 + P1):**
- vite 5.4→6.4.3, vitest 2.1→3.2.7 (+ coverage-v8 3.2.7), esbuild →0.25.12, react-router-dom →6.30.4, ws →8.21.1, form-data →4.0.6, js-yaml →4.3.0 (via a pnpm override — `@redocly/openapi-core` held 4.1.1), @babel/core →fixed.
- **`pnpm audit` after: zero known vulnerabilities** (was 16).

**Hardening (P2):**
- `frontend/pnpm-workspace.yaml`: added `minimumReleaseAge: 4320` (3-day cooldown) + empty `minimumReleaseAgeExclude` escape hatch; kept the proven `allowBuilds` allowlist; deleted the dead `pnpm` block from `package.json`.
- `.github/workflows/ci.yml`: all actions pinned to commit SHAs (with `# vN` comments); `uv sync --locked` in both backend-touching jobs; **PNPM_VERSION 10→11** (CI was silently drifting from the pnpm 11 that writes the lockfile and owns the workspace settings).
- New `.github/workflows/security-audit.yml`: weekly (Mon 06:00 UTC) + manual pip-audit + pnpm audit sweep, SHA-pinned actions, `contents: read` only.
- `docker-compose.prod.yml`: postgres pinned by manifest digest; `fix-docker.sh`: uv installer pinned to 0.11.26.
- Project `.mcp.json`: `@playwright/mcp` pinned to 0.0.78 (replaces reliance on the plugin's `@latest`). **Owner action:** disable the `playwright` plugin toggle in Claude Code settings to avoid a duplicate server — the pinned project one takes over.

**Deferred/not done:** enforcing a hard minimum JWT-secret length in prod config (could brick an existing deployment on restart); digest-pinning the CI `services.postgres` image (kept on tag — CI-only blast radius, and the weekly audit covers advisories).

## Sources (research pass)

- Unit42 npm tracker: https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/ · Shai-Hulud: https://unit42.paloaltonetworks.com/npm-supply-chain-attack/
- Socket — qix: https://socket.dev/blog/npm-author-qix-compromised-in-major-supply-chain-attack · Mini Shai-Hulud: https://socket.dev/supply-chain-attacks/mini-shai-hulud · payment-SDK typosquats: https://socket.dev/blog/npm-pypi-campaign-typosquats-popular-secure-payment-apps
- eslint-config-prettier: https://www.stepsecurity.io/blog/supply-chain-security-alert-eslint-config-prettier-package-shows-signs-of-compromise · https://www.wiz.io/vulnerability-database/cve/cve-2025-54313
- nx s1ngularity: https://www.stepsecurity.io/blog/supply-chain-security-alert-popular-nx-build-system-package-compromised-with-data-stealing-malware · https://thehackernews.com/2025/08/malicious-nx-packages-in-s1ngularity.html
- Shai-Hulud 2.0: https://blog.checkpoint.com/research/shai-hulud-2-0-inside-the-second-coming-the-most-aggressive-npm-supply-chain-attack-of-2025/ · https://securitylabs.datadoghq.com/articles/shai-hulud-2.0-npm-worm/ · https://www.wiz.io/blog/shai-hulud-2-0-ongoing-supply-chain-attack
- TanStack wave: https://www.stepsecurity.io/blog/mini-shai-hulud-is-back-a-self-spreading-supply-chain-attack-hits-the-npm-ecosystem · https://snyk.io/blog/tanstack-npm-packages-compromised/ · https://www.wiz.io/blog/mini-shai-hulud-strikes-again-tanstack-more-npm-packages-compromised
- @antv wave: https://research.jfrog.com/post/shai-hulud-here-we-go-again-may19/ · https://www.stepsecurity.io/blog/shai-hulud-here-we-go-again-mass-npm-supply-chain-attack-hits-the-antv-ecosystem
- axios: https://www.trendmicro.com/en_us/research/26/c/axios-npm-package-compromised.html · Mastra: https://www.microsoft.com/en-us/security/blog/2026/06/17/postinstall-payload-inside-mastra-npm-supply-chain-compromise/
- PyPI: https://www.aikido.dev/blog/pytorch-lightning-pypi-compromise-mini-shai-hulud · https://about.gitlab.com/blog/shai-hulud-copycat-campaign-targets-python-developers/ · https://blog.checkpoint.com/securing-the-cloud/pypi-inundated-by-malicious-typosquatting-campaign/
- Claude Code CVEs: https://research.checkpoint.com/2026/rce-and-api-token-exfiltration-through-claude-code-project-files-cve-2025-59536/ · https://thehackernews.com/2026/02/claude-code-flaws-allow-remote-code.html
- Skill/MCP ecosystem: https://pluto.security/blog/claude-extension-ecosystem-security-practitioner-guide/ · https://www.practical-devsecops.com/mcp-security-statistics-2026-report/ (ToxicSkills/Snyk via secondary coverage)
- Mitigations: https://pnpm.io/supply-chain-security · https://pnpm.io/blog/2025/12/05/newsroom-npm-supply-chain-security · https://github.com/orgs/community/discussions/179562 · https://pumasecurity.io/resources/blog/teampcp-github-actions-supply-chain/

---
*Generated by the 2026-07-22 supply-chain audit session. Local scans: pnpm audit (GHSA), pip-audit (PYSEC/OSV/GHSA), lockfile provenance greps, plugin/hook full-content review.*
