import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";

export function useDeleteCompany(companyId: string | undefined) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: () =>
      apiFetch<void>(`/api/v1/companies/${companyId}`, {
        method: "DELETE",
        token: accessToken,
      }),
    onSuccess: () => {
      // Refresh the list, but do NOT invalidate the deleted company's own
      // detail query: its observer is still mounted (the caller navigates away
      // right after this) and invalidating would refetch a now-404 row. The
      // stale cache entry is harmless and gets garbage-collected once inactive.
      void qc.invalidateQueries({ queryKey: ["companies"] });
    },
  });
}
