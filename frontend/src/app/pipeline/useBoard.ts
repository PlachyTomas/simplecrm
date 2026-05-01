import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { invalidateDealReadModels } from "@/app/deals/cache";
import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type PipelineBoard = components["schemas"]["PipelineBoard"];
export type BoardStage = components["schemas"]["BoardStage"];
export type BoardDeal = components["schemas"]["DealOut"];

export const BOARD_QUERY_KEY = ["pipeline", "default", "board"] as const;

/** "all" disables the rolling window; numbers are days. */
export type WonWindow = number | "all";

export function usePipelineBoard(wonWindow: WonWindow = 30) {
  const { accessToken } = useAuth();
  return useQuery<PipelineBoard>({
    queryKey: [...BOARD_QUERY_KEY, { wonWindow }],
    enabled: !!accessToken,
    queryFn: () => {
      const params = new URLSearchParams();
      if (wonWindow !== "all") params.set("won_window_days", String(wonWindow));
      const qs = params.toString();
      return apiFetch<PipelineBoard>(
        `/api/v1/pipelines/default/board${qs ? `?${qs}` : ""}`,
        { token: accessToken },
      );
    },
    staleTime: 15_000,
  });
}

export function useMoveDealStage() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<BoardDeal, Error, { dealId: string; stageId: string }>({
    mutationFn: ({ dealId, stageId }) =>
      apiFetch<BoardDeal>(`/api/v1/deals/${dealId}/move-stage`, {
        method: "POST",
        token: accessToken,
        body: { stage_id: stageId },
      }),
    onMutate: async ({ dealId, stageId }) => {
      await queryClient.cancelQueries({ queryKey: BOARD_QUERY_KEY });
      // The board is keyed by wonWindow now, so multiple variants may be
      // cached. Update every matching query so any other won-window the
      // user toggles back to also reflects the optimistic move.
      const snapshots = queryClient.getQueriesData<PipelineBoard>({
        queryKey: BOARD_QUERY_KEY,
      });
      for (const [key, previous] of snapshots) {
        if (!previous) continue;
        let movedDeal: BoardDeal | undefined;
        const afterRemoval = previous.stages.map((stage) => {
          const removed = stage.deals.find((d) => d.id === dealId);
          if (!removed) return stage;
          movedDeal = { ...removed, stage_id: stageId };
          const keep = stage.deals.filter((d) => d.id !== dealId);
          return { ...stage, deals: keep, deal_count: keep.length };
        });
        const moved = movedDeal;
        const nextStages = moved
          ? afterRemoval.map((stage) =>
              stage.id === stageId
                ? {
                    ...stage,
                    deals: [moved, ...stage.deals],
                    deal_count: stage.deal_count + 1,
                  }
                : stage,
            )
          : afterRemoval;
        queryClient.setQueryData<PipelineBoard>(key, {
          ...previous,
          stages: nextStages,
        });
      }
      return { snapshots };
    },
    onError: (_err, _vars, context) => {
      const ctx = context as
        | { snapshots?: [readonly unknown[], PipelineBoard | undefined][] }
        | undefined;
      if (ctx?.snapshots) {
        for (const [key, previous] of ctx.snapshots) {
          if (previous) queryClient.setQueryData(key, previous);
        }
      }
    },
    onSettled: (_data, _err, { dealId }) => {
      invalidateDealReadModels(queryClient, dealId);
    },
  });
}
