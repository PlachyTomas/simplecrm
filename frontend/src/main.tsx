import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "@/App";
import "@/index.css";
import { i18nInitPromise } from "@/lib/i18n";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("#root element not found — check #root in index.html");
}
const root = createRoot(rootElement);

// Mount only after i18next settles (same rule as test-setup.ts): rendering
// mid-init lets components capture a stale `resolvedLanguage` with no later
// event to re-render them — e.g. the language switcher checking cs on an
// en-resolved page. cs is bundled so the common case settles instantly; a
// failed catalog fetch still resolves init (fallback cs), never blanks the app.
void i18nInitPromise
  .catch(() => undefined)
  .then(() => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
