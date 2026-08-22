import { Check, Mail, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useCompany } from "@/app/companies/useCompany";
import { useContact, useContacts } from "@/app/contacts/useContacts";
import { DealTimelineSection } from "@/app/deals/DealTimelineSection";
import { DealTodosSection } from "@/app/deals/DealTodosSection";
import { MarkLostDialog } from "@/app/deals/MarkLostDialog";
import { useMarkDealLost, useMarkDealWon, useReopenDeal } from "@/app/deals/useDealActions";
import { type DealOut, useDeal, useDeleteDeal, useUpdateDeal } from "@/app/deals/useDeals";
import { EmailComposeModal } from "@/app/emails/EmailComposeModal";
import { EmailHistorySection } from "@/app/emails/EmailHistorySection";
import { GatedMailButton } from "@/app/emails/GatedMailButton";
import type { SentEmailOut } from "@/app/emails/useEmails";
import { DealEventsSection } from "@/app/events/DealEventsSection";
import { usePipelineBoard } from "@/app/pipeline/useBoard";
import { isSmtpVerified, useSmtpSettings } from "@/app/settings/useSmtpSettings";
import { useOrgUsers } from "@/app/settings/useUsersTeams";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useLocale } from "@/lib/i18n/useLocale";
import { testIds } from "@/lib/testids";
import { useToast } from "@/lib/toast";

/**
 * One cell of the info grid: label above value, so two fields fit side by side
 * from `sm` up (`DealNoteField` builds its own full-width cell).
 */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 py-0.5">
      <dt className="text-xs font-medium text-text-tertiary">{label}</dt>
      <dd className="mt-0.5 text-sm text-text-primary">{children}</dd>
    </div>
  );
}

