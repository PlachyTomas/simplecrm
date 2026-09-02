import { describe, expect, it } from "vitest";

import {
  defaultSectionKey,
  isSettingsSectionKey,
  SETTINGS_SECTIONS,
  visibleSectionKeys,
} from "@/app/settings/settingsNav";

describe("settingsNav", () => {
  it("admins see all 16 sections", () => {
    expect(visibleSectionKeys("admin", false)).toHaveLength(16);
  });

  it("CSV import is a real section, admin-only", () => {
    expect(isSettingsSectionKey("import")).toBe(true);
    expect(visibleSectionKeys("admin", false)).toContain("import");
    expect(visibleSectionKeys("manager", true)).not.toContain("import");
    expect(visibleSectionKeys("salesperson", true)).not.toContain("import");
  });

  it("salespeople see personal sections plus the read-for-all ones", () => {
    // Email templates are readable by every role (they pick one when
    // composing), and so are sales goals (a rep has to see the number they
    // are measured against) and event labels (the shared vocabulary they
    // assign in the event form); these sections hide their write controls.
    expect(visibleSectionKeys("salesperson", false)).toEqual([
      "appearance",
      "integrations",
      "shortcuts",
      "email-templates",
      "sales-goals",
      "event-labels",
    ]);
  });

  it("invite privilege adds Pozvánky for non-admins", () => {
    expect(visibleSectionKeys("salesperson", true)).toEqual([
      "appearance",
      "integrations",
      "shortcuts",
      "email-templates",
      "sales-goals",
      "event-labels",
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
    expect(isSettingsSectionKey("email-templates")).toBe(true);
    expect(isSettingsSectionKey("sales-goals")).toBe(true);
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
