/**
 * Case- and diacritic-insensitive matching for lists we filter in the browser.
 *
 * The server-side counterpart is `backend/app/db/search.py`, which leans on
 * Postgres' `unaccent`. Both sides fold the query *and* the data, so "brana"
 * finds "Brána" and "Brána" finds "Brana".
 *
 * NFD decomposition plus stripping combining marks covers every Czech letter
 * and most of Latin-1, but a handful of letters have no decomposition at all —
 * `ł` is its own codepoint, not `l` + a stroke. Those are listed explicitly
 * below, with the same targets `unaccent` picks, so a name renders identically
 * whether a given screen filters on the server or in the browser.
 *
 * This is not a byte-for-byte reimplementation of `unaccent.rules`; it covers
 * the European alphabets a Czech CRM realistically stores. Anything outside
 * that set simply folds to itself on both sides, which is still consistent.
 */

/** Letters with no NFD decomposition, mapped the way `unaccent` maps them. */
const NON_DECOMPOSING: Record<string, string> = {
  ł: "l",
  ø: "o",
  đ: "d",
  ß: "ss",
  æ: "ae",
  œ: "oe",
  þ: "th",
  ð: "d",
};

const NON_DECOMPOSING_RE = new RegExp(`[${Object.keys(NON_DECOMPOSING).join("")}]`, "g");

/** Lowercase and strip diacritics: `"Brána"` → `"brana"`. */
export function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(NON_DECOMPOSING_RE, (char) => NON_DECOMPOSING[char] ?? char);
}

/**
 * Does `haystack` contain `needle`, ignoring case and diacritics?
 *
 * An empty (or whitespace-only) needle matches everything, which is what a
 * cleared search box should do.
 */
export function matches(haystack: string | null | undefined, needle: string): boolean {
  const query = fold(needle.trim());
  if (!query) return true;
  if (!haystack) return false;
  return fold(haystack).includes(query);
}

/** `matches` against several fields at once — true if any of them hits. */
export function matchesAny(haystacks: (string | null | undefined)[], needle: string): boolean {
  const query = fold(needle.trim());
  if (!query) return true;
  return haystacks.some((h) => (h ? fold(h).includes(query) : false));
}

/** Everything that isn't a digit: separators, `+`, parentheses, letters. */
const NON_DIGIT_RE = /\D/g;

/**
 * Does `phone` contain `needle`, ignoring how either one is spaced?
 *
 * Phone numbers get written a dozen ways — `602 000 000`, `602000000`,
 * `+420 602 000 000`, `+420-602-000-000` — and a plain substring search treats
 * those as different strings. Reducing both sides to their digits makes the
 * separators stop mattering; the `+420` prefix then falls out for free, because
 * the typed digits are a substring of the stored ones either way.
 *
 * Queries with fewer than three digits return false: a lone "6" would otherwise
 * match most of the phone book, and such a query is far more likely to be aimed
 * at a name than at a number.
 *
 * This is a *supplement* to the plain folded match, not a replacement — a field
 * holding something like "602 000 000 kl. 12" still needs the text path to
 * search the non-numeric part.
 */
export function matchesPhone(phone: string | null | undefined, needle: string): boolean {
  if (!phone) return false;
  const query = needle.replace(NON_DIGIT_RE, "");
  if (query.length < 3) return false;
  return phone.replace(NON_DIGIT_RE, "").includes(query);
}
