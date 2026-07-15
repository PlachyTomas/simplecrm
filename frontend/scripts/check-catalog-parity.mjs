import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../src/locales");
const REF = "cs";
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g;

/**
 * Integer plural categories a language must cover for every pluralized key.
 * Sampling 0–200 enumerates everything i18next will request for integer
 * counts (cs "many" only covers fractions, so it is deliberately optional).
 */
function integerPluralCategories(locale) {
  const rules = new Intl.PluralRules(locale);
  const cats = new Set();
  for (let n = 0; n <= 200; n += 1) cats.add(rules.select(n));
  return cats;
}

function flatten(obj, prefix = "", out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flatten(v, key, out);
    else out.set(key, String(v));
  }
  return out;
}

/** Group flat keys by plural base: "a.b_one" → base "a.b", variant "one"; plain keys get variant null. */
function byBase(flat) {
  const bases = new Map();
  for (const [key, value] of flat) {
    const m = key.match(PLURAL_SUFFIX);
    const base = m ? key.slice(0, -m[0].length) : key;
    let variants = bases.get(base);
    if (!variants) bases.set(base, (variants = new Map()));
    variants.set(m ? m[1] : null, value);
  }
  return bases;
}

function placeholderUnion(variants) {
  const out = new Set();
  for (const value of variants.values()) for (const m of value.matchAll(PLACEHOLDER)) out.add(m[1]);
  return out;
}

const locales = readdirSync(ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);
const targets = locales.filter((l) => l !== REF);
const errors = [];

if (!locales.includes(REF)) {
  console.error(`Catalog parity FAILED: reference locale directory ${REF}/ is missing.`);
  process.exit(1);
}
if (targets.length === 0) {
  console.error("Catalog parity FAILED: no target locales found next to the reference.");
  process.exit(1);
}

const refFiles = readdirSync(path.join(ROOT, REF)).filter((f) => f.endsWith(".json"));
const refBasesByFile = new Map(
  refFiles.map((file) => [
    file,
    byBase(flatten(JSON.parse(readFileSync(path.join(ROOT, REF, file), "utf8")))),
  ]),
);

// The reference itself must carry every integer plural category.
const refCats = integerPluralCategories(REF);
for (const [file, refBases] of refBasesByFile) {
  for (const [base, variants] of refBases) {
    if (variants.has(null)) continue;
    for (const cat of refCats)
      if (!variants.has(cat))
        errors.push(`${REF}/${file}: "${base}" missing plural category _${cat}`);
  }
}

for (const locale of targets) {
  const targetCats = integerPluralCategories(locale);
  const targetFiles = readdirSync(path.join(ROOT, locale)).filter((f) => f.endsWith(".json"));
  for (const extra of targetFiles.filter((f) => !refFiles.includes(f)))
    errors.push(`${locale}/${extra}: orphan namespace file (not in ${REF})`);

  for (const [file, refBases] of refBasesByFile) {
    let targetJson;
    try {
      targetJson = JSON.parse(readFileSync(path.join(ROOT, locale, file), "utf8"));
    } catch {
      errors.push(`${locale}/${file}: missing file`);
      continue;
    }
    const targetBases = byBase(flatten(targetJson));

    for (const [base, refVariants] of refBases) {
      const targetVariants = targetBases.get(base);
      if (!targetVariants) {
        errors.push(`${locale}/${file}: missing "${base}"`);
        continue;
      }

      const refPlural = !refVariants.has(null);
      const targetPlural = !targetVariants.has(null);
      if (refPlural !== targetPlural) {
        errors.push(
          `${locale}/${file}: "${base}" plural shape mismatch (${REF}: ${refPlural ? "plural" : "plain"}, ${locale}: ${targetPlural ? "plural" : "plain"})`,
        );
      } else if (refPlural) {
        for (const cat of targetCats)
          if (!targetVariants.has(cat))
            errors.push(`${locale}/${file}: "${base}" missing plural category _${cat}`);
      }

      const refPh = placeholderUnion(refVariants);
      const targetPh = placeholderUnion(targetVariants);
      for (const p of refPh)
        if (!targetPh.has(p))
          errors.push(`${locale}/${file}: "${base}" missing placeholder {{${p}}}`);
      for (const p of targetPh)
        if (!refPh.has(p))
          errors.push(
            `${locale}/${file}: "${base}" has extra placeholder {{${p}}} (not in ${REF})`,
          );
    }

    for (const base of targetBases.keys())
      if (!refBases.has(base)) errors.push(`${locale}/${file}: orphan "${base}" (not in ${REF})`);
  }
}

if (errors.length) {
  console.error(`Catalog parity FAILED (${errors.length}):\n` + errors.join("\n"));
  process.exit(1);
}
console.log(
  `Catalog parity OK (${targets.length} locale(s) vs ${REF}: keys, placeholders, plural categories).`,
);
