import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

import i18n, { i18nInitPromise } from "@/lib/i18n";

// jsdom doesn't ship matchMedia — tests assume a dark-preferring UA by default.
if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// Wait for the initial detector-driven language load (jsdom reports en-US)
// to fully settle before overriding — see i18nInitPromise's doc comment.
await i18nInitPromise;
await i18n.changeLanguage("cs");
