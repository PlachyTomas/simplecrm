import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, files);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

/**
 * G1 retired lime as the celebration accent in favor of magenta `#EC4899`.
 * This test guards against regressions: any new component code that pulls
 * in lime by hex or by Tailwind class will fail the suite.
 *
 * Allow-list: tokens.css references the historical lime hex inside a
 * comment explaining the retirement, so we skip token files entirely.
 */
const LIME_HEX = /#c9f24e|#a3e635|#84cc16/i;
const LIME_CLASS = /\b(?:bg|text|border|ring|fill|stroke)-lime-\d{2,3}\b/;
const GREEN_CELEBRATION_CLASS = /\bbg-green-(?:300|400|500)\b/;

describe("Lime retirement (G1)", () => {
  const root = join(__dirname, "..");
  const files = walk(root).filter(
    (f) =>
      !f.includes(`${"/"}__tests__${"/"}`) &&
      !f.endsWith(".generated.ts") &&
      !f.includes(`${"/"}theme${"/"}`),
  );

  it("no lime hex codes in any component file", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (LIME_HEX.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("no Tailwind lime classes in any component file", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (LIME_CLASS.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("no Tailwind green-* classes used as celebration cue", () => {
    // Green is allowed for the persistent "Vyhráno" record state via the
    // semantic `success` token, but raw `bg-green-400/500` is forbidden.
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (GREEN_CELEBRATION_CLASS.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
