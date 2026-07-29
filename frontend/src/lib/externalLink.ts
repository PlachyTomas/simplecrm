/**
 * Spread onto any `<a>` that leaves SimpleCRM — a customer's website, ARES,
 * our own marketing pages.
 *
 * A link out of the CRM should never replace the tab the user is working in:
 * they lose the record they were on, their scroll position and their filters,
 * and the only way back is the browser's Back button. `noopener` is not
 * optional alongside `target="_blank"` — without it the opened page gets a
 * `window.opener` handle back into ours.
 *
 * Internal navigation stays in-tab and goes through react-router's `<Link>`.
 * `mailto:` and `tel:` links must NOT use this: they hand off to a mail or
 * phone handler and a blank tab would be left stranded behind them.
 */
export const externalLinkProps = {
  target: "_blank",
  rel: "noopener noreferrer",
} as const;
