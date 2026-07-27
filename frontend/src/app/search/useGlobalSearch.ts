import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type SearchHit = components["schemas"]["SearchHit"];
export type GlobalSearchResults = components["schemas"]["GlobalSearchResults"];

/** Below this the query is held — matches the backend's own `min_length`. */
export const MIN_SEARCH_LENGTH = 2;

export function useGlobalSearch(term: string) {
  const { accessToken } = useAuth();
  const trimmed = term.trim();
  const enabled = !!accessToken && trimmed.length >= MIN_SEARCH_LENGTH;
  return useQuery<GlobalSearchResults>({
    queryKey: ["global-search", trimmed],
    enabled,
    // Keep the previous hits on screen while the next term loads so the
    // dropdown doesn't flash empty between keystrokes.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: () =>
      apiFetch<GlobalSearchResults>(`/api/v1/search?q=${encodeURIComponent(trimmed)}`, {
        token: accessToken,
      }),
  });
}
