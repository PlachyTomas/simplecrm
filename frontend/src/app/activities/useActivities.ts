import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type ActivityOut = components["schemas"]["ActivityOut"];
export type ActivitiesPage = components["schemas"]["Page_ActivityOut_"];
export type ActivityEntityType = components["schemas"]["ActivityEntityType"];

interface UseActivitiesOptions {
  entityType?: ActivityEntityType;
  entityId?: string;
  limit?: number;
}

export function useActivities({
  entityType,
  entityId,
  limit = 50,
}: UseActivitiesOptions = {}) {
  const { accessToken } = useAuth();
  return useQuery<ActivitiesPage>({
    queryKey: ["activities", { entityType, entityId, limit }],
    enabled: !!accessToken,
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (entityType) params.set("entity_type", entityType);
      if (entityId) params.set("entity_id", entityId);
      return apiFetch<ActivitiesPage>(`/api/v1/activities?${params}`, {
        token: accessToken,
      });
    },
  });
}
