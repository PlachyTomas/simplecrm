import { Paperclip, X } from "lucide-react";
import { useMemo, useState } from "react";

import { type SentEmailOut, useSendEmail } from "@/app/emails/useEmails";
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
              aria-label={`Odebrat ${addr}`}
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

  if (!open) return null;

  const canSend = to.length > 0 && subject.trim().length > 0 && !send.isPending;

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
        toast.success("E-mail odeslán.");
        onClose();
      } else {
        toast.error(`E-mail se nepodařilo odeslat: ${result.error ?? "neznámá chyba"}`);
      }
    } catch {
      toast.error("E-mail se nepodařilo odeslat.");
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
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="my-auto w-full max-w-xl rounded-lg border border-border bg-surface p-6 shadow-lg">
        <div className="mb-4 flex items-start justify-between">
          <h2 id="email-compose-title" className="text-lg font-semibold">
            {replyTo ? "Odpovědět" : "Nový e-mail"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zavřít"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary hover:bg-surface-overlay hover:text-text-primary"
          >
            <X size={18} strokeWidth={1.75} aria-hidden />
          </button>
        </div>

        <div className="space-y-3">
          <ChipsInput label="Komu" value={to} onChange={setTo} placeholder="adresa@firma.cz" />
          <ChipsInput label="Kopie (CC)" value={cc} onChange={setCc} placeholder="volitelné" />
          <ChipsInput
            label="Skrytá kopie (BCC)"
            value={bcc}
            onChange={setBcc}
            placeholder="volitelné"
          />
          <label className="block">
            <span className="text-xs font-medium text-text-secondary">Předmět</span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={300}
              className="mt-1 block h-9 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm focus:border-accent focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-text-secondary">Zpráva</span>
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
              Přidat přílohu
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
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center justify-between rounded bg-surface-overlay px-2 py-1 text-xs"
                  >
                    <span className="truncate">{f.name}</span>
                    <button
                      type="button"
                      aria-label={`Odebrat ${f.name}`}
                      onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                      className="text-text-tertiary hover:text-danger"
                    >
                      ×
                    </button>
                  </li>
                ))}
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
            Zrušit
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
            {send.isPending ? "Odesílám…" : "Odeslat"}
          </button>
        </div>
      </div>
    </div>
  );
}
