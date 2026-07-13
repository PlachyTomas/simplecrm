import type { ParseKeys, TFunction } from "i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import {
  type AdminOrgUserRow,
  type AdminSubscriptionOut,
  type ImpersonateOut,
  useAdminOrgActivity,
  useAdminOrgSubscription,
  useAdminOrgUsers,
} from "@/admin/hooks";
import { useAuth } from "@/auth/useAuth";
import { ApiError, apiFetch } from "@/lib/api";
import { formatDate, formatMoneyMinor } from "@/lib/format";
import { useLocale } from "@/lib/i18n/useLocale";
import { cn } from "@/lib/utils";

const ORG_DETAIL_STATUS_KEY: Record<AdminSubscriptionOut["status"], ParseKeys<"admin">> = {
  trialing: "orgDetail.status.trialing",
  pending_activation: "orgDetail.status.pendingActivation",
  active: "orgDetail.status.active",
  past_due: "orgDetail.status.pastDue",
  canceled: "orgDetail.status.canceled",
};

function statusPillSpec(
  sub: AdminSubscriptionOut,
  t: TFunction<"admin">,
): { label: string; className: string } {
  if (sub.is_comp) {
    return { label: t("orgDetail.status.complementary"), className: "bg-info-subtle text-info" };
  }
  if (sub.plan?.code === "enterprise" && sub.status === "active") {
    return { label: t("orgDetail.status.activeEnterprise"), className: "bg-info-subtle text-info" };
  }
  switch (sub.status) {
    case "trialing":
      return { label: t(ORG_DETAIL_STATUS_KEY.trialing), className: "bg-info-subtle text-info" };
    case "pending_activation":
      return {
        label: t(ORG_DETAIL_STATUS_KEY.pending_activation),
        className: "bg-warning-subtle text-warning",
      };
    case "active":
      return { label: t(ORG_DETAIL_STATUS_KEY.active), className: "bg-success-subtle text-success" };
    case "past_due":
      return {
        label: t(ORG_DETAIL_STATUS_KEY.past_due),
        className: "bg-warning-subtle text-warning",
      };
    case "canceled":
      return { label: t(ORG_DETAIL_STATUS_KEY.canceled), className: "bg-danger-subtle text-danger" };
    default:
      return { label: sub.status, className: "bg-surface-overlay text-text-tertiary" };
  }
}

interface OrgDetailDrawerProps {
  orgId: string;
  /** User count carried over from the list row so the Enterprise-price
   *  modal can render `users × override` without a second fetch. */
  userCount: number | null;
}

type ActiveModal = "activate" | "set-comp" | "set-enterprise" | "extend-trial" | "cancel" | null;

