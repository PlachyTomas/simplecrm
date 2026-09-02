import { type ReactNode, useId } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { testIds } from "@/lib/testids";
import { useModalDialog } from "@/lib/useModalDialog";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  open: boolean;
  /** 20/600 headline — a question the confirm button answers. */
  title: string;
  /** Optional explanatory body; pass a node when the copy needs emphasis. */
  body?: ReactNode;
  /** Imperative verb on the confirm button ("Smazat", "Znovu otevřít"). */
  confirmLabel: string;
  /** Shown on the confirm button while `pending`; falls back to `confirmLabel`. */
  pendingLabel?: string;
  /** Defaults to the shared `common:actions.cancel` label. */
  cancelLabel?: string;
  /** Destructive confirmation — red confirm button instead of the accent one. */
  danger?: boolean;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Shared yes/no confirmation modal (house modal pattern, §5.6). Replaces both
 * `window.confirm` and the per-page copies of the same panel — callers own the
 * copy and the mutation, this owns the chrome, the focus trap and Escape.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  pendingLabel,
  cancelLabel,
  danger,
  pending = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const { t } = useTranslation("common");
  const titleId = useId();
  const dialogRef = useModalDialog<HTMLDivElement>(onCancel, open);
  if (!open) return null;
  // Portaled to <body>: a transformed ancestor (a react-grid-layout cell)
  // would otherwise become the containing block for this fixed overlay.
  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 px-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-lg">
        <h2 id={titleId} className="text-xl font-semibold">
          {title}
        </h2>
        {body ? <div className="mt-2 text-sm text-text-secondary">{body}</div> : null}
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            data-testid={testIds.confirmDialog.cancel}
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary"
          >
            {cancelLabel ?? t("actions.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            data-testid={testIds.confirmDialog.confirm}
            className={cn(
              "inline-flex h-10 items-center justify-center rounded-md px-5 text-sm font-medium transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-60",
              danger
                ? "bg-danger text-white hover:opacity-90"
                : "bg-accent text-text-on-accent hover:bg-accent-hover",
            )}
          >
            {pending ? (pendingLabel ?? confirmLabel) : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
