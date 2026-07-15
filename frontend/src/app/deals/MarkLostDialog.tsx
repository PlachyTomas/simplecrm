import { useEffect, useState } from "react";
import type { ParseKeys } from "i18next";
import { useTranslation } from "react-i18next";

import { useModalDialog } from "@/lib/useModalDialog";

const LOST_REASON_KEYS = [
  "price",
  "competition",
  "badTiming",
  "budget",
  "noAgreement",
  "other",
] as const;
type LostReasonKey = (typeof LOST_REASON_KEYS)[number];

const LOST_REASON_LABEL_KEY: Record<LostReasonKey, ParseKeys<"deals">> = {
  price: "markLostDialog.reasons.price",
  competition: "markLostDialog.reasons.competition",
  badTiming: "markLostDialog.reasons.badTiming",
  budget: "markLostDialog.reasons.budget",
  noAgreement: "markLostDialog.reasons.noAgreement",
  other: "markLostDialog.reasons.other",
};

interface MarkLostDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  pending: boolean;
  dealName?: string;
}

export function MarkLostDialog({
  open,
  onClose,
  onConfirm,
  pending,
  dealName,
}: MarkLostDialogProps) {
  const { t, i18n } = useTranslation("deals");
  const dialogRef = useModalDialog<HTMLDivElement>(onClose, open);
  const [reason, setReason] = useState<LostReasonKey>(LOST_REASON_KEYS[0]);
  const [custom, setCustom] = useState("");

  useEffect(() => {
    if (open) {
      setReason(LOST_REASON_KEYS[0]);
      setCustom("");
    }
  }, [open]);

  if (!open) return null;

  // `lost_reason` is persisted as free text, so predefined reasons always
  // store the cs reference label regardless of the marker's UI language —
  // mixed-language values would fragment the lost-deals report.
  const finalReason =
    reason === "other"
      ? custom.trim()
      : i18n.getFixedT("cs", "deals")(LOST_REASON_LABEL_KEY[reason]);

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="mark-lost-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 px-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (finalReason) onConfirm(finalReason);
        }}
        className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-lg"
      >
        <h2 id="mark-lost-title" className="text-xl font-semibold">
          {t("markLostDialog.title")}
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          {dealName ? (
            <>
              {t("markLostDialog.bodyPrefix")}{" "}
              <strong className="text-text-primary">{dealName}</strong>.{" "}
              {t("markLostDialog.bodySuffix")}
            </>
          ) : (
            t("markLostDialog.bodySuffix")
          )}
        </p>
        <fieldset className="mt-4 space-y-2">
          <legend className="sr-only">{t("markLostDialog.reasonLegend")}</legend>
          {LOST_REASON_KEYS.map((key) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="lost-reason"
                value={key}
                checked={reason === key}
                onChange={() => setReason(key)}
              />
              {t(LOST_REASON_LABEL_KEY[key])}
            </label>
          ))}
        </fieldset>
        {reason === "other" ? (
          <label className="mt-3 block">
            <span className="text-xs font-medium text-text-secondary">
              {t("markLostDialog.customLabel")}
            </span>
            <input
              type="text"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              required
              maxLength={200}
              className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
          </label>
        ) : null}
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary"
          >
            {t("markLostDialog.cancel")}
          </button>
          <button
            type="submit"
            disabled={pending || !finalReason}
            className="inline-flex h-10 items-center justify-center rounded-md bg-danger px-5 text-sm font-medium text-white transition-colors duration-fast hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? t("markLostDialog.saving") : t("markLostDialog.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