export function OrgDetailDrawer({ orgId, userCount }: OrgDetailDrawerProps) {
  const { t } = useTranslation("admin");
  const locale = useLocale();
  const subQuery = useAdminOrgSubscription(orgId);
  const sub = subQuery.data;

  const [activeModal, setActiveModal] = useState<ActiveModal>(null);

  // Reset modal state when org changes (e.g. user picks a different row).
  useEffect(() => {
    setActiveModal(null);
  }, [orgId]);

  if (subQuery.isPending) {
    return (
      <section className="rounded-lg border border-border bg-surface p-6 text-sm text-text-tertiary">
        {t("orgDetail.loading")}
      </section>
    );
  }

  if (!sub) {
    return (
      <section
        className="rounded-lg border border-border bg-surface p-6 text-sm text-danger"
        role="alert"
      >
        {t("orgDetail.loadError")}
      </section>
    );
  }

  const pill = statusPillSpec(sub, t);

  return (
    <section className="space-y-6">
      <div className="rounded-lg border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">{sub.plan?.display_name_cs ?? "—"}</h2>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
              pill.className,
            )}
          >
            {pill.label}
          </span>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wider text-text-tertiary">
              {t("orgDetail.labels.plan")}
            </dt>
            <dd className="text-text-primary">{sub.plan?.code ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-text-tertiary">
              {t("orgDetail.labels.status")}
            </dt>
            <dd className="text-text-primary">{sub.status}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-text-tertiary">
              {t("orgDetail.labels.start")}
            </dt>
            <dd className="text-text-primary">
              {formatDate(sub.started_at, locale, { dateStyle: "long" })}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-text-tertiary">
              {t("orgDetail.labels.periodEnd")}
            </dt>
            <dd className="text-text-primary">
              {formatDate(sub.current_period_ends_at, locale, { dateStyle: "long" })}
            </dd>
          </div>
          {sub.canceled_at ? (
            <div>
              <dt className="text-xs uppercase tracking-wider text-text-tertiary">
                {t("orgDetail.labels.canceled")}
              </dt>
              <dd className="text-text-primary">
                {formatDate(sub.canceled_at, locale, { dateStyle: "long" })}
              </dd>
            </div>
          ) : null}
          {sub.effective_price_per_user_minor != null ? (
            <div>
              <dt className="text-xs uppercase tracking-wider text-text-tertiary">
                {t("orgDetail.labels.effectivePrice")}
              </dt>
              <dd className="text-text-primary">
                {formatMoneyMinor(sub.effective_price_per_user_minor, "CZK", locale)}{" "}
                {t("orgDetail.labels.perUser")}
              </dd>
            </div>
          ) : null}
        </dl>

        {sub.is_comp && sub.comp_reason ? (
          <p className="mt-4 rounded-md border border-border-subtle bg-surface-overlay p-3 text-sm text-text-secondary">
            <span className="font-medium text-text-primary">
              {t("orgDetail.labels.compReasonPrefix")}
            </span>
            {sub.comp_reason}
          </p>
        ) : null}

        {sub.notes ? (
          <p className="mt-4 rounded-md border border-border-subtle bg-surface-overlay p-3 text-sm text-text-secondary">
            <span className="font-medium text-text-primary">{t("orgDetail.labels.notesPrefix")}</span>
            {sub.notes}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          <ActionButton onClick={() => setActiveModal("activate")}>
            {t("orgDetail.actions.activate")}
          </ActionButton>
          <ActionButton onClick={() => setActiveModal("set-comp")}>
            {t("orgDetail.actions.setComp")}
          </ActionButton>
          <ActionButton onClick={() => setActiveModal("set-enterprise")}>
            {t("orgDetail.actions.setEnterprise")}
          </ActionButton>
          <ActionButton onClick={() => setActiveModal("extend-trial")}>
            {t("orgDetail.actions.extendTrial")}
          </ActionButton>
          <ActionButton onClick={() => setActiveModal("cancel")} variant="danger">
            {t("orgDetail.actions.cancel")}
          </ActionButton>
        </div>
      </div>

      <MembersList orgId={orgId} />

      <ActivityTimeline orgId={orgId} />

      {activeModal === "activate" ? (
        <ActivateModal orgId={orgId} onClose={() => setActiveModal(null)} />
      ) : null}
      {activeModal === "set-comp" ? (
        <SetCompModal orgId={orgId} onClose={() => setActiveModal(null)} />
      ) : null}
      {activeModal === "set-enterprise" ? (
        <SetEnterpriseModal
          orgId={orgId}
          userCount={userCount ?? undefined}
          onClose={() => setActiveModal(null)}
        />
      ) : null}
      {activeModal === "extend-trial" ? (
        <ExtendTrialModal
          orgId={orgId}
          currentEndsAt={sub.current_period_ends_at}
          onClose={() => setActiveModal(null)}
        />
      ) : null}
      {activeModal === "cancel" ? (
        <CancelModal
          orgId={orgId}
          orgName={sub.plan?.display_name_cs ?? ""}
          onClose={() => setActiveModal(null)}
        />
      ) : null}
    </section>
  );
}

function ActionButton({
  onClick,
  variant = "primary",
  children,
}: {
  onClick: () => void;
  variant?: "primary" | "danger";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors duration-fast",
        variant === "danger"
          ? "border border-danger/40 bg-danger-subtle text-danger hover:bg-danger/10"
          : "border border-border bg-surface text-text-primary hover:bg-surface-overlay",
      )}
    >
      {children}
    </button>
  );
}

interface ModalShellProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

function ModalShell({ title, onClose, children }: ModalShellProps) {
  const { t } = useTranslation("admin");
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 px-4 py-8 backdrop-blur-md"
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-text-tertiary hover:text-text-primary"
            aria-label={t("modalShell.close")}
          >
            ✕
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function useInvalidateOrgDetail(orgId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "org-subscription", orgId] });
    queryClient.invalidateQueries({ queryKey: ["admin", "org-activity", orgId] });
    queryClient.invalidateQueries({ queryKey: ["admin", "org-list"] });
  };
}

// ---------- Activate subscription ----------

