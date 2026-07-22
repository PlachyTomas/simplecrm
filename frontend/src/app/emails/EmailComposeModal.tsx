import type { TFunction } from "i18next";
import { Paperclip, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { type SentEmailOut, useSendEmail } from "@/app/emails/useEmails";
import { useDismissGuard } from "@/lib/useDismissGuard";
import { useModalDialog } from "@/lib/useModalDialog";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface EmailComposeModalProps {
  open: boolean;
  onClose: () => void;
  dealId?: string;
  companyId?: string;
  /** Prefilled first recipient (deal primary contact ?? company email). */
  defaultTo?: string | null;
  /** When set, this is a follow-up to a previously sent email. */
  replyTo?: SentEmailOut | null;
}

function splitAddresses(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Client-side attachment guard. Mirrors the server allowlist + size cap so a
// bad file is caught before the multipart upload — keep in sync with
// backend/app/api/v1/bulk_email.py:36-47 (_ALLOWED_ATTACHMENT_TYPES).
const ALLOWED_ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
]);
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Validation message for an attachment, or `null` when it's allowed. */
function attachmentError(file: File, t: TFunction<"emails">): string | null {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return t("compose.attachmentTooLarge", { filename: file.name });
  }
  if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
    return t("compose.attachmentUnsupportedType", { filename: file.name });
  }
  return null;
}

function ChipsInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const { t } = useTranslation("emails");
  const [draft, setDraft] = useState("");
  const commit = (raw: string) => {
    const parts = splitAddresses(raw);
    if (parts.length) onChange([...value, ...parts]);
  };
  return (
    <label className="block">
      <span className="text-xs font-medium text-text-secondary">{label}</span>
      <div className="mt-1 flex flex-wrap items-center gap-1 rounded-md border border-border bg-surface-overlay px-2 py-1.5 focus-within:border-accent">
        {value.map((addr, i) => (
          <span
            key={`${addr}-${i}`}
            className="inline-flex items-center gap-1 rounded bg-surface-elevated px-2 py-0.5 text-xs text-text-primary"
          >
            {addr}
            <button
              type="button"
              aria-label={t("compose.removeRecipient", { address: addr })}
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="text-text-tertiary hover:text-danger"
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit(draft);
              setDraft("");
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => {
            if (draft.trim()) {
              commit(draft);
              setDraft("");
            }
          }}
          placeholder={value.length ? "" : placeholder}
          className="h-6 min-w-[8rem] flex-1 bg-transparent text-sm outline-none"
        />
      </div>
    </label>
  );
}

export function EmailComposeModal({
  open,
  onClose,
  dealId,
  companyId,
  defaultTo,
  replyTo,
}: EmailComposeModalProps) {
  const { t } = useTranslation("emails");
  const dialogRef = useModalDialog<HTMLDivElement>(onClose, open);
  const send = useSendEmail();
  const toast = useToast();

  const initial = useMemo(() => {
    if (replyTo) {
      const subj = replyTo.subject.startsWith("Re:") ? replyTo.subject : `Re: ${replyTo.subject}`;
      return { to: replyTo.to_emails, cc: replyTo.cc_emails, subject: subj };
    }
    return { to: defaultTo ? [defaultTo] : [], cc: [] as string[], subject: "" };
  }, [replyTo, defaultTo]);

  // Keyed remount (below) resets these on each open, so plain useState off the
  // memoized initial value is safe.
  const [to, setTo] = useState<string[]>(initial.to);
  const [cc, setCc] = useState<string[]>(initial.cc);
  const [bcc, setBcc] = useState<string[]>([]);
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  // Dirty = anything beyond the reply/defaultTo prefill.
  const dirty =
    body.trim() !== "" ||
    files.length > 0 ||
    bcc.length > 0 ||
    subject !== initial.subject ||
    to.join("\n") !== initial.to.join("\n") ||
    cc.join("\n") !== initial.cc.join("\n");
  const { onBackdropClick, nudgeClass } = useDismissGuard(onClose, dirty);

  if (!open) return null;

  const hasInvalidAttachment = files.some((f) => attachmentError(f, t) !== null);
  const canSend =
    to.length > 0 && subject.trim().length > 0 && !hasInvalidAttachment && !send.isPending;

  async function handleSend() {
    try {
      const result = await send.mutateAsync({
        payload: {
          to,
          cc,
          bcc,
          subject: subject.trim(),
          body,
          deal_id: dealId ?? null,
          company_id: companyId ?? null,
          reply_to_email_id: replyTo?.id ?? null,
        },
        attachments: files,
      });
      if (result.status === "sent") {
        toast.success(t("compose.sentToast"));
        onClose();
      } else {
        toast.error(
          t("compose.sendErrorToast", { error: result.error ?? t("compose.unknownError") }),
        );
      }
    } catch {
      toast.error(t("compose.sendErrorToastGeneric"));
    }
  }

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="email-compose-title"
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-bg/80 px-4 py-6 backdrop-blur-sm sm:py-10"
      onClick={onBackdropClick}
    >
      <div
        className={`my-auto w-full max-w-xl rounded-lg border border-border bg-surface p-6 shadow-lg ${nudgeClass}`}
      >
        <div className="mb-4 flex items-start justify-between">
          <h2 id="email-compose-title" className="text-lg font-semibold">
            {replyTo ? t("compose.titleReply") : t("compose.titleNew")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("compose.close")}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary hover:bg-surface-overlay hover:text-text-primary"
          >
            <X size={18} strokeWidth={1.75} aria-hidden />
          </button>
        </div>

        <div className="space-y-3">
          <ChipsInput
            label={t("compose.toLabel")}
            value={to}
            onChange={setTo}
            placeholder={t("compose.toPlaceholder")}
          />
          <ChipsInput
            label={t("compose.ccLabel")}
            value={cc}
            onChange={setCc}
            placeholder={t("compose.optionalPlaceholder")}
          />
          <ChipsInput
            label={t("compose.bccLabel")}
            value={bcc}
            onChange={setBcc}
            placeholder={t("compose.optionalPlaceholder")}
          />
          <label className="block">
            <span className="text-xs font-medium text-text-secondary">
              {t("compose.subjectLabel")}
            </span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={300}
              className="mt-1 block h-9 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm focus:border-accent focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-text-secondary">
              {t("compose.bodyLabel")}
            </span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="mt-1 block w-full rounded-md border border-border bg-surface-overlay p-3 text-sm focus:border-accent focus:outline-none"
            />
          </label>

          <div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-text-secondary hover:text-text-primary">
              <Paperclip size={14} strokeWidth={1.75} aria-hidden />
              {t("compose.addAttachment")}
              <input
                type="file"
                multiple
                className="sr-only"
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  if (picked.length) setFiles((prev) => [...prev, ...picked]);
                  e.target.value = "";
                }}
              />
            </label>
            {files.length ? (
              <ul className="mt-2 space-y-1">
                {files.map((f, i) => {
                  const error = attachmentError(f, t);
                  return (
                    <li
                      key={`${f.name}-${i}`}
                      className="rounded bg-surface-overlay px-2 py-1 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{f.name}</span>
                        <button
                          type="button"
                          aria-label={t("compose.removeFile", { filename: f.name })}
                          onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                          className="text-text-tertiary hover:text-danger"
                        >
                          ×
                        </button>
                      </div>
                      {error ? (
                        <p className="mt-0.5 text-danger" role="alert">
                          {error}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
          >
            {t("compose.cancel")}
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className={cn(
              "inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover",
              !canSend && "cursor-not-allowed opacity-60",
            )}
          >
            {send.isPending ? t("compose.sending") : t("compose.send")}
          </button>
        </div>
      </div>
    </div>
  );
}
