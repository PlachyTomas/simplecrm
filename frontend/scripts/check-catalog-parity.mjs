import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../src/locales");
const REF = "cs";
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

function flatten(obj, prefix = "", out = new Set()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flatten(v, key, out);
    else out.add(key.replace(PLURAL_SUFFIX, ""));
  }
  return out;
}

const locales = readdirSync(ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);
const refFiles = readdirSync(path.join(ROOT, REF)).filter((f) => f.endsWith(".json"));
const errors = [];

for (const locale of locales.filter((l) => l !== REF)) {
  for (const file of refFiles) {
    const refKeys = flatten(JSON.parse(readFileSync(path.join(ROOT, REF, file), "utf8")));
    let target;
    try {
      target = JSON.parse(readFileSync(path.join(ROOT, locale, file), "utf8"));
    } catch {
      errors.push(`${locale}/${file}: missing file`);
      continue;
    }
    const targetKeys = flatten(target);
    for (const k of refKeys)
      if (!targetKeys.has(k)) errors.push(`${locale}/${file}: missing "${k}"`);
    for (const k of targetKeys)
      if (!refKeys.has(k)) errors.push(`${locale}/${file}: orphan "${k}" (not in ${REF})`);
  }
}

if (errors.length) {
  console.error(`Catalog parity FAILED (${errors.length}):\n` + errors.join("\n"));
  process.exit(1);
}
console.log(`Catalog parity OK (${locales.length - 1} locale(s) vs ${REF}).`);
