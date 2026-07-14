import { Share, SquarePlus, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { testIds } from "@/lib/testids";
import { useModalDialog } from "@/lib/useModalDialog";

interface IosInstallModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * iOS has no install-prompt API — every install surface opens this sheet
 * with the two manual Add-to-Home-Screen steps instead.
 */
export function IosInstallModal({ open, onClose }: IosInstallModalProps) {
  const { t } = useTranslation("common");
  const dialogRef = useModalDialog<HTMLDivElement>(onClose, open);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 px-4 backdrop-blur-sm md:items-center"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ios-install-title"
        className="w-full max-w-lg rounded-t-lg border border-border bg-surface p-6 shadow-lg md:rounded-lg"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="ios-install-title" className="text-2xl font-semibold">
            {t("pwa.iosModal.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("actions.close")}
            className="rounded-md p-1 text-text-secondary transition-colors duration-fast hover:bg-surface-overlay hover:text-text-primary"
          >
            <X size={16} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
        <ol className="mt-4 space-y-3">
          <li className="flex items-center gap-3 text-sm text-text-secondary">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-subtle text-accent">
              <Share size={18} strokeWidth={1.75} aria-hidden />
            </span>
            {t("pwa.iosModal.step1")}
          </li>
          <li className="flex items-center gap-3 text-sm text-text-secondary">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-subtle text-accent">
              <SquarePlus size={18} strokeWidth={1.75} aria-hidden />
            </span>
            {t("pwa.iosModal.step2")}
          </li>
        </ol>
        <button
          type="button"
          data-testid={testIds.pwa.iosModalClose}
          onClick={onClose}
          className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
        >
          {t("pwa.iosModal.done")}
        </button>
      </div>
    </div>
  );
}
