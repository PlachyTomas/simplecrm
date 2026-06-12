import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type CalendarEventOut = components["schemas"]["CalendarEventOut"];
export type CalendarEventCreate = components["schemas"]["CalendarEventCreate"];
export type CalendarEventUpdate = components["schemas"]["CalendarEventUpdate"];
export type EventsPage = components["schemas"]["Page_CalendarEventOut_"];

export interface UseEventsOptions {
  /** ISO datetime — events overlapping [from, to) */
  from?: string;
  to?: string;
  dealId?: string;
  limit?: number;
}

export function useEvents({ from, to, dealId, limit = 200 }: UseEventsOptions = {}) {
  const { accessToken } = useAuth();
  return useQuery<EventsPage>({
    queryKey: ["events", { from, to, dealId, limit }],
    enabled: !!accessToken,
    placeholderData: keepPreviousData,
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (dealId) params.set("deal_id", dealId);
      return apiFetch<EventsPage>(`/api/v1/events?${params}`, { token: accessToken });
    },
  });
}

function invalidateEvents(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["events"] });
}

export function useCreateEvent() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<CalendarEventOut, Error, CalendarEventCreate>({
    mutationFn: (payload) =>
      apiFetch<CalendarEventOut>("/api/v1/events", {
        method: "POST",
        token: accessToken,
        body: payload,
      }),
    onSuccess: () => invalidateEvents(qc),
  });
}

export function useUpdateEvent() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<CalendarEventOut, Error, { eventId: string; patch: CalendarEventUpdate }>({
    mutationFn: ({ eventId, patch }) =>
      apiFetch<CalendarEventOut>(`/api/v1/events/${eventId}`, {
        method: "PUT",
        token: accessToken,
        body: patch,
      }),
    onSuccess: () => invalidateEvents(qc),
  });
}

export function useDeleteEvent() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (eventId) =>
      apiFetch<void>(`/api/v1/events/${eventId}`, { method: "DELETE", token: accessToken }),
    onSuccess: () => invalidateEvents(qc),
  });
}
