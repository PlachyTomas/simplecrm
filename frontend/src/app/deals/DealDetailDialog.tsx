import { useModalDialog } from "@/lib/useModalDialog";

import { DealDetail } from "./DealDetail";

interface DealDetailDialogProps {
  dealId: string;
  onClose: () => void;
}

/**
 * Large centered modal that hosts {@link DealDetail}. Built on the shared
 * `useModalDialog` (focus-trap + Escape + backdrop-click). The panel scrolls
 * internally so a long deal (with its events section) stays within the
 * viewport.
 */
export function DealDetailDialog({ dealId, onClose }: DealDetailDialogProps) {
  const dialogRef = useModalDialog<HTMLDivElement>(onClose, true);
  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Detail obchodu"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-bg/80 px-4 py-6 backdrop-blur-sm sm:py-10"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="my-auto w-full max-w-2xl rounded-lg border border-border bg-surface shadow-lg">
        <DealDetail dealId={dealId} onClose={onClose} />
      </div>
    </div>
  );
}
