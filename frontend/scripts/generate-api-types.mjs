#!/usr/bin/env node
/**
 * Regenerate `src/types/api.generated.ts` from the backend's OpenAPI spec.
 *
 * Modes:
 *  - (default) Write the file; exit 0.
 *  - `--check` Regenerate into memory and compare to the committed file;
 *              exit non-zero if they differ. Used in CI.
 *
 * Spec source:
 *  - If `BACKEND_OPENAPI_URL` is set, fetch from that URL.
 *  - Otherwise, run `uv run python -c 'import json; from app.main import app;
 *    print(json.dumps(app.openapi()))'` from the backend dir. This lets devs
 *    regenerate without booting a server.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import openapiTS, { astToString } from "openapi-typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = resolve(__dirname, "..");
const BACKEND_DIR = resolve(FRONTEND_DIR, "..", "backend");
const OUT_PATH = resolve(FRONTEND_DIR, "src", "types", "api.generated.ts");

const checkMode = process.argv.includes("--check");

function loadSpecFromUrl(url) {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Failed to fetch ${url}: ${r.status}`);
    return r.json();
  });
}

function loadSpecFromBackend() {
  // Dump app.openapi() as JSON without booting a server. Uses the env vars
  // the dev container sets for uv's caches; if uv is configured normally,
  // passing them is a no-op.
  const result = spawnSync(
    "uv",
    [
      "run",
      "--project",
      BACKEND_DIR,
      "python",
      "-c",
      "import json; from app.main import app; print(json.dumps(app.openapi()))",
    ],
    { encoding: "utf8", env: process.env, cwd: BACKEND_DIR },
  );
  if (result.status !== 0) {
    console.error(result.stderr);
    throw new Error("Failed to extract OpenAPI spec from backend");
  }
  return JSON.parse(result.stdout);
}

async function main() {
  const url = process.env.BACKEND_OPENAPI_URL;
  const spec = url ? await loadSpecFromUrl(url) : loadSpecFromBackend();

  const ast = await openapiTS(spec);
  const contents =
    "/* eslint-disable */\n" +
    "/* prettier-ignore */\n" +
    "// AUTO-GENERATED — do not edit by hand.\n" +
    "// Run `pnpm run types:generate` to regenerate from the backend OpenAPI spec.\n" +
    "\n" +
    astToString(ast);

  if (checkMode) {
    let current = "";
    try {
      current = readFileSync(OUT_PATH, "utf8");
    } catch {
      current = "";
    }
    if (current !== contents) {
      console.error(
        "\nAPI types are out of date.\n" +
          "Run `pnpm run types:generate` and commit src/types/api.generated.ts.\n",
      );
      // Print a unified diff to help triage.
      try {
        execFileSync("diff", ["-u", OUT_PATH, "-"], {
          input: contents,
          stdio: ["pipe", "inherit", "inherit"],
        });
      } catch {
        /* diff exits non-zero when files differ; expected */
      }
      process.exit(1);
    }
    console.log("API types are up to date.");
    return;
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, contents);
  console.log(`Wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
