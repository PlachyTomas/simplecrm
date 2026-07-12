import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type RegistryLookupResult = components["schemas"]["RegistryLookupResult"];

interface UseLookupOptions {
  country: string;
  number: string;
  enabled?: boolean;
  /** Which scope's endpoint to hit. "companies" is the default in-app
   * surface; "onboarding" is the parallel route for the create-org
   * wizard, where the caller has no organization yet. */
  scope?: "companies" | "onboarding";
}

/**
 * Lookup a company registration number against the business registry.
 * `enabled` gates the query so nothing fires until the caller is sure the
 * input is well-formed. Retries are disabled — a 404/429/502 should surface
 * immediately.
 */
export function useLookupRegistry({
  country,
  number,
  enabled = true,
  scope = "companies",
}: UseLookupOptions) {
  const { accessToken } = useAuth();
  return useQuery<RegistryLookupResult>({
    queryKey: ["registry-lookup", scope, country, number],
    enabled: enabled && !!accessToken && number.length === 8,
    retry: false,
    staleTime: 24 * 60 * 60 * 1000,
    queryFn: () =>
      apiFetch<RegistryLookupResult>(
        `/api/v1/${scope}/lookup-registry?country=${encodeURIComponent(country)}&number=${encodeURIComponent(number)}`,
        { token: accessToken },
      ),
  });
}
