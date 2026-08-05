import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type EventLabelOut = components["schemas"]["EventLabelOut"];
export type EventLabelBrief = components["schemas"]["EventLabelBrief"];
export type EventLabelCreate = components["schemas"]["EventLabelCreate"];
export type EventLabelUpdate = components["schemas"]["EventLabelUpdate"];

/**
 * The label palette — the same eight hexes the backend validates against.
 * Data-driven colors, so they travel as inline styles rather than theme
 * tokens (the pipeline-stage exception in the ui-design skill).
 */
export const EVENT_LABEL_PALETTE = [
  "#6366F1",
  "#0EA5E9",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#EC4899",
  "#8B5CF6",
  "#64748B",
] as const;

/** Round-robins the palette so inline-created labels don't all come out indigo. */
export function nextEventLabelColor(existingCount: number): string {
  const index =
    ((existingCount % EVENT_LABEL_PALETTE.length) + EVENT_LABEL_PALETTE.length) %
    EVENT_LABEL_PALETTE.length;
  return EVENT_LABEL_PALETTE[index] ?? EVENT_LABEL_PALETTE[0];
}

/** Chip background: the label color at ~16% alpha (`29` = 41/255). */
export function labelTint(color: string): string {
  return `${color.slice(0, 7)}29`;
}

const LABELS_KEY = ["event-labels"] as const;

/** Org label vocabulary — small and unpaginated, ordered by name server-side. */
export function useEventLabels({ enabled = true }: { enabled?: boolean } = {}) {
  const { accessToken } = useAuth();
  return useQuery<EventLabelOut[]>({
    queryKey: LABELS_KEY,
    enabled: enabled && !!accessToken,
    queryFn: () => apiFetch<EventLabelOut[]>("/api/v1/event-labels", { token: accessToken }),
  });
}

function invalidateLabels(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: LABELS_KEY });
  // Events embed their labels' name and color, so a rename/recolor/delete
  // has to refresh the calendar's chips too.
  void qc.invalidateQueries({ queryKey: ["events"] });
}

export function useCreateEventLabel() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<EventLabelOut, Error, EventLabelCreate>({
    mutationFn: (payload) =>
      apiFetch<EventLabelOut>("/api/v1/event-labels", {
        method: "POST",
        token: accessToken,
        body: payload,
      }),
    onSuccess: () => invalidateLabels(qc),
  });
}

export function useUpdateEventLabel() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<EventLabelOut, Error, { labelId: string; patch: EventLabelUpdate }>({
    mutationFn: ({ labelId, patch }) =>
      apiFetch<EventLabelOut>(`/api/v1/event-labels/${labelId}`, {
        method: "PUT",
        token: accessToken,
        body: patch,
      }),
    onSuccess: () => invalidateLabels(qc),
  });
}

export function useDeleteEventLabel() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (labelId) =>
      apiFetch<void>(`/api/v1/event-labels/${labelId}`, { method: "DELETE", token: accessToken }),
    onSuccess: () => invalidateLabels(qc),
  });
}
