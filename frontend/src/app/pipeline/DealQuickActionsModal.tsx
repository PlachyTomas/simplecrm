import { CalendarPlus, Mail, StickyNote, X, type LucideIcon } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useCreateDealNote } from "@/app/activities/useActivities";
import { EmailComposeModal } from "@/app/emails/EmailComposeModal";
import { EventFormModal } from "@/app/events/EventFormModal";
import { isSmtpVerified, useSmtpSettings } from "@/app/settings/useSmtpSettings";
import { testIds } from "@/lib/testids";
import { useModalDialog } from "@/lib/useModalDialog";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/** The subset of a board deal the quick actions need. */
export interface QuickActionsDeal {
  id: string;
  name: string;
  company_id: string;
  company_name?: string;
}

interface DealQuickActionsModalProps {
  deal: QuickActionsDeal | null;
  open: boolean;
  /** Closes the whole flow (menu, note form, or a spawned modal). */
  onClose: () => void;
}

/**
 * Which surface is on screen. The email/event actions swap the menu out for
 * the existing full modal instead of nesting one inside the other — two live
 * focus traps would fight over Tab and Escape. Closing the spawned modal
 * closes the flow, putting the user back on the board.
 */
type View = "menu" | "note" | "email" | "event";

function ActionRow({
  icon: Icon,
  label,
  description,
  onClick,
  testId,
  disabled,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  description: string;
  onClick: () => void;
  testId: string;
  /** Renders the row inert (aria-disabled, still focusable) + shows `hint`. */
  disabled?: boolean;
  hint?: ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => {
          if (!disabled) onClick();
        }}
        aria-disabled={disabled || undefined}
        data-testid={testId}
        className={cn(
          "flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors duration-fast",
          disabled
            ? "cursor-not-allowed border-border-subtle opacity-60"
            : "border-border bg-surface hover:border-accent hover:bg-surface-overlay",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
            disabled ? "bg-surface-overlay text-text-tertiary" : "bg-accent-subtle text-accent",
          )}
        >
          <Icon size={18} strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-text-primary">{label}</span>
          <span className="block truncate text-xs text-text-tertiary">{description}</span>
        </span>
      </button>
      {disabled && hint ? <p className="mt-1 px-1 text-xs text-text-tertiary">{hint}</p> : null}
    </li>
  );
}

/**
 * Quick actions for one pipeline card: send an email, schedule an event, or
 * jot a note — all without leaving the board. Email and event hand off to the
 * app's existing modals (same validation, same suggestions); the note is a
 * two-field form right here, saved as an `note` activity on the deal.
 */
export function DealQuickActionsModal({ deal, open, onClose }: DealQuickActionsModalProps) {
  const { t } = useTranslation("deals");
  const [view, setView] = useState<View>("menu");
  const [note, setNote] = useState("");
  const { data: smtp } = useSmtpSettings();
  const smtpReady = isSmtpVerified(smtp);
  const createNote = useCreateDealNote(deal?.id);
  const toast = useToast();
  // Only trap focus while the menu/note surface itself is on screen — the
  // spawned email/event modals bring their own trap.
  const menuActive = open && (view === "menu" || view === "note");
  const dialogRef = useModalDialog<HTMLDivElement>(onClose, menuActive);

  useEffect(() => {
    if (open) {
      setView("menu");
      setNote("");
    }
  }, [open, deal?.id]);

  if (!open || !deal) return null;

  if (view === "email") {
    return (
      <EmailComposeModal open onClose={onClose} dealId={deal.id} companyId={deal.company_id} />
    );
  }

  if (view === "event") {
    return <EventFormModal open onClose={onClose} dealId={deal.id} dealName={deal.name} />;
  }

  const handleSaveNote = (event: FormEvent) => {
    event.preventDefault();
    const body = note.trim();
    if (!body || createNote.isPending) return;
    createNote.mutate(body, {
      onSuccess: () => {
        toast.success(t("quickActions.note.toastSaved"));
        onClose();
      },
      onError: () => toast.error(t("quickActions.note.toastError")),
    });
  };

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="deal-quick-actions-title"
      data-testid={testIds.pipeline.quickActions.modal}
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 px-0 backdrop-blur-sm md:items-center md:px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-t-lg border border-border bg-surface p-6 shadow-lg md:rounded-lg">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 id="deal-quick-actions-title" className="truncate text-lg font-semibold">
              {t("quickActions.title", { name: deal.name })}
            </h1>
            <p className="mt-1 truncate text-sm text-text-tertiary">
              {deal.company_name ?? t("quickActions.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("quickActions.close")}
            data-testid={testIds.pipeline.quickActions.close}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors duration-fast hover:bg-surface-overlay hover:text-text-primary"
          >
            <X size={18} strokeWidth={1.75} aria-hidden />
          </button>
        </div>

        {view === "menu" ? (
          <ul className="mt-5 space-y-2">
            <ActionRow
              icon={Mail}
              label={t("quickActions.email.label")}
              description={t("quickActions.email.description")}
              onClick={() => setView("email")}
              testId={testIds.pipeline.quickActions.email}
              disabled={!smtpReady}
              hint={t("quickActions.email.smtpHint")}
            />
            <ActionRow
              icon={CalendarPlus}
              label={t("quickActions.event.label")}
              description={t("quickActions.event.description")}
              onClick={() => setView("event")}
              testId={testIds.pipeline.quickActions.event}
            />
            <ActionRow
              icon={StickyNote}
              label={t("quickActions.note.label")}
              description={t("quickActions.note.description")}
              onClick={() => setView("note")}
              testId={testIds.pipeline.quickActions.note}
            />
          </ul>
        ) : (
          <form onSubmit={handleSaveNote} className="mt-5">
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">
                {t("quickActions.note.fieldLabel")}
              </span>
              <textarea
                autoFocus
                rows={4}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={2000}
                placeholder={t("quickActions.note.placeholder")}
                data-testid={testIds.pipeline.quickActions.noteInput}
                className="mt-2 block w-full resize-y rounded-md border border-border bg-surface-overlay px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
              />
            </label>
            {createNote.isError ? (
              <p
                className="mt-3 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger"
                role="alert"
              >
                {t("quickActions.note.toastError")}
              </p>
            ) : null}
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setView("menu")}
                data-testid={testIds.pipeline.quickActions.noteCancel}
                className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary"
              >
                {t("quickActions.note.cancel")}
              </button>
              <button
                type="submit"
                disabled={createNote.isPending || note.trim() === ""}
                data-testid={testIds.pipeline.quickActions.noteSave}
                className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {createNote.isPending
                  ? t("quickActions.note.saving")
                  : t("quickActions.note.submit")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