/** Open / won / lost — the deal's state, shown next to the name in the header. */
function StatusChip({ deal }: { deal: DealOut }) {
  const { t } = useTranslation("deals");
  if (!deal.closed_at) {
    return (
      <span className="inline-flex items-center rounded-full bg-accent-subtle px-3 py-1 text-xs font-medium text-accent">
        {t("dealDetail.open")}
      </span>
    );
  }
  if (deal.lost_reason) {
    return (
      <span className="inline-flex items-center rounded-full bg-danger-subtle px-3 py-1 text-xs font-medium text-danger">
        {t("dealDetail.lost")} · {deal.lost_reason}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-success-subtle px-3 py-1 text-xs font-medium text-success">
      <Check size={12} strokeWidth={2} aria-hidden /> {t("dealDetail.won")}
    </span>
  );
}

interface EditState {
  name: string;
  value: string;
  expected_close_date: string;
  owner_user_id: string;
  stage_id: string;
  probability_override: string;
  primary_contact_id: string;
}

interface DealDetailProps {
  dealId: string;
  /** Called when the deal is deleted or the user dismisses the panel. */
  onClose: () => void;
}

/**
 * Presentational deal detail, rendered inside `DealDetailDialog`. Everything
 * the old standalone page showed — status, inline edit, win/lose/reopen/delete,
 * the embedded events section — minus the page chrome. Deleting closes the
 * dialog rather than navigating.
 */
export function DealDetail({ dealId, onClose }: DealDetailProps) {
  const { t } = useTranslation("deals");
  const { data: deal, isPending, isError } = useDeal(dealId);
  const { data: user } = useCurrentUser();
  const { data: usersPage } = useOrgUsers();
  const { data: board } = usePipelineBoard();
  const { data: company } = useCompany(deal?.company_id);
  const { data: primaryContact } = useContact(deal?.primary_contact_id ?? undefined);
  const { data: companyContactsPage } = useContacts({
    companyId: deal?.company_id,
    limit: 100,
  });
  const { data: smtp } = useSmtpSettings();
  const [lostDialogOpen, setLostDialogOpen] = useState(false);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<SentEmailOut | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const focusedOnLoad = useRef(false);

  // The dialog mounts before the deal query resolves, so `useModalDialog`
  // focuses the loading state's close button. That button unmounts when the
  // data arrives, dropping focus to <body> and silently breaking Escape (whose
  // listener lives on the dialog node). Re-assert focus onto the title the first
  // time the deal loads — later refetches must not steal focus mid-edit.
  useEffect(() => {
    if (deal && !focusedOnLoad.current) {
      focusedOnLoad.current = true;
      titleRef.current?.focus();
    }
  }, [deal]);

  const markWon = useMarkDealWon(dealId);
  const reopenDeal = useReopenDeal(dealId);
  const markLost = useMarkDealLost(dealId);
  const updateDeal = useUpdateDeal(dealId);
  const deleteDeal = useDeleteDeal(dealId);
  const toast = useToast();

  const locale = useLocale();
  const dateFmt = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "long" }), [locale]);

  if (isPending) {
    return (
      <div className="flex items-center justify-between p-6">
        <p className="text-sm text-text-tertiary" role="status">
          {t("dealDetail.loading")}
        </p>
        <CloseButton onClose={onClose} />
      </div>
    );
  }

  if (isError || !deal) {
    return (
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm text-danger" role="alert">
            {t("dealDetail.loadError")}
          </p>
          <CloseButton onClose={onClose} />
        </div>
      </div>
    );
  }

  const moneyFmt = new Intl.NumberFormat(locale, { style: "currency", currency: deal.currency });
  const value = Number(deal.value);
  const isClosed = !!deal.closed_at;
  const orgUsers = (usersPage?.items ?? []).filter((u) => u.is_active);
  const stages = board?.stages ?? [];
  const stage = stages.find((s) => s.id === deal.stage_id);
  const owner = deal.owner_user_id
    ? (orgUsers.find((u) => u.id === deal.owner_user_id)?.name ?? "—")
    : "—";
  const companyContacts = companyContactsPage?.items ?? [];

  function startEditing() {
    setEdit({
      name: deal!.name,
      value: deal!.value,
      expected_close_date: deal!.expected_close_date ?? "",
      owner_user_id: deal!.owner_user_id ?? "",
      stage_id: deal!.stage_id,
      probability_override:
        deal!.probability_override != null ? String(deal!.probability_override) : "",
      primary_contact_id: deal!.primary_contact_id ?? "",
    });
    setEditError(null);
    setEditing(true);
  }

  async function handleSave() {
    if (!edit) return;
    // Every invalid state must produce a visible message — a silent no-op
    // Save reads as "saved" and the user walks away with unsaved edits.
    setEditError(null);
    if (edit.name.trim() === "") {
      setEditError(t("dealDetail.editNameRequired"));
      return;
    }
    const numericValue = edit.value.trim() === "" ? 0 : Number(edit.value.replace(/\s/g, ""));
    if (Number.isNaN(numericValue)) {
      setEditError(t("dealDetail.editValueInvalid"));
      return;
    }
    const probability =
      edit.probability_override.trim() === "" ? null : Number(edit.probability_override);
    if (
      probability != null &&
      (Number.isNaN(probability) || probability < 0 || probability > 100)
    ) {
      setEditError(t("dealDetail.editProbabilityInvalid"));
      return;
    }
    try {
      await updateDeal.mutateAsync({
        name: edit.name.trim(),
        value: String(numericValue),
        expected_close_date: edit.expected_close_date || null,
        owner_user_id: edit.owner_user_id || null,
        stage_id: edit.stage_id,
        probability_override: probability,
        primary_contact_id: edit.primary_contact_id || null,
      });
      toast.success(t("dealDetail.toast.saved"));
      setEditing(false);
      setEdit(null);
    } catch {
      toast.error(t("dealDetail.toast.saveError"));
    }
  }

  // Both confirmations keep the dialog open on failure so the toast explains
  // the error next to a button the user can press again.
  async function handleReopen() {
    try {
      await reopenDeal.mutateAsync();
      toast.success(t("dealDetail.toast.reopened"));
      setReopenDialogOpen(false);
    } catch {
      toast.error(t("dealDetail.toast.reopenError"));
    }
  }

  async function handleDelete() {
    try {
      await deleteDeal.mutateAsync();
      toast.success(t("dealDetail.toast.deleted"));
      onClose();
    } catch {
      toast.error(t("dealDetail.toast.deleteError"));
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-border-subtle p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2
                ref={titleRef}
                tabIndex={-1}
                id="deal-detail-title"
                className="text-2xl font-semibold outline-none"
              >
                {deal.name}
              </h2>
              <StatusChip deal={deal} />
            </div>
            {value > 0 ? (
              <p className="mt-1 font-mono text-lg tabular-nums text-text-primary">
                {moneyFmt.format(value)}
              </p>
            ) : null}
          </div>
          <CloseButton onClose={onClose} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!isClosed ? (
            <>
              <button
                type="button"
                onClick={() =>
                  markWon.mutate(undefined, {
                    onError: () => toast.error(t("dealDetail.toast.winError")),
                  })
                }
                disabled={markWon.isPending}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-brand-accent px-4 text-sm font-semibold text-text-on-brand-accent transition-colors duration-fast hover:bg-brand-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Check size={16} strokeWidth={1.75} /> {t("dealDetail.won")}
              </button>
              <button
                type="button"
                onClick={() => setLostDialogOpen(true)}
                disabled={markLost.isPending}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary"
              >
                <X size={16} strokeWidth={1.75} /> {t("dealDetail.lost")}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setReopenDialogOpen(true)}
              disabled={reopenDeal.isPending}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary"
            >
              <RotateCcw size={16} strokeWidth={1.75} /> {t("dealDetail.reopen")}
            </button>
          )}
          {!editing ? (
            <button
              type="button"
              onClick={startEditing}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary"
            >
              <Pencil size={14} strokeWidth={1.75} /> {t("dealDetail.edit")}
            </button>
          ) : null}
          <GatedMailButton
            verified={isSmtpVerified(smtp)}
            onClick={() => {
              setReplyTarget(null);
              setComposeOpen(true);
            }}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary"
          >
            <Mail size={14} strokeWidth={1.75} /> {t("dealDetail.sendEmail")}
          </GatedMailButton>
          {user?.role === "admin" ? (
            <button
              type="button"
              onClick={() => setDeleteDialogOpen(true)}
              disabled={deleteDeal.isPending}
              aria-label={t("dealDetail.deleteAriaLabel")}
              data-testid={testIds.deals.detail.deleteButton}
              className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface-overlay px-3 text-sm font-medium text-text-secondary transition-colors duration-fast hover:border-danger-subtle hover:bg-danger-subtle hover:text-danger disabled:opacity-60"
            >
              <Trash2 size={14} strokeWidth={1.75} />
            </button>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <DealTimelineSection dealId={deal.id} />

        <section className="mt-4 rounded-lg border border-border bg-surface p-4">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
            {/* The header carries name, value and status in view mode; edit mode
                still needs every field, so those rows come back with the form. */}
            {editing && edit ? (
              <Field label={t("dealDetail.fields.name")}>
                <input
                  type="text"
                  value={edit.name}
                  onChange={(e) => setEdit((p) => p && { ...p, name: e.target.value })}
                  className="block h-9 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm focus:border-accent focus:outline-none"
                />
              </Field>
            ) : null}
            {editing && edit ? (
              <Field label={t("dealDetail.fields.value")}>
                <input
                  type="text"
                  inputMode="decimal"
                  value={edit.value}
                  onChange={(e) => setEdit((p) => p && { ...p, value: e.target.value })}
                  className="block h-9 w-full rounded-md border border-border bg-surface-overlay px-3 font-mono text-sm tabular-nums focus:border-accent focus:outline-none"
                />
              </Field>
            ) : value > 0 ? null : (
              // Zero or unparseable values are hidden in the header, so they
              // keep their row — otherwise the value would show up nowhere.
              <Field label={t("dealDetail.fields.value")}>
                {Number.isNaN(value) ? (
                  `${deal.value} ${deal.currency}`
                ) : (
                  <span className="text-text-tertiary">—</span>
                )}
              </Field>
            )}
            <Field label={t("dealDetail.fields.company")}>
              <Link
                to={`/app/companies/${deal.company_id}`}
                onClick={onClose}
                className="text-accent hover:text-accent-hover"
              >
                {company?.name ?? t("dealDetail.goToCompany")}
              </Link>
            </Field>
            <Field label={t("dealDetail.fields.owner")}>
              {editing && edit ? (
                <select
                  value={edit.owner_user_id}
                  onChange={(e) => setEdit((p) => p && { ...p, owner_user_id: e.target.value })}
                  className="block h-9 rounded-md border border-border bg-surface-overlay px-3 text-sm focus:border-accent focus:outline-none"
                >
                  <option value="">{t("dealDetail.noOwner")}</option>
                  {orgUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              ) : (
                owner
              )}
            </Field>
            <Field label={t("dealDetail.fields.stage")}>
              {editing && edit ? (
                <select
                  value={edit.stage_id}
                  onChange={(e) => setEdit((p) => p && { ...p, stage_id: e.target.value })}
                  className="block h-9 rounded-md border border-border bg-surface-overlay px-3 text-sm focus:border-accent focus:outline-none"
                >
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              ) : (
                (stage?.name ?? "—")
              )}
            </Field>
            <Field label={t("dealDetail.fields.primaryContact")}>
              {editing && edit ? (
                <select
                  value={edit.primary_contact_id}
                  onChange={(e) =>
                    setEdit((p) => p && { ...p, primary_contact_id: e.target.value })
                  }
                  className="block h-9 rounded-md border border-border bg-surface-overlay px-3 text-sm focus:border-accent focus:outline-none"
                >
                  <option value="">{t("dealDetail.noPrimaryContact")}</option>
                  {companyContacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.first_name} {c.last_name}
                    </option>
                  ))}
                </select>
              ) : primaryContact ? (
                <Link
                  to={`/app/contacts/${primaryContact.id}`}
                  onClick={onClose}
                  className="text-accent hover:text-accent-hover"
                >
                  {primaryContact.first_name} {primaryContact.last_name}
                </Link>
              ) : (
                "—"
              )}
            </Field>
            <Field label={t("dealDetail.fields.expectedClose")}>
              {editing && edit ? (
                <input
                  type="date"
                  value={edit.expected_close_date}
                  onChange={(e) =>
                    setEdit((p) => p && { ...p, expected_close_date: e.target.value })
                  }
                  className="block h-9 rounded-md border border-border bg-surface-overlay px-3 text-sm focus:border-accent focus:outline-none"
                />
              ) : deal.expected_close_date ? (
                dateFmt.format(new Date(deal.expected_close_date))
              ) : (
                "—"
              )}
            </Field>
            <Field label={t("dealDetail.fields.probability")}>
              {editing && edit ? (
                <input
                  type="number"
                  min={0}
                  max={100}
                  placeholder={t("dealDetail.probabilityPlaceholder")}
                  value={edit.probability_override}
                  onChange={(e) =>
                    setEdit((p) => p && { ...p, probability_override: e.target.value })
                  }
                  className="block h-9 w-32 rounded-md border border-border bg-surface-overlay px-3 text-sm tabular-nums focus:border-accent focus:outline-none"
                />
              ) : deal.probability_override != null ? (
                `${deal.probability_override} %`
              ) : (
                t("dealDetail.probabilityPlaceholder")
              )}
            </Field>
            <Field label={t("dealDetail.fields.created")}>
              {dateFmt.format(new Date(deal.created_at))}
            </Field>
            {deal.closed_at ? (
              <Field label={t("dealDetail.fields.closed")}>
                {dateFmt.format(new Date(deal.closed_at))}
              </Field>
            ) : null}
            <DealNoteField dealId={deal.id} note={deal.note ?? null} />
          </dl>
        </section>

        {editing ? (
          <>
            {editError ? (
              <p role="alert" className="mt-4 text-sm text-danger">
                {editError}
              </p>
            ) : null}
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={updateDeal.isPending}
                className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent disabled:opacity-60"
              >
                {updateDeal.isPending ? t("dealDetail.saving") : t("dealDetail.saveChanges")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setEdit(null);
                  setEditError(null);
                }}
                className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary"
              >
                {t("dealDetail.cancel")}
              </button>
            </div>
          </>
        ) : null}

        <DealEventsSection
          dealId={deal.id}
          dealName={deal.name}
          companyId={deal.company_id}
          locale={locale}
        />

        <DealTodosSection dealId={deal.id} />

        <EmailHistorySection
          dealId={deal.id}
          locale={locale}
          collapsible
          onReply={(email) => {
            setReplyTarget(email);
            setComposeOpen(true);
          }}
        />
      </div>

      {composeOpen ? (
        <EmailComposeModal
          key={replyTarget?.id ?? "new"}
          open
          onClose={() => {
            setComposeOpen(false);
            setReplyTarget(null);
          }}
          dealId={deal.id}
          companyId={company?.id}
          // This deal's own contact wins; otherwise the firma's main contact
          // (the star in the company detail — the contacts tour promises it
          // prefills into e-mails too), and only then the company's generic
          // inbox. Going straight to the generic inbox skipped a named human
          // we already knew about.
          defaultTo={
            primaryContact?.email ?? company?.main_contact?.email ?? company?.email ?? null
          }
          replyTo={replyTarget}
        />
      ) : null}

      <ConfirmDialog
        open={reopenDialogOpen}
        title={t("dealDetail.reopenDialog.title")}
        body={t("dealDetail.reopenDialog.body")}
        confirmLabel={t("dealDetail.reopenDialog.confirm")}
        pendingLabel={t("dealDetail.reopenDialog.pending")}
        pending={reopenDeal.isPending}
        onCancel={() => setReopenDialogOpen(false)}
        onConfirm={() => void handleReopen()}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        danger
        title={t("dealDetail.deleteDialog.title")}
        body={t("dealDetail.deleteDialog.body", { name: deal.name })}
        confirmLabel={t("dealDetail.deleteDialog.confirm")}
        pendingLabel={t("dealDetail.deleteDialog.pending")}
        pending={deleteDeal.isPending}
        onCancel={() => setDeleteDialogOpen(false)}
        onConfirm={() => void handleDelete()}
      />

      <MarkLostDialog
        open={lostDialogOpen}
        onClose={() => setLostDialogOpen(false)}
        pending={markLost.isPending}
        dealName={deal.name}
        onConfirm={(reason) => {
          markLost.mutate(
            { lost_reason: reason },
            {
              onSuccess: () => setLostDialogOpen(false),
              onError: () => toast.error(t("dealDetail.toast.loseError")),
            },
          );
        }}
      />
    </div>
  );
}

