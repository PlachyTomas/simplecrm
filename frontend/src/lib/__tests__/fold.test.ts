import { describe, expect, it } from "vitest";

import { fold, matches, matchesAny, matchesPhone } from "@/lib/fold";

describe("fold", () => {
  it("lowercases and strips Czech diacritics", () => {
    expect(fold("Brána")).toBe("brana");
    expect(fold("Škoda Auto")).toBe("skoda auto");
    expect(fold("Příliš žluťoučký kůň")).toBe("prilis zlutoucky kun");
    expect(fold("ČÍŽEK")).toBe("cizek");
  });

  it("leaves already-plain text alone", () => {
    expect(fold("brana")).toBe("brana");
    expect(fold("Alza.cz a.s.")).toBe("alza.cz a.s.");
  });

  it("maps letters that have no NFD decomposition the way unaccent does", () => {
    // These are single codepoints, not base + combining mark, so NFD alone
    // would leave them untouched and the two sides would disagree.
    expect(fold("Łódź")).toBe("lodz");
    expect(fold("Straße")).toBe("strasse");
    expect(fold("Ærø")).toBe("aero");
    expect(fold("Đakovo")).toBe("dakovo");
  });

  it("does not collapse distinct base letters", () => {
    expect(fold("Brána")).not.toBe(fold("Brno"));
    expect(fold("a")).not.toBe(fold("b"));
  });
});

describe("matches", () => {
  it("finds an accented name from a plain query", () => {
    expect(matches("Brána s.r.o.", "brana")).toBe(true);
  });

  it("finds a plain name from an accented query", () => {
    expect(matches("Brana s.r.o.", "Brána")).toBe(true);
  });

  it("matches on a substring, not just a prefix", () => {
    expect(matches("Dodávka pro Plzeň", "plzen")).toBe(true);
  });

  it("ignores whitespace around the query", () => {
    expect(matches("Brána", "  brana  ")).toBe(true);
  });

  it("returns false for a genuine non-match", () => {
    expect(matches("Brána", "brno")).toBe(false);
  });

  it("treats an empty query as 'match everything'", () => {
    expect(matches("cokoliv", "")).toBe(true);
    expect(matches("cokoliv", "   ")).toBe(true);
    expect(matches(null, "")).toBe(true);
  });

  it("never matches a null or undefined field against a real query", () => {
    expect(matches(null, "brana")).toBe(false);
    expect(matches(undefined, "brana")).toBe(false);
  });
});

describe("matchesAny", () => {
  const contact = ["Jana Svobodová", "jana@example.cz", null, "Rohlík.cz"];

  it("hits when any one field matches", () => {
    expect(matchesAny(contact, "svobodova")).toBe(true);
    expect(matchesAny(contact, "jana@")).toBe(true);
    expect(matchesAny(contact, "rohlik")).toBe(true);
  });

  it("misses when no field matches", () => {
    expect(matchesAny(contact, "novak")).toBe(false);
  });

  it("tolerates null fields without throwing", () => {
    expect(matchesAny([null, undefined], "brana")).toBe(false);
  });

  it("treats an empty query as 'match everything'", () => {
    expect(matchesAny(contact, "")).toBe(true);
  });
});

describe("matchesPhone", () => {
  const STORED = "+420 602 000 000";

  it("finds a spaced number from an unspaced query", () => {
    expect(matchesPhone(STORED, "602000000")).toBe(true);
  });

  it("finds it from the same spacing the user sees", () => {
    expect(matchesPhone(STORED, "602 000 000")).toBe(true);
  });

  it("ignores whichever separators either side happens to use", () => {
    expect(matchesPhone("602-000-000", "602 000 000")).toBe(true);
    expect(matchesPhone("602.000.000", "602000000")).toBe(true);
    expect(matchesPhone("(602) 000 000", "602000")).toBe(true);
  });

  it("matches with or without the country prefix, in both directions", () => {
    expect(matchesPhone(STORED, "+420602000000")).toBe(true);
    expect(matchesPhone(STORED, "420 602 000 000")).toBe(true);
    expect(matchesPhone("602000000", "+420 602 000 000")).toBe(false);
  });

  it("matches on a partial number, the way a half-remembered one is typed", () => {
    expect(matchesPhone(STORED, "602 00")).toBe(true);
    expect(matchesPhone(STORED, "000000")).toBe(true);
  });

  it("does not match a different number", () => {
    expect(matchesPhone(STORED, "603000000")).toBe(false);
    expect(matchesPhone(STORED, "777")).toBe(false);
  });

  it("ignores queries with fewer than three digits", () => {
    // A lone digit would otherwise match most of the phone book.
    expect(matchesPhone(STORED, "6")).toBe(false);
    expect(matchesPhone(STORED, "60")).toBe(false);
    expect(matchesPhone(STORED, "602")).toBe(true);
  });

  it("ignores a text query — the folded text path handles those", () => {
    expect(matchesPhone(STORED, "novak")).toBe(false);
    expect(matchesPhone(STORED, "")).toBe(false);
  });

  it("never matches a missing phone", () => {
    expect(matchesPhone(null, "602000000")).toBe(false);
    expect(matchesPhone(undefined, "602000000")).toBe(false);
  });

  it("still works when the field carries an extension alongside the number", () => {
    expect(matchesPhone("602 000 000 kl. 12", "602000000")).toBe(true);
  });
});
