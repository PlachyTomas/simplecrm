import { describe, expect, it } from "vitest";

import {
  defaultSectionKey,
  isSettingsSectionKey,
  SETTINGS_SECTIONS,
  visibleSectionKeys,
} from "@/app/settings/settingsNav";

describe("settingsNav", () => {
  it("admins see all 11 sections", () => {
    expect(visibleSectionKeys("admin", false)).toHaveLength(11);
  });

  it("salespeople see only personal sections", () => {
    expect(visibleSectionKeys("salesperson", false)).toEqual(["appearance", "integrations"]);
  });

  it("invite privilege adds Pozvánky for non-admins", () => {
    expect(visibleSectionKeys("salesperson", true)).toEqual([
      "appearance",
      "integrations",
      "invitations",
    ]);
  });

  it("default section: pipeline for admins, appearance otherwise", () => {
    expect(defaultSectionKey("admin", false)).toBe("pipeline");
    expect(defaultSectionKey("manager", false)).toBe("appearance");
  });

  it("isSettingsSectionKey guards slugs", () => {
    expect(isSettingsSectionKey("billing")).toBe(true);
    expect(isSettingsSectionKey("blocked-companies")).toBe(true);
    expect(isSettingsSectionKey("nonsense")).toBe(false);
    expect(isSettingsSectionKey(null)).toBe(false);
  });

  it("every section has an icon and a description key", () => {
    for (const s of SETTINGS_SECTIONS) {
      expect(s.icon).toBeTruthy();
      expect(s.descriptionKey.length).toBeGreaterThan(0);
    }
  });
});