function ActivateModal({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const { t } = useTranslation("admin");
  const { accessToken } = useAuth();
  const invalidate = useInvalidateOrgDetail(orgId);
  const [planCode, setPlanCode] = useState<"monthly" | "annual" | "enterprise">("monthly");
  const [overrideKc, setOverrideKc] = useState<string>("");
  const [periodMonths, setPeriodMonths] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { plan_code: planCode };
      if (overrideKc) body.override_price_per_user_minor = Number(overrideKc) * 100;
      if (periodMonths) body.period_months = Number(periodMonths);
      return apiFetch(`/api/v1/admin/organizations/${orgId}/subscription/activate`, {
        method: "POST",
        token: accessToken,
        body,
      });
    },
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (err) => {
      setError(
        err instanceof ApiError
          ? t("orgDetail.activateModal.errorWithDetail", { detail: JSON.stringify(err.body) })
          : t("orgDetail.activateModal.errorGeneric"),
      );
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (planCode === "enterprise" && !overrideKc) {
      setError(t("orgDetail.activateModal.errorEnterprisePriceRequired"));
      return;
    }
    setError(null);
    mutation.mutate();
  }

  return (
    <ModalShell title={t("orgDetail.activateModal.title")} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block text-sm font-medium">
          {t("orgDetail.activateModal.planLabel")}
          <select
            value={planCode}
            onChange={(e) => setPlanCode(e.target.value as typeof planCode)}
            className="mt-1 block h-10 w-full rounded-md border border-border bg-bg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="monthly">{t("orgDetail.activateModal.planOptions.monthly")}</option>
            <option value="annual">{t("orgDetail.activateModal.planOptions.annual")}</option>
            <option value="enterprise">{t("orgDetail.activateModal.planOptions.enterprise")}</option>
          </select>
        </label>
        <label className="block text-sm font-medium">
          {t("orgDetail.activateModal.priceLabel")}{" "}
          <span className="text-text-tertiary">
            {planCode === "enterprise"
              ? t("orgDetail.activateModal.priceHintRequired")
              : t("orgDetail.activateModal.priceHintOptional")}
          </span>
          <input
            type="number"
            min={0}
            value={overrideKc}
            onChange={(e) => setOverrideKc(e.target.value)}
            className="mt-1 block h-10 w-full rounded-md border border-border bg-bg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
        <label className="block text-sm font-medium">
          {t("orgDetail.activateModal.periodLabel")}{" "}
          <span className="text-text-tertiary">
            {planCode === "enterprise"
              ? t("orgDetail.activateModal.periodHintRequired")
              : t("orgDetail.activateModal.periodHintOptional")}
          </span>
          <input
            type="number"
            min={1}
            max={120}
            value={periodMonths}
            onChange={(e) => setPeriodMonths(e.target.value)}
            className="mt-1 block h-10 w-full rounded-md border border-border bg-bg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
        {error ? (
          <p
            role="alert"
            className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        ) : null}
        <ModalFooter
          onCancel={onClose}
          submitting={mutation.isPending}
          submitLabel={t("orgDetail.activateModal.submit")}
        />
      </form>
    </ModalShell>
  );
}

// ---------- Set as complimentary ----------

function SetCompModal({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const { t } = useTranslation("admin");
  const { accessToken } = useAuth();
  const invalidate = useInvalidateOrgDetail(orgId);
  const [reason, setReason] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { reason };
      if (endsAt) body.ends_at = new Date(endsAt).toISOString();
      return apiFetch(`/api/v1/admin/organizations/${orgId}/subscription/set-comp`, {
        method: "POST",
        token: accessToken,
        body,
      });
    },
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: () => setError(t("orgDetail.setCompModal.errorGeneric")),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      setError(t("orgDetail.setCompModal.errorReasonRequired"));
      return;
    }
    setError(null);
    mutation.mutate();
  }

  return (
    <ModalShell title={t("orgDetail.setCompModal.title")} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block text-sm font-medium">
          {t("orgDetail.setCompModal.reasonLabel")}
          <textarea
            required
            minLength={1}
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder={t("orgDetail.setCompModal.reasonPlaceholder")}
            className="mt-1 block w-full rounded-md border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
        <label className="block text-sm font-medium">
          {t("orgDetail.setCompModal.endsAtLabel")}
          <input
            type="date"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className="mt-1 block h-10 w-full rounded-md border border-border bg-bg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
        {error ? (
          <p
            role="alert"
            className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        ) : null}
        <ModalFooter
          onCancel={onClose}
          submitting={mutation.isPending}
          submitLabel={t("orgDetail.setCompModal.submit")}
        />
      </form>
    </ModalShell>
  );
}

