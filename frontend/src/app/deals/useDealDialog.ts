import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Drives the deal-detail dialog from a `?deal=<id>` query param, so a deep
 * link (or the `/app/deals/:id` redirect) opens the dialog in place and
 * closing it clears the param. Mount `<DealDetailDialog>` when `dealId` is set;
 * wire card/row clicks to `openDeal(id)`.
 */
export function useDealDialog() {
  const [params, setParams] = useSearchParams();
  const dealId = params.get("deal");

  const openDeal = useCallback(
    (id: string) => {
      const next = new URLSearchParams(params);
      next.set("deal", id);
      setParams(next);
    },
    [params, setParams],
  );

  const closeDeal = useCallback(() => {
    const next = new URLSearchParams(params);
    next.delete("deal");
    // Replace so closing the dialog doesn't leave a back-button trap between
    // the open and closed states of the same page.
    setParams(next, { replace: true });
  }, [params, setParams]);

  return { dealId, openDeal, closeDeal };
}
