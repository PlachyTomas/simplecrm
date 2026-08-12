import type { TFunction } from "i18next";
import { Paperclip, UserPlus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { type ContactOut, useContacts } from "@/app/contacts/useContacts";
import { useCreateContact } from "@/app/contacts/useCreateContact";
import { useDeals } from "@/app/deals/useDeals";
import { EmailTemplatePicker, MergeFieldHint } from "@/app/emails/EmailTemplatePicker";
import { type SentEmailOut, useSendEmail } from "@/app/emails/useEmails";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { testIds } from "@/lib/testids";
import { useDismissGuard } from "@/lib/useDismissGuard";
import { useModalDialog } from "@/lib/useModalDialog";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { fold } from "@/lib/fold";

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
  field,
  label,
  value,
  onChange,
  placeholder,
  inputTestId,
  contacts,
  onNewContact,
}: {
  /** Stable field key — scopes ARIA ids and testids per To/CC/BCC instance. */
  field: "to" | "cc" | "bcc";
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  inputTestId?: string;
  /** Company contacts (email guaranteed) to suggest; undefined = plain free-text field. */
  contacts?: ContactOut[];
  onNewContact?: () => void;
}) {
  const { t } = useTranslation("emails");
  const [draft, setDraft] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = (raw: string) => {
    const parts = splitAddresses(raw);
    if (parts.length) onChange([...value, ...parts]);
  };

  const query = fold(draft.trim());
  const matches = (contacts ?? [])
    .filter((c) => !value.includes(c.email ?? ""))
    .filter((c) => !query || fold(`${c.first_name} ${c.last_name} ${c.email}`).includes(query))
    .slice(0, 8);
  const rowCount = matches.length + (onNewContact ? 1 : 0);
  const showList = listOpen && contacts !== undefined && rowCount > 0;
  // Escape keys off what the user can SEE (showList), not the armed state —
  // otherwise the first Escape after focusing a plain field is a silent no-op.
  const showListRef = useRef(false);
  showListRef.current = showList;

  // Escape must close only the dropdown, but useModalDialog listens natively on
  // the dialog node — a React (root-attached) handler would run after it. A
  // native listener on the input fires first on the way up and can stop it.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showListRef.current) {
        e.stopPropagation();
        setListOpen(false);
      }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, []);

  const listboxId = `email-compose-${field}-listbox`;
  const optionId = (i: number) => `${listboxId}-option-${i}`;
  const inputId = `email-compose-${field}-field`;

  const pick = (email: string) => {
    onChange([...value, email]);
    setDraft("");
    setHighlight(-1);
    setListOpen(false);
  };

  // The draft must not survive into the sub-form: its autoFocus blurs this
  // input, and commit-on-blur would chip the leftover filter text.
  const startNewContact = () => {
    onNewContact?.();
    setDraft("");
    setHighlight(-1);
    setListOpen(false);
  };

  return (
    // NOT a <label> wrapper. A label's implicit control is its FIRST labelable
    // descendant, and <button> is labelable — so once a recipient chip existed,
    // the field's control was that chip's × remove button, not the input.
    // Clicking the label text (or any non-interactive part of the field) then
    // removed a recipient instead of focusing the input. Explicit htmlFor/id.
    <div className="relative">
      <label htmlFor={inputId} className="block text-xs font-medium text-text-secondary">
        {label}
      </label>
      <div
        className="mt-1 flex flex-wrap items-center gap-1 rounded-md border border-border bg-surface-overlay px-2 py-1.5 focus-within:border-accent"
        // Blank space in the field still has to behave like an input: focus it
        // and show the suggestions. preventDefault stops the press from moving
        // focus to the wrapper first.
        onMouseDown={(e) => {
          if (e.target !== e.currentTarget) return;
          e.preventDefault();
          inputRef.current?.focus();
          setListOpen(true);
        }}
      >
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
          ref={inputRef}
          id={inputId}
          type="text"
          value={draft}
          data-testid={inputTestId}
          role={contacts !== undefined ? "combobox" : undefined}
          aria-expanded={contacts !== undefined ? showList : undefined}
          aria-controls={showList ? listboxId : undefined}
          aria-autocomplete={contacts !== undefined ? "list" : undefined}
          aria-activedescendant={showList && highlight >= 0 ? optionId(highlight) : undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            setHighlight(-1);
            setListOpen(true);
          }}
          onFocus={() => setListOpen(true)}
          // Focus alone isn't enough: the dialog autofocuses a field on open, so
          // a click on an already-focused input fired no focus event and the
          // suggestions never appeared — the list looked unreachable by mouse.
          onMouseDown={() => setListOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && rowCount > 0) {
              e.preventDefault();
              setListOpen(true);
              setHighlight((h) => Math.min(h + 1, rowCount - 1));
            } else if (e.key === "ArrowUp" && showList) {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, -1));
            } else if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              if (e.key === "Enter" && showList && highlight >= 0) {
                const hit = matches[highlight];
                if (hit) {
                  if (hit.email) pick(hit.email);
                } else {
                  startNewContact();
                }
                return;
              }
              commit(draft);
              setDraft("");
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => {
            setListOpen(false);
            setHighlight(-1);
            if (draft.trim()) {
              commit(draft);
              setDraft("");
            }
          }}
          placeholder={value.length ? "" : placeholder}
          className="h-6 min-w-[8rem] flex-1 bg-transparent text-sm outline-none"
        />
      </div>
      {showList ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={t("compose.suggestionsLabel")}
          // Keep the input focused so its commit-on-blur can't fire a junk
          // free-text chip before the row's click lands.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-surface shadow-lg"
        >
          {matches.map((c, i) => (
            <li key={c.id}>
              {/* tabIndex -1: focus stays on the combobox input (ARIA 1.2);
                  also keeps Tab from landing on a row that unmounts on blur. */}
              <button
                type="button"
                tabIndex={-1}
                id={optionId(i)}
                role="option"
                aria-selected={highlight === i}
                data-testid={testIds.emails.compose.suggestion(field, c.id)}
                onClick={() => pick(c.email ?? "")}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-text-primary transition-colors duration-fast hover:bg-surface-overlay",
                  highlight === i && "bg-surface-overlay",
                )}
              >
                <span className="truncate">
                  {c.first_name} {c.last_name}
                </span>
                <span className="truncate text-xs text-text-tertiary">{c.email}</span>
              </button>
            </li>
          ))}
          {onNewContact ? (
            <li>
              <button
                type="button"
                tabIndex={-1}
                id={optionId(matches.length)}
                role="option"
                aria-selected={highlight === matches.length}
                data-testid={testIds.emails.compose.newContactToggle(field)}
                onClick={startNewContact}
                className={cn(
                  "flex w-full items-center gap-2 border-t border-border-subtle px-3 py-2 text-left text-sm font-medium text-accent transition-colors duration-fast hover:bg-surface-overlay",
                  highlight === matches.length && "bg-surface-overlay",
                )}
              >
                <UserPlus size={14} strokeWidth={1.75} aria-hidden />
                {t("compose.newContactOption")}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

function InlineNewContactForm({
  companyId,
  onCreated,
  onCancel,
}: {
  companyId: string;
  onCreated: (email: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("emails");
  const create = useCreateContact();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const nc = testIds.emails.compose.newContact;
  // Email required here (unlike AddContactModal) — the contact exists to become
  // a recipient.
  const canSave = !!first.trim() && !!last.trim() && !!email.trim() && !create.isPending;

  async function handleSave() {
    if (!canSave) return;
    try {
      const created = await create.mutateAsync({
        first_name: first.trim(),
        last_name: last.trim(),
        email: email.trim(),
        company_id: companyId,
      });
      onCreated(created.email ?? email.trim());
    } catch {
      /* create.isError surfaces below */
    }
  }

  const inputClass =
    "mt-1 block h-9 w-full rounded-md border border-border bg-surface px-3 text-sm focus:border-accent focus:outline-none";
  return (
    <div className="rounded-md border border-border-subtle bg-surface-overlay p-3">
      <p className="text-xs font-medium text-text-secondary">{t("compose.newContactTitle")}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-xs text-text-tertiary">{t("compose.newContactFirstName")}</span>
          <input
            type="text"
            value={first}
            data-testid={nc.firstNameInput}
            onChange={(e) => setFirst(e.target.value)}
            autoFocus
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="text-xs text-text-tertiary">{t("compose.newContactLastName")}</span>
          <input
            type="text"
            value={last}
            data-testid={nc.lastNameInput}
            onChange={(e) => setLast(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      <label className="mt-2 block">
        <span className="text-xs text-text-tertiary">{t("compose.newContactEmail")}</span>
        <input
          type="email"
          value={email}
          data-testid={nc.emailInput}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </label>
      {create.isError ? (
        <p className="mt-2 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger" role="alert">
          {t("compose.newContactError")}
        </p>
      ) : null}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          data-testid={nc.cancel}
          onClick={onCancel}
          className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-surface px-3 text-xs font-medium text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
        >
          {t("compose.newContactCancel")}
        </button>
        <button
          type="button"
          data-testid={nc.save}
          onClick={handleSave}
          disabled={!canSave}
          className="inline-flex h-8 items-center justify-center rounded-md bg-accent px-3 text-xs font-medium text-text-on-accent hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {create.isPending ? t("compose.newContactSaving") : t("compose.newContactSave")}
        </button>
      </div>
    </div>
  );
}

/**
 * "Attach to a deal" row for a compose opened from a company (no deal context).
 * Filing the mail on the company's live deal is the common case, so it defaults
 * on and preselects the most recently updated open deal — `updated_at` stands
 * in for "where things are happening" without a new endpoint.
 *
 * Its own component so the deals request only happens on that path: `useDeals`
 * has no `enabled` switch, and the reply/deal-context flows must stay untouched.
 */
function AttachToDealRow({
  companyId,
  onChange,
}: {
  companyId: string;
  /** Reports the deal to file the mail on; `null` = company only. */
  onChange: (dealId: string | null) => void;
}) {
  const { t } = useTranslation("emails");
  const { data } = useDeals({ companyId, status: "open", limit: 100 });
  // The list API offers no "recently updated" sort, so order client-side.
  const deals = useMemo(
    () => [...(data?.items ?? [])].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [data],
  );

  const [attach, setAttach] = useState(true);
  const [picked, setPicked] = useState<string | null>(null);
  // Falls back to the newest deal until the user picks another; keeping the
  // pick separate from `attach` restores it on an uncheck→recheck round trip.
  const selected = deals.find((d) => d.id === picked)?.id ?? deals[0]?.id ?? null;

  useEffect(() => {
    onChange(attach ? selected : null);
  }, [attach, selected, onChange]);

  // No open deal → nothing to attach to; an empty dropdown would be noise.
  if (deals.length === 0) return null;

  return (
    <div className="rounded-md border border-border-subtle bg-surface-overlay p-3">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
        <input
          type="checkbox"
          checked={attach}
          data-testid={testIds.emails.compose.attachDealToggle}
          onChange={(e) => setAttach(e.target.checked)}
          className="h-4 w-4 rounded border-border accent-accent"
        />
        {t("compose.attachDealLabel")}
      </label>
      <select
        value={selected ?? ""}
        aria-label={t("compose.attachDealSelectLabel")}
        data-testid={testIds.emails.compose.attachDealSelect}
        disabled={!attach}
        onChange={(e) => setPicked(e.target.value)}
        className="mt-2 block h-9 w-full rounded-md border border-border bg-surface px-2 text-sm text-text-primary focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        {deals.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
    </div>
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
  const { data: currentUser } = useCurrentUser();
  // Org-level opt-out wins over the per-send flag server-side, so a visible
  // checkbox would be a lie once an admin switches tracking off.
  const trackingAllowed = currentUser?.organization?.email_tracking_enabled !== false;

  // Company context makes the recipient fields contact-aware: suggestions from
  // the company's contacts plus an inline create-contact path.
  const contactsQuery = useContacts({ companyId, limit: 100, enabled: open && !!companyId });
  const contactOptions = companyId
    ? (contactsQuery.data?.items ?? []).filter((c) => !!c.email)
    : undefined;
  const [newContactFor, setNewContactFor] = useState<"to" | "cc" | "bcc" | null>(null);

  const initial = useMemo(() => {
    if (replyTo) {
      const subj = replyTo.subject.startsWith("Re:") ? replyTo.subject : `Re: ${replyTo.subject}`;
      // A reply to an inbound (Smart-BCC) row goes back to the correspondent —
      // its `to_emails` are the *original* recipients, i.e. usually us.
      if (replyTo.direction === "inbound") {
        return {
          to: replyTo.from_email ? [replyTo.from_email] : [],
          cc: [] as string[],
          subject: subj,
        };
      }
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
  // Open/click tracking is on by default (mirrors the server default); opting
  // out sends a plain mail with no pixel and no rewritten links.
  const [track, setTrack] = useState(true);
  // Deal chosen in the attach row below; only ever set on the company path.
  const [attachedDealId, setAttachedDealId] = useState<string | null>(null);
  // A reply is filed by the server off its parent, and a deal-context compose
  // already knows its deal — the row exists only to fill that gap.
  const attachRowCompanyId = !replyTo && !dealId ? companyId : undefined;

  // Dirty = anything beyond the reply/defaultTo prefill.
  const dirty =
    body.trim() !== "" ||
    files.length > 0 ||
    bcc.length > 0 ||
    subject !== initial.subject ||
    to.join("\n") !== initial.to.join("\n") ||
    cc.join("\n") !== initial.cc.join("\n") ||
    newContactFor !== null ||
    !track;
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
          // A reply is anchored server-side to its parent's deal/company;
          // resending ids can only 422 on mismatch (e.g. an older parent
          // stored without a company link).
          deal_id: replyTo ? null : (dealId ?? attachedDealId),
          company_id: replyTo ? null : (companyId ?? null),
          reply_to_email_id: replyTo?.id ?? null,
          track: track && trackingAllowed,
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
            field="to"
            inputTestId={testIds.emails.compose.toInput}
            contacts={contactOptions}
            onNewContact={companyId ? () => setNewContactFor("to") : undefined}
          />
          {newContactFor === "to" && companyId ? (
            <InlineNewContactForm
              companyId={companyId}
              onCreated={(email) => {
                setTo((prev) => [...prev, email]);
                setNewContactFor(null);
              }}
              onCancel={() => setNewContactFor(null)}
            />
          ) : null}
          <ChipsInput
            label={t("compose.ccLabel")}
            value={cc}
            onChange={setCc}
            placeholder={t("compose.optionalPlaceholder")}
            field="cc"
            inputTestId={testIds.emails.compose.ccInput}
            contacts={contactOptions}
            onNewContact={companyId ? () => setNewContactFor("cc") : undefined}
          />
          {newContactFor === "cc" && companyId ? (
            <InlineNewContactForm
              companyId={companyId}
              onCreated={(email) => {
                setCc((prev) => [...prev, email]);
                setNewContactFor(null);
              }}
              onCancel={() => setNewContactFor(null)}
            />
          ) : null}
          <ChipsInput
            label={t("compose.bccLabel")}
            value={bcc}
            onChange={setBcc}
            placeholder={t("compose.optionalPlaceholder")}
            field="bcc"
            inputTestId={testIds.emails.compose.bccInput}
            contacts={contactOptions}
            onNewContact={companyId ? () => setNewContactFor("bcc") : undefined}
          />
          {newContactFor === "bcc" && companyId ? (
            <InlineNewContactForm
              companyId={companyId}
              onCreated={(email) => {
                setBcc((prev) => [...prev, email]);
                setNewContactFor(null);
              }}
              onCancel={() => setNewContactFor(null)}
            />
          ) : null}
          <EmailTemplatePicker
            enabled={open}
            hasDraft={subject.trim() !== "" || body.trim() !== ""}
            onApply={(tpl) => {
              setSubject(tpl.subject);
              setBody(tpl.body);
            }}
            selectTestId={testIds.emails.compose.templateSelect}
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
          {/* The server resolves merge fields on this path too (services/mailer
              renders subject+body before sending), so the hint can promise it. */}
          <MergeFieldHint enabled={open} />

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

          {attachRowCompanyId ? (
            <AttachToDealRow companyId={attachRowCompanyId} onChange={setAttachedDealId} />
          ) : null}

          {trackingAllowed ? (
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={track}
                data-testid={testIds.emails.compose.trackToggle}
                onChange={(e) => setTrack(e.target.checked)}
                className="h-4 w-4 rounded border-border accent-accent"
              />
              {t("compose.trackLabel")}
            </label>
          ) : (
            <p className="text-xs text-text-tertiary">{t("compose.trackingOffByOrg")}</p>
          )}
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
