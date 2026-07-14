import { shouldShowNudge, snoozeNudge, suppressNudge } from "@/lib/pwaInstallPrefs";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("pwaInstallPrefs", () => {
  beforeEach(() => localStorage.clear());

  it("shows the nudge by default", () => {
    expect(shouldShowNudge()).toBe(true);
  });

  it("hides forever after suppressNudge", () => {
    suppressNudge();
    expect(shouldShowNudge()).toBe(false);
  });

  it("hides for 14 days after snoozeNudge, then shows again", () => {
    const now = 1_000_000;
    snoozeNudge(now);
    expect(shouldShowNudge(now)).toBe(false);
    expect(shouldShowNudge(now + 13 * DAY_MS)).toBe(false);
    expect(shouldShowNudge(now + 14 * DAY_MS)).toBe(true);
  });

  it("treats corrupt storage as default-visible", () => {
    localStorage.setItem("simplecrm-pwa-nudge", "{not json");
    expect(shouldShowNudge()).toBe(true);
  });
});
