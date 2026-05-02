import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";

import {
  type AdminSubscriptionOut,
  useAdminOrgActivity,
  useAdminOrgSubscription,
} from "@/admin/hooks";
import { useAuth } from "@/auth/useAuth";
import { formatCzkMinor } from "@/components/billing/format";
import { ApiError, apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

const dateFmt = new Intl.DateTimeFormat("cs-CZ", { dateStyle: "long" });
const dateTimeFmt = new Intl.DateTimeFormat("cs-CZ", {
  dateStyle: "short",
  timeStyle: "short",
});

function fmtDate(iso: string | null | undefined): string {
  return iso ? dateFmt.format(new Date(iso)) : "—";
}

function statusPillSpec(sub: AdminSubscriptionOut): { label: string; className: string } {
  if (sub.is_comp) {
    return { label: "Komplementární", className: "bg-info-subtle text-info" };
  }
  if (sub.plan?.code === "enterprise" && sub.status === "active") {
    return { label: "Aktivní · Enterprise", className: "bg-info-subtle text-info" };
  }
  switch (sub.status) {
    case "trialing":
      return { label: "Zkušební verze", className: "bg-info-subtle text-info" };
    case "pending_activation":
      return { label: "Čeká na platbu", className: "bg-warning-subtle text-warning" };
    case "active":
      return { label: "Aktivní", className: "bg-success-subtle text-success" };
    case "past_due":
      return { label: "Po splatnosti", className: "bg-warning-subtle text-warning" };
    case "canceled":
      return { label: "Zrušeno", className: "bg-danger-subtle text-danger" };
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

type ActiveModal =
  | "activate"
  | "set-comp"
  | "set-enterprise"
  | "extend-trial"
  | "cancel"
  | null;

export function OrgDetailDrawer({ orgId, userCount }: OrgDetailDrawerProps) {
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
        Načítání detailu…
      </section>
    );
  }

  if (!sub) {
    return (
      <section className="rounded-lg border border-border bg-surface p-6 text-sm text-danger" role="alert">
        Načítání detailu se nezdařilo.
      </section>
    );
  }

  const pill = statusPillSpec(sub);

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
            <dt className="text-xs uppercase tracking-wider text-text-tertiary">Plán</dt>
            <dd className="text-text-primary">{sub.plan?.code ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-text-tertiary">Stav</dt>
            <dd className="text-text-primary">{sub.status}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-text-tertiary">Začátek</dt>
            <dd className="text-text-primary">{fmtDate(sub.started_at)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-text-tertiary">Konec období</dt>
            <dd className="text-text-primary">{fmtDate(sub.current_period_ends_at)}</dd>
          </div>
          {sub.canceled_at ? (
            <div>
              <dt className="text-xs uppercase tracking-wider text-text-tertiary">Zrušeno</dt>
              <dd className="text-text-primary">{fmtDate(sub.canceled_at)}</dd>
            </div>
          ) : null}
          {sub.effective_price_per_user_minor != null ? (
            <div>
              <dt className="text-xs uppercase tracking-wider text-text-tertiary">
                Efektivní cena
              </dt>
              <dd className="text-text-primary">
                {formatCzkMinor(sub.effective_price_per_user_minor)} / uživatel
              </dd>
            </div>
          ) : null}
        </dl>

        {sub.is_comp && sub.comp_reason ? (
          <p className="mt-4 rounded-md border border-border-subtle bg-surface-overlay p-3 text-sm text-text-secondary">
            <span className="font-medium text-text-primary">Důvod komplimentu: </span>
            {sub.comp_reason}
          </p>
        ) : null}

        {sub.notes ? (
          <p className="mt-4 rounded-md border border-border-subtle bg-surface-overlay p-3 text-sm text-text-secondary">
            <span className="font-medium text-text-primary">Poznámky: </span>
            {sub.notes}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          <ActionButton onClick={() => setActiveModal("activate")}>
            Aktivovat předplatné
          </ActionButton>
          <ActionButton onClick={() => setActiveModal("set-comp")}>
            Nastavit jako komplementární
          </ActionButton>
          <ActionButton onClick={() => setActiveModal("set-enterprise")}>
            Nastavit Enterprise cenu
          </ActionButton>
          <ActionButton onClick={() => setActiveModal("extend-trial")}>
            Prodloužit zkušební dobu
          </ActionButton>
          <ActionButton onClick={() => setActiveModal("cancel")} variant="danger">
            Zrušit předplatné
          </ActionButton>
        </div>
      </div>

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
            aria-label="Zavřít"
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

// ---------- Aktivovat předplatné ----------

function ActivateModal({ orgId, onClose }: { orgId: string; onClose: () => void }) {
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
      return apiFetch(
        `/api/v1/admin/organizations/${orgId}/subscription/activate`,
        { method: "POST", token: accessToken, body },
      );
    },
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (err) => {
      setError(
        err instanceof ApiError
          ? `Aktivace selhala: ${JSON.stringify(err.body)}`
          : "Aktivace selhala. Zkuste to prosím znovu.",
      );
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (planCode === "enterprise" && !overrideKc) {
      setError("Pro Enterprise plán je vyžadována cena za uživatele.");
      return;
    }
    setError(null);
    mutation.mutate();
  }

  return (
    <ModalShell title="Aktivovat předplatné" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block text-sm font-medium">
          Plán
          <select
            value={planCode}
            onChange={(e) => setPlanCode(e.target.value as typeof planCode)}
            className="mt-1 block h-10 w-full rounded-md border border-border bg-bg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="monthly">Měsíční</option>
            <option value="annual">Roční</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </label>
        <label className="block text-sm font-medium">
          Cena za uživatele (Kč bez DPH){" "}
          <span className="text-text-tertiary">
            {planCode === "enterprise" ? "(povinné)" : "(volitelné)"}
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
          Délka období (měsíce){" "}
          <span className="text-text-tertiary">
            {planCode === "enterprise" ? "(povinné)" : "(volitelné, jinak default plánu)"}
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
        <ModalFooter onCancel={onClose} submitting={mutation.isPending} submitLabel="Aktivovat" />
      </form>
    </ModalShell>
  );
}

// ---------- Nastavit komplementární ----------

function SetCompModal({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const { accessToken } = useAuth();
  const invalidate = useInvalidateOrgDetail(orgId);
  const [reason, setReason] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { reason };
      if (endsAt) body.ends_at = new Date(endsAt).toISOString();
      return apiFetch(
        `/api/v1/admin/organizations/${orgId}/subscription/set-comp`,
        { method: "POST", token: accessToken, body },
      );
    },
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: () => setError("Změna selhala. Zkuste to prosím znovu."),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      setError("Důvod je povinný.");
      return;
    }
    setError(null);
    mutation.mutate();
  }

  return (
    <ModalShell title="Nastavit jako komplementární" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block text-sm font-medium">
          Důvod
          <textarea
            required
            minLength={1}
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Např. partner / interní použití…"
            className="mt-1 block w-full rounded-md border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
        <label className="block text-sm font-medium">
          Platnost do (volitelné)
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
        <ModalFooter onCancel={onClose} submitting={mutation.isPending} submitLabel="Nastavit" />
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
  const { accessToken } = useAuth();
  const invalidate = useInvalidateOrgDetail(orgId);
  const [overrideKc, setOverrideKc] = useState<string>("");
  const [periodMonths, setPeriodMonths] = useState<string>("12");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const overrideMinor = overrideKc ? Number(overrideKc) * 100 : null;
  const previewTotal =
    overrideMinor != null && userCount != null
      ? userCount * overrideMinor
      : null;

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        override_price_per_user_minor: overrideMinor,
        period_months: Number(periodMonths),
      };
      if (notes) body.notes = notes;
      return apiFetch(
        `/api/v1/admin/organizations/${orgId}/subscription/set-enterprise`,
        { method: "POST", token: accessToken, body },
      );
    },
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: () => setError("Změna selhala. Zkuste to prosím znovu."),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!overrideKc) {
      setError("Cena za uživatele je povinná.");
      return;
    }
    if (!periodMonths || Number(periodMonths) < 1) {
      setError("Délka období musí být alespoň 1 měsíc.");
      return;
    }
    setError(null);
    mutation.mutate();
  }

  return (
    <ModalShell title="Nastavit Enterprise cenu" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block text-sm font-medium">
          Cena za uživatele (Kč bez DPH)
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
          Délka období (měsíce)
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
          Poznámky (volitelné)
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
            Měsíční účet:{" "}
            <span className="font-semibold text-text-primary">
              {formatCzkMinor(previewTotal)}
            </span>{" "}
            / měsíc bez DPH
          </p>
        ) : userCount == null ? (
          <p className="text-xs text-text-tertiary">
            Náhled celkové ceny zatím není dostupný (počet uživatelů se načítá).
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
        <ModalFooter onCancel={onClose} submitting={mutation.isPending} submitLabel="Uložit" />
      </form>
    </ModalShell>
  );
}

