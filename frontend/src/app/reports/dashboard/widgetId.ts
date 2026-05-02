/**
 * Client-side widget id generator. Backend accepts any string under
 * 64 chars and only uses the id to track positions across saves, so a
 * 16-byte random id is plenty. We avoid the full ULID dependency for
 * a few bytes of bundle.
 */
export function makeWidgetId(): string {
  const cryptoApi: Crypto | undefined =
    typeof globalThis !== "undefined"
      ? (globalThis as unknown as { crypto?: Crypto }).crypto
      : undefined;
  if (cryptoApi?.randomUUID) {
    return `wid_${cryptoApi.randomUUID().replace(/-/g, "")}`;
  }
  return `wid_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
