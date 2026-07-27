/**
 * Monthly sales goals (`/api/v1/sales-goals`).
 *
 * The list endpoint already carries live progress per goal, so there is no
 * separate "progress" query — one request feeds both the settings list and
 * the dashboard widget, and both therefore show the same numbers.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import { formatMoney, formatNumber } from "@/lib/format";
import type { components } from "@/types/api.generated";

export type SalesGoal = components["schemas"]["SalesGoalProgress"];
export type SalesGoalMetric = components["schemas"]["SalesGoalMetric"];
type SalesGoalList = components["schemas"]["SalesGoalList"];

export interface SalesGoalInput extends Record<string, unknown> {
  user_id: string | null;
  period_month: string;
  metric: SalesGoalMetric;
  target_value: string;
}

/** ISO first-of-month for the month `date` falls in (local time, like the UI). */
export function firstOfMonth(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

/** A goal's amount reads as money or as a plain count, per its metric. */
export function formatGoalAmount(
  value: string | number,
  metric: SalesGoalMetric,
  currency: string,
  locale: string,
): string {
  return metric === "won_count"
    ? formatNumber(Number(value), locale)
    : formatMoney(value, currency, locale);
}

export const SALES_GOALS_QUERY_KEY = ["sales-goals"] as const;

export function useSalesGoals(month: string = firstOfMonth()) {
  const { accessToken } = useAuth();
  return useQuery<SalesGoalList>({
    queryKey: [...SALES_GOALS_QUERY_KEY, month],
    enabled: !!accessToken,
    staleTime: 30_000,
    queryFn: () =>
      apiFetch<SalesGoalList>(`/api/v1/sales-goals?month=${encodeURIComponent(month)}`, {
        token: accessToken,
      }),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: SALES_GOALS_QUERY_KEY });
}

export function useCreateSalesGoal() {
  const { accessToken } = useAuth();
  const invalidate = useInvalidate();
  return useMutation<SalesGoal, Error, SalesGoalInput>({
    mutationFn: (body) =>
      apiFetch<SalesGoal>("/api/v1/sales-goals", { method: "POST", token: accessToken, body }),
    onSuccess: invalidate,
  });
}

export function useUpdateSalesGoal() {
  const { accessToken } = useAuth();
  const invalidate = useInvalidate();
  return useMutation<SalesGoal, Error, { id: string; body: SalesGoalInput }>({
    mutationFn: ({ id, body }) =>
      apiFetch<SalesGoal>(`/api/v1/sales-goals/${id}`, {
        method: "PUT",
        token: accessToken,
        body,
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteSalesGoal() {
  const { accessToken } = useAuth();
  const invalidate = useInvalidate();
  return useMutation<void, Error, string>({
    mutationFn: (id) =>
      apiFetch<void>(`/api/v1/sales-goals/${id}`, { method: "DELETE", token: accessToken }),
    onSuccess: invalidate,
  });
}