// ---------- Prodloužit zkušební dobu ----------

function ExtendTrialModal({
  orgId,
  currentEndsAt,
  onClose,
}: {
  orgId: string;
  currentEndsAt: string | null | undefined;
  onClose: () => void;
}) {
  const { accessToken } = useAuth();
  const invalidate = useInvalidateOrgDetail(orgId);
  const [days, setDays] = useState<string>("30");
  const [error, setError] = useState<string | null>(null);

  const previewEndsAt = (() => {
    if (!currentEndsAt || !days) return null;
    const base = new Date(currentEndsAt).getTime();
    const ms = base + Number(days) * 24 * 3600 * 1000;
    if (Number.isNaN(ms)) return null;
    return dateFmt.format(new Date(ms));
  })();

  const mutation = useMutation({
    mutationFn: async () => {
      return apiFetch(
        `/api/v1/admin/organizations/${orgId}/subscription/extend-trial`,
        { method: "POST", token: accessToken, body: { days: Number(days) } },
      );
    },
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: () => setError("Prodloužení selhalo. Zkuste to prosím znovu."),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const n = Number(days);
    if (!Number.isFinite(n) || n < 1 || n > 365) {
      setError("Počet dní musí být mezi 1 a 365.");
      return;
    }
    setError(null);
    mutation.mutate();
  }

  return (
    <ModalShell title="Prodloužit zkušební dobu" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block text-sm font-medium">
          Počet dní
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
            Nový konec zkušební doby:{" "}
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
        <ModalFooter onCancel={onClose} submitting={mutation.isPending} submitLabel="Prodloužit" />
      </form>
    </ModalShell>
  );
}

// ---------- Zrušit předplatné ----------

function CancelModal({
  orgId,
  orgName,
  onClose,
}: {
  orgId: string;
  orgName: string;
  onClose: () => void;
}) {
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
      return apiFetch(
        `/api/v1/admin/organizations/${orgId}/subscription/cancel`,
        { method: "POST", token: accessToken, body },
      );
    },
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: () => setError("Zrušení selhalo. Zkuste to prosím znovu."),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!confirmMatches) return;
    setError(null);
    mutation.mutate();
  }

  return (
    <ModalShell title="Zrušit předplatné" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <p className="text-sm text-text-secondary">
          Pro potvrzení napište přesný název plánu:{" "}
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
          Účinnost (volitelné)
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
            Zrušit
          </button>
          <button
            type="submit"
            disabled={!confirmMatches || mutation.isPending}
            className="inline-flex h-10 items-center justify-center rounded-md bg-danger px-5 text-sm font-semibold text-white hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mutation.isPending ? "Rušíme…" : "Zrušit předplatné"}
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
  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        disabled={submitting}
        className="inline-flex h-10 items-center justify-center rounded-md bg-transparent px-4 text-sm font-medium text-text-secondary hover:text-text-primary disabled:opacity-50"
      >
        Zrušit
      </button>
      <button
        type="submit"
        disabled={submitting}
        className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-text-on-accent hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Odesíláme…" : submitLabel}
      </button>
    </div>
  );
}

function ActivityTimeline({ orgId }: { orgId: string }) {
  const { data, isPending } = useAdminOrgActivity(orgId);
  const items = data?.items ?? [];
  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <h3 className="text-base font-semibold">Historie změn</h3>
      {isPending ? (
        <p className="mt-3 text-sm text-text-tertiary">Načítání…</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-text-tertiary">
          Žádná aktivita dosud nezaznamenána.
        </p>
      ) : (
        <ol className="mt-4 space-y-3">
          {items.map((row) => {
            const action =
              typeof row.payload?.action === "string" ? row.payload.action : "—";
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
                    {row.actor?.name ?? "Systém"}
                  </span>
                  <span className="text-text-tertiary">·</span>
                  <span className="text-text-tertiary">
                    {dateTimeFmt.format(new Date(row.created_at))}
                  </span>
                </div>
                {summary ? (
                  <p className="text-xs text-text-tertiary">{summary}</p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
