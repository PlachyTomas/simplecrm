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

// vitest's jsdom global population loses localStorage's internal slot — the
// window getter exists but returns undefined (sessionStorage survives). Back
// it with an in-memory shim so storage-backed code is testable.
if (!window.localStorage) {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() {
        return store.size;
      },
    } satisfies Storage,
  });
}

// Wait for the initial detector-driven language load (jsdom reports en-US)
// to fully settle before overriding — see i18nInitPromise's doc comment.
await i18nInitPromise;
await i18n.changeLanguage("cs");
