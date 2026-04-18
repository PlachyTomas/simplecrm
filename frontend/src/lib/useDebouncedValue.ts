import { useEffect, useState } from "react";

/**
 * Debounces a rapidly-changing value. Re-rendering the caller with the new
 * value happens only after `delayMs` of quiet.
 */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