// ---------- Nastavit Enterprise cenu ----------

function SetEnterpriseModal({
  orgId,
  userCount,
  onClose,
}: {
  orgId: string;
  userCount: number | undefined;
  onClose: () => void;
}) {
  const { t } = useTranslation("admin");
  const locale = useLocale();
  const { accessToken } = useAuth();
  const invalidate = useInvalidateOrgDetail(orgId);
  const [overrideKc, setOverrideKc] = useState<string>("");
  const [periodMonths, setPeriodMonths] = useState<string>("12");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const overrideMinor = overrideKc ? Number(overrideKc) * 100 : null;
  const previewTotal =
    overrideMinor != null && userCount != null ? userCount * overrideMinor : null;

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        override_price_per_user_minor: overrideMinor,
        period_months: Number(periodMonths),
      };
      if (notes) body.notes = notes;
      return apiFetch(`/api/v1/admin/organizations/${orgId}/subscription/set-enterprise`, {
        method: "POST",
        token: accessToken,
        body,
      });
    },
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: () => setError(t("orgDetail.setEnterpriseModal.errorGeneric")),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!overrideKc) {
      setError(t("orgDetail.setEnterpriseModal.errorPriceRequired"));
      return;
    }
    if (!periodMonths || Number(periodMonths) < 1) {
      setError(t("orgDetail.setEnterpriseModal.errorPeriodInvalid"));
      return;
    }
    setError(null);
    mutation.mutate();
  }

  return (
    <ModalShell title={t("orgDetail.setEnterpriseModal.title")} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block text-sm font-medium">
          {t("orgDetail.setEnterpriseModal.priceLabel")}
          <input
            type="number"
            min={0}
            required
            value={overrideKc}
            onChange={(e) => setOverrideKc(e.target.value)}
            className="mt-1 block h-10 w-full rounded-md border border-border bg-bg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
        <label className="block text-sm font-medium">
          {t("orgDetail.setEnterpriseModal.periodLabel")}
          <input
            type="number"
            min={1}
            max={120}
            required
            value={periodMonths}
            onChange={(e) => setPeriodMonths(e.target.value)}
            className="mt-1 block h-10 w-full rounded-md border border-border bg-bg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
        <label className="block text-sm font-medium">
          {t("orgDetail.setEnterpriseModal.notesLabel")}
          <textarea
            value={notes}
            maxLength={2000}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="mt-1 block w-full rounded-md border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
        {previewTotal !== null ? (
          <p
            data-testid="enterprise-preview"
            className="rounded-md border border-border-subtle bg-surface-overlay p-3 text-sm text-text-secondary"
          >
            {t("orgDetail.setEnterpriseModal.monthlyTotalPrefix")}
            <span className="font-semibold text-text-primary">
              {formatMoneyMinor(previewTotal, "CZK", locale)}
            </span>
            {t("orgDetail.setEnterpriseModal.perMonthExVat")}
          </p>
        ) : userCount == null ? (
          <p className="text-xs text-text-tertiary">
            {t("orgDetail.setEnterpriseModal.previewUnavailable")}
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        ) : null}
        <ModalFooter
          onCancel={onClose}
          submitting={mutation.isPending}
          submitLabel={t("orgDetail.setEnterpriseModal.submit")}
        />
      </form>
    </ModalShell>
  );
}

// ---------- Extend trial ----------

