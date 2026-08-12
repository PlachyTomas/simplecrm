import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { ActivityOut } from "@/app/activities/useActivities";

// Plain object type aliases, not `interface` — an interface's properties
// aren't seen as satisfying `apiFetch`'s `Record<string, unknown>` body
// type, even though the shapes are compatible.
export type CreateDealActionInput = {
  label_id: string | null;
  body: string | null;
  occurred_at: string;
};

export type UpdateActivityPatch = {
  label_id?: string | null;
  body?: string | null;
  occurred_at?: string;
};

export type UpdateActivityInput = {
  id: string;
  patch: UpdateActivityPatch;
};

/**
 * Log an action the user carried out, at a time they choose — the deal
 * timeline's draft row. A successful write invalidates the whole
 * `["activities"]` prefix, same as `useCreateDealNote`/`useCreateDealCall`,
 * so the deal timeline, the pipeline card preview and the company tab all
 * refresh.
 */
export function useCreateDealAction(dealId: string | undefined) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<ActivityOut, Error, CreateDealActionInput>({
    mutationFn: (payload) =>
      apiFetch<ActivityOut>(`/api/v1/deals/${dealId}/actions`, {
        method: "POST",
        token: accessToken,
        body: payload,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["activities"] });
    },
  });
}

/**
 * Edit a hand-logged entry after the fact — the timeline is a record the
 * user maintains, not an append-only log. Only manual activities accept
 * this (`can_edit` on the row governs whether the UI offers it at all).
 */
export function useUpdateActivity() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<ActivityOut, Error, UpdateActivityInput>({
    mutationFn: ({ id, patch }) =>
      apiFetch<ActivityOut>(`/api/v1/activities/${id}`, {
        method: "PATCH",
        token: accessToken,
        body: patch,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["activities"] });
    },
  });
}

/** Remove a hand-logged entry. Automatic rows are never deletable. */
export function useDeleteActivity() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) =>
      apiFetch<void>(`/api/v1/activities/${id}`, { method: "DELETE", token: accessToken }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["activities"] });
    },
  });
}
