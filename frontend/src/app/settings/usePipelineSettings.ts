import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type PipelineSummary = components["schemas"]["PipelineSummary"];
export type StageOut = components["schemas"]["StageOut"];
export type StageCreate = components["schemas"]["StageCreate"];
export type StageUpdate = components["schemas"]["StageUpdate"];

export const PIPELINE_QUERY_KEY = ["pipeline", "default"] as const;

export function usePipeline() {
  const { accessToken } = useAuth();
  return useQuery<PipelineSummary>({
    queryKey: PIPELINE_QUERY_KEY,
    enabled: !!accessToken,
    staleTime: 30_000,
    queryFn: () => apiFetch<PipelineSummary>("/api/v1/pipelines/default", { token: accessToken }),
  });
}

function invalidatePipeline(qc: ReturnType<typeof useQueryClient>): Promise<void> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: PIPELINE_QUERY_KEY }),
    qc.invalidateQueries({ queryKey: ["pipeline", "default", "board"] }),
  ]).then(() => undefined);
}

export function useCreateStage() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<StageOut, Error, StageCreate>({
    mutationFn: (body) =>
      apiFetch<StageOut>("/api/v1/pipelines/default/stages", {
        method: "POST",
        token: accessToken,
        body,
      }),
    onSuccess: () => invalidatePipeline(qc),
  });
}

export function useUpdateStage() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<StageOut, Error, { id: string; patch: StageUpdate }>({
    mutationFn: ({ id, patch }) =>
      apiFetch<StageOut>(`/api/v1/pipelines/stages/${id}`, {
        method: "PATCH",
        token: accessToken,
        body: patch as unknown as Record<string, unknown>,
      }),
    onSuccess: () => invalidatePipeline(qc),
  });
}

export function useDeleteStage() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) =>
      apiFetch<void>(`/api/v1/pipelines/stages/${id}`, {
        method: "DELETE",
        token: accessToken,
      }),
    onSuccess: () => invalidatePipeline(qc),
  });
}

export function useReorderStages() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<PipelineSummary, Error, string[]>({
    mutationFn: (stageIds) =>
      apiFetch<PipelineSummary>("/api/v1/pipelines/default/reorder-stages", {
        method: "POST",
        token: accessToken,
        body: { stage_ids: stageIds },
      }),
    onSuccess: () => invalidatePipeline(qc),
  });
}