function ExtendTrialModal({
  orgId,
  currentEndsAt,
  onClose,
}: {
  orgId: string;
  currentEndsAt: string | null | undefined;
  onClose: () => void;
}) {
  const { t } = useTranslation("admin");
  const locale = useLocale();
  const { accessToken } = useAuth();
  const invalidate = useInvalidateOrgDetail(orgId);
  const [days, setDays] = useState<string>("30");
  const [error, setError] = useState<string | null>(null);

  const previewEndsAt = (() => {
    if (!currentEndsAt || !days) return null;
    const base = new Date(currentEndsAt).getTime();
    const ms = base + Number(days) * 24 * 3600 * 1000;
    if (Number.isNaN(ms)) return null;
    return formatDate(new Date(ms), locale, { dateStyle: "long" });
  })();

  const mutation = useMutation({
    mutationFn: async () => {
      return apiFetch(`/api/v1/admin/organizations/${orgId}/subscription/extend-trial`, {
        method: "POST",
        token: accessToken,
        body: { days: Number(days) },
      });
    },
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: () => setError(t("orgDetail.extendTrialModal.errorGeneric")),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const n = Number(days);
    if (!Number.isFinite(n) || n < 1 || n > 365) {
      setError(t("orgDetail.extendTrialModal.errorDaysRange"));
      return;
    }
    setError(null);
    mutation.mutate();
  }

  return (
    <ModalShell title={t("orgDetail.extendTrialModal.title")} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block text-sm font-medium">
          {t("orgDetail.extendTrialModal.daysLabel")}
          <input
            type="number"
            min={1}
            max={365}
            required
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="mt-1 block h-10 w-32 rounded-md border border-border bg-bg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
        {previewEndsAt ? (
          <p
            data-testid="extend-preview"
            className="rounded-md border border-border-subtle bg-surface-overlay p-3 text-sm text-text-secondary"
          >
            {t("orgDetail.extendTrialModal.newEndPrefix")}
            <span className="font-semibold text-text-primary">{previewEndsAt}</span>
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        ) : null}
        <ModalFooter
          onCancel={onClose}
          submitting={mutation.isPending}
          submitLabel={t("orgDetail.extendTrialModal.submit")}
        />
      </form>
    </ModalShell>
  );
}

// ---------- Cancel subscription ----------

function CancelModal({
  orgId,
  orgName,
  onClose,
}: {
  orgId: string;
  orgName: string;
  onClose: () => void;
}) {
  const { t } = useTranslation("admin");
  const { accessToken } = useAuth();
  const invalidate = useInvalidateOrgDetail(orgId);
  const [confirmName, setConfirmName] = useState("");
  const [effectiveAt, setEffectiveAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Confirm by typing the org's plan display name (the most prominent
  // identifier on the drawer). The exact match is intentionally strict —
  // we want the operator to think before clicking.
  const confirmMatches = orgName.length > 0 && confirmName === orgName;

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {};
      if (effectiveAt) body.effective_at = new Date(effectiveAt).toISOString();
      return apiFetch(`/api/v1/admin/organizations/${orgId}/subscription/cancel`, {
        method: "POST",
        token: accessToken,
        body,
      });
    },
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: () => setError(t("orgDetail.cancelModal.errorGeneric")),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!confirmMatches) return;
    setError(null);
    mutation.mutate();
  }

  return (
    <ModalShell title={t("orgDetail.cancelModal.title")} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <p className="text-sm text-text-secondary">
          {t("orgDetail.cancelModal.confirmPrefix")}
          <span className="font-medium text-text-primary">{orgName}</span>
        </p>
        <input
          type="text"
          value={confirmName}
          onChange={(e) => setConfirmName(e.target.value)}
          placeholder={orgName}
          className="block h-10 w-full rounded-md border border-border bg-bg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-danger"
        />
        <label className="block text-sm font-medium">
          {t("orgDetail.cancelModal.effectiveAtLabel")}
          <input
            type="date"
            value={effectiveAt}
            onChange={(e) => setEffectiveAt(e.target.value)}
            className="mt-1 block h-10 w-full rounded-md border border-border bg-bg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
        {error ? (
          <p
            role="alert"
            className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            className="inline-flex h-10 items-center justify-center rounded-md bg-transparent px-4 text-sm font-medium text-text-secondary hover:text-text-primary disabled:opacity-50"
          >
            {t("orgDetail.cancelModal.cancel")}
          </button>
          <button
            type="submit"
            disabled={!confirmMatches || mutation.isPending}
            className="inline-flex h-10 items-center justify-center rounded-md bg-danger px-5 text-sm font-semibold text-white hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mutation.isPending
              ? t("orgDetail.cancelModal.submitting")
              : t("orgDetail.cancelModal.submit")}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function ModalFooter({
  onCancel,
  submitting,
  submitLabel,
}: {
  onCancel: () => void;
  submitting: boolean;
  submitLabel: string;
}) {
  const { t } = useTranslation("admin");
  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        disabled={submitting}
        className="inline-flex h-10 items-center justify-center rounded-md bg-transparent px-4 text-sm font-medium text-text-secondary hover:text-text-primary disabled:opacity-50"
      >
        {t("orgDetail.modalFooter.cancel")}
      </button>
      <button
        type="submit"
        disabled={submitting}
        className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-text-on-accent hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? t("orgDetail.modalFooter.submitting") : submitLabel}
      </button>
    </div>
  );
}

