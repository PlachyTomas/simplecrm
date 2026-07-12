import { Check, Mail, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useCompany } from "@/app/companies/useCompany";
import { useContact, useContacts } from "@/app/contacts/useContacts";
import { MarkLostDialog } from "@/app/deals/MarkLostDialog";
import { useMarkDealLost, useMarkDealWon } from "@/app/deals/useDealActions";
import { useDeal, useDeleteDeal, useUpdateDeal } from "@/app/deals/useDeals";
import { EmailComposeModal } from "@/app/emails/EmailComposeModal";
import { EmailHistorySection } from "@/app/emails/EmailHistorySection";
import { GatedMailButton } from "@/app/emails/GatedMailButton";
import type { SentEmailOut } from "@/app/emails/useEmails";
import { DealEventsSection } from "@/app/events/DealEventsSection";
import { usePipelineBoard } from "@/app/pipeline/useBoard";
import { isSmtpVerified, useSmtpSettings } from "@/app/settings/useSmtpSettings";
import { useOrgUsers } from "@/app/settings/useUsersTeams";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { useLocale } from "@/lib/i18n/useLocale";
import { useToast } from "@/lib/toast";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-4 py-3">
      <dt className="text-sm text-text-tertiary">{label}</dt>
      <dd className="col-span-2 text-sm text-text-primary">{children}</dd>
    </div>
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
  const [editing, setEditing] = useState(false);
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
    setEditing(true);
  }

  async function handleSave() {
    if (!edit) return;
    const numericValue = edit.value.trim() === "" ? 0 : Number(edit.value.replace(/\s/g, ""));
    if (Number.isNaN(numericValue)) return;
    const probability =
      edit.probability_override.trim() === "" ? null : Number(edit.probability_override);
    if (probability != null && (Number.isNaN(probability) || probability < 0 || probability > 100))
      return;
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

  async function handleReopen() {
    if (!window.confirm(t("dealDetail.confirmReopen"))) return;
    try {
      await updateDeal.mutateAsync({ lost_reason: null });
      toast.success(t("dealDetail.toast.reopened"));
    } catch {
      toast.error(t("dealDetail.toast.reopenError"));
    }
  }

  async function handleDelete() {
    if (!window.confirm(t("dealDetail.confirmDelete", { name: deal!.name }))) return;
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
      <header className="shrink-0 border-b border-border-subtle p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2
              ref={titleRef}
              tabIndex={-1}
              id="deal-detail-title"
              className="text-2xl font-semibold outline-none"
            >
              {deal.name}
            </h2>
            {value > 0 ? (
              <p className="mt-1 font-mono text-lg tabular-nums text-text-primary">
                {Number.isNaN(value) ? `${deal.value} ${deal.currency}` : moneyFmt.format(value)}
              </p>
            ) : null}
          </div>
          <CloseButton onClose={onClose} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
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
              onClick={handleReopen}
              disabled={updateDeal.isPending}
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
              onClick={handleDelete}
              disabled={deleteDeal.isPending}
              aria-label={t("dealDetail.deleteAriaLabel")}
              className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface-overlay px-3 text-sm font-medium text-text-secondary transition-colors duration-fast hover:border-danger-subtle hover:bg-danger-subtle hover:text-danger disabled:opacity-60"
            >
              <Trash2 size={14} strokeWidth={1.75} />
            </button>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <section className="rounded-lg border border-border bg-surface">
          <dl className="divide-y divide-border-subtle px-6">
            <Field label={t("dealDetail.fields.status")}>
              {deal.closed_at ? (
                deal.lost_reason ? (
                  <span className="inline-flex items-center rounded-full bg-danger-subtle px-3 py-1 text-xs font-medium text-danger">
                    {t("dealDetail.lost")} · {deal.lost_reason}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success-subtle px-3 py-1 text-xs font-medium text-success">
                    <Check size={12} strokeWidth={2} aria-hidden /> {t("dealDetail.won")}
                  </span>
                )
              ) : (
                <span className="inline-flex items-center rounded-full bg-accent-subtle px-3 py-1 text-xs font-medium text-accent">
                  {t("dealDetail.open")}
                </span>
              )}
            </Field>
            <Field label={t("dealDetail.fields.name")}>
              {editing && edit ? (
                <input
                  type="text"
                  value={edit.name}
                  onChange={(e) => setEdit((p) => p && { ...p, name: e.target.value })}
                  className="block h-9 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm focus:border-accent focus:outline-none"
                />
              ) : (
                deal.name
              )}
            </Field>
            <Field label={t("dealDetail.fields.value")}>
              {editing && edit ? (
                <input
                  type="text"
                  inputMode="decimal"
                  value={edit.value}
                  onChange={(e) => setEdit((p) => p && { ...p, value: e.target.value })}
                  className="block h-9 w-full rounded-md border border-border bg-surface-overlay px-3 font-mono text-sm tabular-nums focus:border-accent focus:outline-none"
                />
              ) : Number.isNaN(value) ? (
                `${deal.value} ${deal.currency}`
              ) : value > 0 ? (
                moneyFmt.format(value)
              ) : (
                <span className="text-text-tertiary">—</span>
              )}
            </Field>
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
          </dl>
        </section>

        {editing ? (
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
              }}
              className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary"
            >
              {t("dealDetail.cancel")}
            </button>
          </div>
        ) : null}

        <DealEventsSection dealId={deal.id} dealName={deal.name} locale={locale} />

        <EmailHistorySection
          dealId={deal.id}
          locale={locale}
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
          defaultTo={primaryContact?.email ?? company?.email ?? null}
          replyTo={replyTarget}
        />
      ) : null}

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
