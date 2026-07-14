import { act, renderHook } from "@testing-library/react";

import { usePwaInstall } from "@/lib/usePwaInstall";

function dispatchInstallPrompt(outcome: "accepted" | "dismissed" = "accepted") {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  const prompt = vi.fn().mockResolvedValue(undefined);
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome, platform: "web" }) });
  window.dispatchEvent(event);
  return { prompt };
}

describe("usePwaInstall", () => {
  afterEach(() => {
    // Clears the module-level captured prompt.
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
  });

  it("reports canPrompt=false with no captured event", () => {
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.canPrompt).toBe(false);
    expect(result.current.isInstalled).toBe(false);
    expect(result.current.isIos).toBe(false);
  });

  it("captures beforeinstallprompt and flips canPrompt", () => {
    const { result } = renderHook(() => usePwaInstall());
    act(() => {
      dispatchInstallPrompt();
    });
    expect(result.current.canPrompt).toBe(true);
  });

  it("promptInstall fires the native prompt, reports the outcome, and clears canPrompt", async () => {
    const { prompt } = dispatchInstallPrompt("accepted");
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.canPrompt).toBe(true);
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.promptInstall();
    });
    expect(prompt).toHaveBeenCalledOnce();
    expect(outcome).toBe("accepted");
    expect(result.current.canPrompt).toBe(false);
  });

  it("promptInstall returns 'unavailable' with no captured event", async () => {
    const { result } = renderHook(() => usePwaInstall());
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.promptInstall();
    });
    expect(outcome).toBe("unavailable");
  });

  it("reports isInstalled in standalone display-mode", () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === "(display-mode: standalone)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.isInstalled).toBe(true);
    window.matchMedia = original;
  });

  it("detects iOS from the user agent", () => {
    const descriptor = Object.getOwnPropertyDescriptor(window.navigator, "userAgent");
    Object.defineProperty(window.navigator, "userAgent", {
      value:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      configurable: true,
    });
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.isIos).toBe(true);
    if (descriptor) Object.defineProperty(window.navigator, "userAgent", descriptor);
    else Reflect.deleteProperty(window.navigator, "userAgent");
  });
});
