import { useEffect, useState } from "react";

import { useModalDialog } from "@/lib/useModalDialog";

const LOST_REASONS = [
  "Cena",
  "Konkurence",
  "Nevhodný čas",
  "Rozpočet",
  "Nedosaženo dohody",
  "Jiný",
];

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
  const dialogRef = useModalDialog<HTMLDivElement>(onClose, open);
  const [reason, setReason] = useState(LOST_REASONS[0]);
  const [custom, setCustom] = useState("");

  useEffect(() => {
    if (open) {
      setReason(LOST_REASONS[0]);
      setCustom("");
    }
  }, [open]);

  if (!open) return null;

  const finalReason = reason === "Jiný" ? custom.trim() : reason;

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
          Označit jako neúspěch
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          {dealName ? (
            <>
              Obchod <strong className="text-text-primary">{dealName}</strong>. Vyberte hlavní
              důvod, abychom mohli sestavit report neúspěšných obchodů.
            </>
          ) : (
            "Vyberte hlavní důvod, abychom mohli sestavit report neúspěšných obchodů."
          )}
        </p>
        <fieldset className="mt-4 space-y-2">
          <legend className="sr-only">Důvod</legend>
          {LOST_REASONS.map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="lost-reason"
                value={opt}
                checked={reason === opt}
                onChange={() => setReason(opt)}
              />
              {opt}
            </label>
          ))}
        </fieldset>
        {reason === "Jiný" ? (
          <label className="mt-3 block">
            <span className="text-xs font-medium text-text-secondary">Vlastní důvod</span>
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
            Zrušit
          </button>
          <button
            type="submit"
            disabled={pending || !finalReason}
            className="inline-flex h-10 items-center justify-center rounded-md bg-danger px-5 text-sm font-medium text-white transition-colors duration-fast hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Ukládám…" : "Uložit"}
          </button>
        </div>
      </form>
    </div>
  );
}
