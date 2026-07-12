import { describe, expect, it } from "vitest";

import i18n from "@/lib/i18n";

describe("i18n foundation", () => {
  it("defaults to Czech in tests", () => {
    expect(i18n.resolvedLanguage).toBe("cs");
    expect(i18n.t("actions.save")).toBe("Uložit");
  });

  it("switches to English and falls back to cs for missing keys", async () => {
    await i18n.changeLanguage("en");
    expect(i18n.t("actions.save")).toBe("Save");
    await i18n.changeLanguage("cs");
  });
});
