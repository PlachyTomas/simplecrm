/** Event emitted to reopen the cookie consent dialog from anywhere. */
export const COOKIE_CONSENT_REOPEN_EVENT = "simplecrm:cookie-consent:reopen";

/** Re-open the cookie dialog from any other component (e.g. footer link). */
export function openCookieSettings(): void {
  window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_REOPEN_EVENT));
}
