import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { InstallNudge } from "@/app/pwa/InstallNudge";
import { shouldShowNudge } from "@/lib/pwaInstallPrefs";
import { testIds } from "@/lib/testids";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

function mockMobileViewport() {
  window.matchMedia = ((query: string) => ({
    matches: query === "(max-width: 767px)",
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe("InstallNudge", () => {
  const originalMatchMedia = window.matchMedia;
  const uaDescriptor = Object.getOwnPropertyDescriptor(window.navigator, "userAgent");

  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window.navigator, "userAgent", { value: IPHONE_UA, configurable: true });
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    if (uaDescriptor) Object.defineProperty(window.navigator, "userAgent", uaDescriptor);
    else Reflect.deleteProperty(window.navigator, "userAgent");
  });

  it("renders nothing on desktop viewports", () => {
    render(<InstallNudge />);
    expect(screen.queryByTestId(testIds.pwa.nudge)).not.toBeInTheDocument();
  });

  it("renders on mobile and snoozes via 'Later'", async () => {
    mockMobileViewport();
    render(<InstallNudge />);
    expect(screen.getByTestId(testIds.pwa.nudge)).toBeInTheDocument();
    await userEvent.click(screen.getByTestId(testIds.pwa.nudgeLater));
    expect(screen.queryByTestId(testIds.pwa.nudge)).not.toBeInTheDocument();
    expect(shouldShowNudge()).toBe(false);
    expect(shouldShowNudge(Date.now() + 15 * 24 * 60 * 60 * 1000)).toBe(true);
  });

  it("suppresses forever via 'Don't show again'", async () => {
    mockMobileViewport();
    render(<InstallNudge />);
    await userEvent.click(screen.getByTestId(testIds.pwa.nudgeNever));
    expect(screen.queryByTestId(testIds.pwa.nudge)).not.toBeInTheDocument();
    expect(shouldShowNudge(Date.now() + 365 * 24 * 60 * 60 * 1000)).toBe(false);
  });

  it("opens the iOS modal from Install on iOS and suppresses the nudge", async () => {
    mockMobileViewport();
    render(<InstallNudge />);
    await userEvent.click(screen.getByTestId(testIds.pwa.nudgeInstall));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByTestId(testIds.pwa.nudge)).not.toBeInTheDocument();
    expect(shouldShowNudge(Date.now() + 365 * 24 * 60 * 60 * 1000)).toBe(false);
  });

  it("does not render when already suppressed", () => {
    mockMobileViewport();
    localStorage.setItem("simplecrm-pwa-nudge", JSON.stringify({ never: true }));
    render(<InstallNudge />);
    expect(screen.queryByTestId(testIds.pwa.nudge)).not.toBeInTheDocument();
  });
});