/**
 * The deal's **standing description** — `deals.note`, a record attribute that
 * overwrites in place ("Region: Morava", scope, terms). Deliberately not the
 * timeline: a running commentary ("volal jsem, chtějí nabídku do pátku") is a
 * timestamped, attributed event and lands in Průběh as an `ActivityType.note`
 * row. With the timeline now one section above, the subtitle only shows while
 * the field is empty or being written — that is when the distinction matters.
 *
 * Rendered as the closing full-width row of the info grid, but it keeps its own
 * edit toggle and mutation (the company `NotesTab` shape) instead of joining
 * the header's all-fields edit mode — a description is edited on its own.
 */
function DealNoteField({ dealId, note }: { dealId: string; note: string | null }) {
  const { t } = useTranslation("deals");
  const update = useUpdateDeal(dealId);
  const toast = useToast();
  const [draft, setDraft] = useState(note ?? "");
  const [editing, setEditing] = useState(false);
  const [noteExpanded, setNoteExpanded] = useState(false);

  useEffect(() => {
    setDraft(note ?? "");
  }, [note]);

  async function handleSave() {
    try {
      await update.mutateAsync({ note: draft.trim() ? draft : null });
      toast.success(t("noteSection.saveSuccess"));
      setEditing(false);
    } catch {
      toast.error(t("noteSection.saveError"));
    }
  }

  return (
    <div className="mt-1 border-t border-border-subtle pt-3 sm:col-span-2">
      <dt className="flex items-center justify-between gap-3 text-xs font-medium text-text-tertiary">
        {t("noteSection.title")}
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            data-testid={testIds.deals.detail.noteEdit}
            className="shrink-0 text-sm font-medium text-accent hover:text-accent-hover"
          >
            {note ? t("noteSection.editButton") : t("noteSection.addButton")}
          </button>
        ) : null}
      </dt>
      <dd className="mt-1">
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder={t("noteSection.placeholder")}
              data-testid={testIds.deals.detail.noteInput}
              className="block w-full resize-y rounded-md border border-border bg-surface-overlay p-3 text-sm text-text-primary placeholder:text-text-placeholder focus:border-accent focus:outline-none"
            />
            <p className="text-xs text-text-tertiary">{t("noteSection.subtitle")}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={update.isPending}
                data-testid={testIds.deals.detail.noteSave}
                className="inline-flex h-9 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-text-on-accent disabled:opacity-60"
              >
                {update.isPending ? t("noteSection.saving") : t("noteSection.save")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(note ?? "");
                  setEditing(false);
                }}
                data-testid={testIds.deals.detail.noteCancel}
                className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary"
              >
                {t("noteSection.cancel")}
              </button>
            </div>
          </div>
        ) : note ? (
          <>
            <p
              className={
                noteExpanded
                  ? "whitespace-pre-wrap text-sm text-text-primary"
                  : "line-clamp-3 whitespace-pre-wrap text-sm text-text-primary"
              }
            >
              {note}
            </p>
            {note.length > 220 || note.split("\n").length > 3 ? (
              <button
                type="button"
                onClick={() => setNoteExpanded((v) => !v)}
                className="mt-1 text-xs font-medium text-accent hover:text-accent-hover"
              >
                {noteExpanded ? t("noteSection.collapse") : t("noteSection.expand")}
              </button>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-text-secondary">{t("noteSection.empty")}</p>
        )}
      </dd>
    </div>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("deals");
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={t("dealDetail.closeAriaLabel")}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors duration-fast hover:bg-surface-overlay hover:text-text-primary"
    >
      <X size={18} strokeWidth={1.75} aria-hidden />
    </button>
  );
}
