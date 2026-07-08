import { describe, expect, it } from "vitest";

import {
  HERO_BLOB_DEFAULTS,
  heroBlobStyle,
  resolveHeroBlobConfig,
} from "@/marketing/heroBlobs";

describe("resolveHeroBlobConfig", () => {
  it("uses defaults when no env vars are set", () => {
    expect(resolveHeroBlobConfig({})).toEqual(HERO_BLOB_DEFAULTS);
  });

  it("parses valid numeric overrides", () => {
    expect(
      resolveHeroBlobConfig({
        VITE_HERO_BLOB_SPEED: "4",
        VITE_HERO_BLOB_ERRATICITY: "1.5",
        VITE_HERO_BLOB_TRAVEL: "0.5",
      }),
    ).toEqual({ speed: 4, erraticity: 1.5, travel: 0.5 });
  });

  it("falls back on empty, non-numeric, or non-string values", () => {
    expect(
      resolveHeroBlobConfig({
        VITE_HERO_BLOB_SPEED: "",
        VITE_HERO_BLOB_ERRATICITY: "fast",
        VITE_HERO_BLOB_TRAVEL: undefined,
      }),
    ).toEqual(HERO_BLOB_DEFAULTS);
    // Booleans (Vite's DEV/PROD shape) are not strings → fall back too.
    expect(resolveHeroBlobConfig({ VITE_HERO_BLOB_SPEED: true }).speed).toBe(
      HERO_BLOB_DEFAULTS.speed,
    );
  });

  it("clamps out-of-range values to the guard rails", () => {
    // speed floor keeps the duration divisor > 0; ceiling caps franticness.
    expect(resolveHeroBlobConfig({ VITE_HERO_BLOB_SPEED: "0" }).speed).toBe(0.25);
    expect(resolveHeroBlobConfig({ VITE_HERO_BLOB_SPEED: "-5" }).speed).toBe(0.25);
    expect(resolveHeroBlobConfig({ VITE_HERO_BLOB_SPEED: "999" }).speed).toBe(10);
    expect(resolveHeroBlobConfig({ VITE_HERO_BLOB_ERRATICITY: "99" }).erraticity).toBe(3);
    expect(resolveHeroBlobConfig({ VITE_HERO_BLOB_TRAVEL: "-1" }).travel).toBe(0);
  });
});

describe("heroBlobStyle", () => {
  it("emits the CSS custom properties the keyframes consume", () => {
    const style = heroBlobStyle({ speed: 2.5, erraticity: 1, travel: 1.2 }) as Record<
      string,
      string
    >;
    expect(style["--hero-blob-speed"]).toBe("2.5");
    expect(style["--hero-blob-erraticity"]).toBe("1");
    expect(style["--hero-blob-travel"]).toBe("1.2");
  });
});
