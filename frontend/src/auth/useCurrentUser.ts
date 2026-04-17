import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type CurrentUser = components["schemas"]["CurrentUser"];

export function useCurrentUser() {
  const { accessToken } = useAuth();
  return useQuery<CurrentUser>({
    queryKey: ["auth", "me"],
    enabled: !!accessToken,
    queryFn: () => apiFetch<CurrentUser>("/api/v1/auth/me", { token: accessToken }),
    retry: false,
  });
}