const ROLE_LABEL_KEY: Record<string, ParseKeys<"admin">> = {
  admin: "orgDetail.role.admin",
  manager: "orgDetail.role.manager",
  salesperson: "orgDetail.role.salesperson",
};

function MembersList({ orgId }: { orgId: string }) {
  const { t } = useTranslation("admin");
  const { data, isPending } = useAdminOrgUsers(orgId);
  const items = data?.items ?? [];
  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <h3 className="text-base font-semibold">{t("orgDetail.membersList.title")}</h3>
      <p className="mt-1 text-xs text-text-tertiary">
        {t("orgDetail.membersList.impersonationNote")}
      </p>
      {isPending ? (
        <p className="mt-3 text-sm text-text-tertiary">{t("orgDetail.membersList.loading")}</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-text-tertiary">{t("orgDetail.membersList.empty")}</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((u) => (
            <MemberRow key={u.id} user={u} />
          ))}
        </ul>
      )}
    </div>
  );
}

function MemberRow({ user }: { user: AdminOrgUserRow }) {
  const { t } = useTranslation("admin");
  const { accessToken, setAccessToken } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Self-impersonation, super-admin targets, and inactive users are all
  // backend-rejected — gray the button rather than letting the user
  // click into an error.
  const disabled = user.is_super_admin || !user.is_active;

  async function handleImpersonate() {
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch<ImpersonateOut>(`/api/v1/admin/users/${user.id}/impersonate`, {
        method: "POST",
        token: accessToken,
      });
      setAccessToken(res.access_token);
      navigate("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("orgDetail.membersList.impersonateError"));
      setBusy(false);
    }
  }

  const roleKey = ROLE_LABEL_KEY[user.role];

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-md border border-border-subtle bg-surface-overlay px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-medium text-text-primary">{user.name || user.email}</span>
          <span className="text-xs text-text-tertiary">{user.email}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
          <span>{roleKey ? t(roleKey) : user.role}</span>
          {user.is_super_admin ? (
            <span className="rounded-full bg-info-subtle px-2 py-0.5 text-info">
              {t("orgDetail.membersList.superAdminBadge")}
            </span>
          ) : null}
          {!user.is_active ? (
            <span className="rounded-full bg-surface px-2 py-0.5 text-text-tertiary">
              {t("orgDetail.membersList.inactiveBadge")}
            </span>
          ) : null}
          {error ? (
            <span className="text-danger" role="alert">
              {error}
            </span>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={handleImpersonate}
        disabled={disabled || busy}
        className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-surface px-3 text-xs font-medium text-text-primary hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? t("orgDetail.membersList.impersonating") : t("orgDetail.membersList.impersonateButton")}
      </button>
    </li>
  );
}

function ActivityTimeline({ orgId }: { orgId: string }) {
  const { t } = useTranslation("admin");
  const locale = useLocale();
  const { data, isPending } = useAdminOrgActivity(orgId);
  const items = data?.items ?? [];
  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <h3 className="text-base font-semibold">{t("orgDetail.activityTimeline.title")}</h3>
      {isPending ? (
        <p className="mt-3 text-sm text-text-tertiary">{t("orgDetail.activityTimeline.loading")}</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-text-tertiary">{t("orgDetail.activityTimeline.empty")}</p>
      ) : (
        <ol className="mt-4 space-y-3">
          {items.map((row) => {
            const action = typeof row.payload?.action === "string" ? row.payload.action : "—";
            const summary = Object.entries(row.payload ?? {})
              .filter(([k]) => k !== "action")
              .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
              .join(", ");
            return (
              <li key={row.id} className="flex flex-col gap-1 border-l-2 border-border-subtle pl-3">
                <div className="flex flex-wrap items-baseline gap-2 text-sm">
                  <span className="font-medium text-text-primary">{action}</span>
                  <span className="text-text-tertiary">·</span>
                  <span className="text-text-secondary">
                    {row.actor?.name ?? t("orgDetail.activityTimeline.systemActor")}
                  </span>
                  <span className="text-text-tertiary">·</span>
                  <span className="text-text-tertiary">
                    {formatDate(row.created_at, locale, {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
                {summary ? <p className="text-xs text-text-tertiary">{summary}</p> : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
