import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type PipelineBoard = components["schemas"]["PipelineBoard"];
export type BoardStage = components["schemas"]["BoardStage"];
export type BoardDeal = components["schemas"]["DealOut"];

export const BOARD_QUERY_KEY = ["pipeline", "default", "board"] as const;

export function usePipelineBoard() {
  const { accessToken } = useAuth();
  return useQuery<PipelineBoard>({
    queryKey: BOARD_QUERY_KEY,
    enabled: !!accessToken,
    queryFn: () =>
      apiFetch<PipelineBoard>("/api/v1/pipelines/default/board", { token: accessToken }),
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
      const previous = queryClient.getQueryData<PipelineBoard>(BOARD_QUERY_KEY);
      if (!previous) return { previous };

      // Optimistically move the deal between stages without waiting.
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
      queryClient.setQueryData<PipelineBoard>(BOARD_QUERY_KEY, {
        ...previous,
        stages: nextStages,
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      const ctx = context as { previous?: PipelineBoard } | undefined;
      if (ctx?.previous) {
        queryClient.setQueryData(BOARD_QUERY_KEY, ctx.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: BOARD_QUERY_KEY });
    },
  });
}
