import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type RegistryLookupResult = components["schemas"]["RegistryLookupResult"];

interface UseLookupOptions {
  country: string;
  number: string;
  enabled?: boolean;
}

/**
 * Lookup an IČO against the business registry. `enabled` gates the query so
 * nothing fires until the caller is sure the input is well-formed. Retries
 * are disabled — a 404/429/502 should surface immediately.
 */
export function useLookupRegistry({ country, number, enabled = true }: UseLookupOptions) {
  const { accessToken } = useAuth();
  return useQuery<RegistryLookupResult>({
    queryKey: ["registry-lookup", country, number],
    enabled: enabled && !!accessToken && number.length === 8,
    retry: false,
    staleTime: 24 * 60 * 60 * 1000,
    queryFn: () =>
      apiFetch<RegistryLookupResult>(
        `/api/v1/companies/lookup-registry?country=${encodeURIComponent(country)}&number=${encodeURIComponent(number)}`,
        { token: accessToken },
      ),
  });
}
