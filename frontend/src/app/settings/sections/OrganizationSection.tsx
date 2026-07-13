import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { InvoiceDetailsCard } from "@/app/settings/InvoiceDetailsCard";
import { useOrgUsers } from "@/app/settings/useUsersTeams";
import { useAuth } from "@/auth/useAuth";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { useCurrentSubscription } from "@/components/billing/useCurrentSubscription";
import {
  billingErrorCode,
  billingErrorMessage,
  isSeatUpgradePaymentRequired,
  useSeatChangeInit,
} from "@/components/billing/usePayments";
import { ApiError, apiFetch } from "@/lib/api";
import { formatDate, formatMoneyMinor } from "@/lib/format";
import { useLocale } from "@/lib/i18n/useLocale";
import { cn } from "@/lib/utils";
import type { components } from "@/types/api.generated";

interface SubscriptionLite {
  seat_count: number;
  status: string;
  current_period_ends_at: string | null;
  plan: { code: string; display_name_cs: string };
  pending_plan: { code: string; display_name_cs: string } | null;
  pending_seat_count: number | null;
  pending_user_deactivations: string[] | null;
  effective_price_per_user_minor: number | null;
}

export function OrganizationSection() {
  const { t } = useTranslation("settings");
  const subQuery = useCurrentSubscription();
  const sub = subQuery.data as SubscriptionLite | null | undefined;
  const usersPage = useOrgUsers();
  const activeUsers = (usersPage.data?.items ?? []).filter((u) => u.is_active);

  if (subQuery.isPending) {
    return (
      <section className="rounded-lg border border-border bg-surface p-6 text-sm text-text-tertiary">
        {t("organization.loading")}
      </section>
    );
  }
  if (!sub) {
    return (
      <section
        className="rounded-lg border border-border bg-surface p-6 text-sm text-danger"
        role="alert"
      >
        {t("organization.error")}
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <InvoiceDetailsCard />
      <SeatCountCard sub={sub} activeUserCount={activeUsers.length} activeUsers={activeUsers} />
      <BillingIntervalCard sub={sub} />
    </div>
  );
}

interface SeatCountCardProps {
  sub: SubscriptionLite;
  activeUserCount: number;
  activeUsers: components["schemas"]["UserOut"][];
}

function SeatCountCard({ sub, activeUserCount, activeUsers }: SeatCountCardProps) {
  const { t } = useTranslation("settings");
  const { t: tBilling } = useTranslation("billing");
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const locale = useLocale();
  const seatChangeInit = useSeatChangeInit();
  const [draft, setDraft] = useState<string>(String(sub.seat_count));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    setDraft(String(sub.seat_count));
    setPicked(new Set());
    setError(null);
  }, [sub.seat_count]);

  const target = Number(draft);
  const targetValid = Number.isFinite(target) && target >= 1 && target <= 500;
  const needsToDeactivate = targetValid && target < activeUserCount;
  const requiredCount = needsToDeactivate ? activeUserCount - target : 0;
  const pickedArray = useMemo(() => Array.from(picked), [picked]);

  const mutation = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      return apiFetch("/api/v1/organizations/current/subscription/seat-count", {
        method: "PUT",
        token: accessToken,
        body: {
          seat_count: target,
          deactivate_user_ids: needsToDeactivate ? pickedArray : [],
        },
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["subscription", "current"] });
      void qc.invalidateQueries({ queryKey: ["billing-summary", "current"] });
      void qc.invalidateQueries({ queryKey: ["users", "org"] });
      setSavedFlash(true);
      setPicked(new Set());
      window.setTimeout(() => setSavedFlash(false), 2500);
    },
    onError: (err) => {
      // Active org bumping above contracted_seat_count → backend 402s
      // with a redirect_endpoint pointing at /payments/seat-change-init.
      // Kick off the prorated ComGate charge; the call returns
      // `accepted` while the webhook lands the actual outcome — we
      // route to the billing-return page in `pending` state so the
      // user sees a "processing…" panel until /subscription updates.
      if (isSeatUpgradePaymentRequired(err)) {
        setRedirecting(true);
        seatChangeInit.mutate(
          { seat_count: target },
          {
            onSuccess: () => {
              window.location.assign("/app/billing/return?status=pending");
            },
            onError: (initErr) => {
              setRedirecting(false);
              setError(billingErrorMessage(billingErrorCode(initErr), tBilling));
            },
          },
        );
        return;
      }
      if (err instanceof ApiError) {
        const detail = (err.body as { detail?: { detail?: string } })?.detail;
        const msg = typeof detail === "string" ? detail : detail?.detail;
        setError(msg ?? t("organization.seatCount.error.generic"));
      } else {
        setError(t("organization.seatCount.error.connection"));
      }
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!targetValid) {
      setError(t("organization.seatCount.error.range"));
      return;
    }
    if (target === sub.seat_count) return;
    if (needsToDeactivate && picked.size !== requiredCount) {
      setError(
        t("organization.seatCount.error.needsSelectAll", {
          target,
          required: requiredCount,
        }),
      );
      return;
    }
    mutation.mutate();
  }

  function togglePick(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Anyone who's still active and isn't the founding admin themself.
  const eligibleVictims = activeUsers.filter((u) => u.id !== me?.id);

  // Resolve the queued user names so the banner can spell them out instead
  // of just dropping IDs on the screen.
  const queuedIds = new Set(sub.pending_user_deactivations ?? []);
  const queuedUsers = activeUsers.filter((u) => queuedIds.has(u.id));
  const periodEndsAt = sub.current_period_ends_at
    ? formatDate(sub.current_period_ends_at, locale, { dateStyle: "long" })
    : null;

  function cancelQueue() {
    setError(null);
    // PUT seat-count with target == current is the documented cancel signal.
    apiFetch("/api/v1/organizations/current/subscription/seat-count", {
      method: "PUT",
      token: accessToken,
      body: { seat_count: sub.seat_count, deactivate_user_ids: [] },
    })
      .then(() => {
        void qc.invalidateQueries({ queryKey: ["subscription", "current"] });
        void qc.invalidateQueries({ queryKey: ["billing-summary", "current"] });
        void qc.invalidateQueries({ queryKey: ["users", "org"] });
      })
      .catch(() => setError(t("organization.seatCount.error.generic")));
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-border bg-surface p-6">
      <header>
        <h2 className="text-lg font-semibold">{t("organization.seatCount.title")}</h2>
        <p className="mt-1 text-sm text-text-tertiary">
          {t("organization.seatCount.subtitle", {
            activeCount: activeUserCount,
            seatCount: sub.seat_count,
          })}
        </p>
      </header>

      {sub.pending_seat_count != null && queuedUsers.length > 0 ? (
        <div
          data-testid="seat-count-pending-banner"
          className="mt-4 rounded-md border border-info/40 bg-info-subtle p-4"
        >
          <p className="text-sm font-medium text-text-primary">
            {periodEndsAt
              ? t("organization.seatCount.pendingBanner.textWithDate", {
                  count: sub.pending_seat_count,
                  date: periodEndsAt,
                })
              : t("organization.seatCount.pendingBanner.text", {
                  count: sub.pending_seat_count,
                })}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            {t("organization.seatCount.pendingBanner.loseAccess", {
              names: queuedUsers.map((u) => u.name).join(", "),
            })}
          </p>
          <button
            type="button"
            onClick={cancelQueue}
            className="mt-3 inline-flex h-9 items-center justify-center rounded-md border border-border bg-surface px-3 text-xs font-medium text-text-primary transition-colors duration-fast hover:bg-surface-overlay"
          >
            {t("organization.seatCount.pendingBanner.cancelButton")}
          </button>
        </div>
      ) : null}

      <label className="mt-4 block text-sm font-medium text-text-primary">
        {t("organization.seatCount.targetLabel")}
        <input
          type="number"
          min={1}
          max={500}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="mt-1 block h-10 w-32 rounded-md border border-border bg-bg px-3 text-sm tabular-nums text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </label>

      <LiveSeatCostPreview
        targetValid={targetValid}
        target={target}
        currentSeatCount={sub.seat_count}
        perUserMinor={sub.effective_price_per_user_minor}
        planCode={sub.plan.code}
      />

      {needsToDeactivate ? (
        <div className="mt-4 rounded-md border border-warning/40 bg-warning-subtle p-4">
          <p className="text-sm font-medium text-text-primary">
            {t("organization.seatCount.willLoseAccess", {
              count: requiredCount,
              dateSuffix: periodEndsAt ? ` (${periodEndsAt})` : "",
            })}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            {t("organization.seatCount.deactivateHint")}
          </p>
          <ul className="mt-3 space-y-1.5">
            {eligibleVictims.map((u) => {
              const checked = picked.has(u.id);
              return (
                <li key={u.id}>
                  <label className="flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-surface-overlay">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePick(u.id)}
                      className="h-4 w-4"
                    />
                    <span className="font-medium text-text-primary">{u.name}</span>
                    <span className="text-xs text-text-tertiary">· {u.email}</span>
                  </label>
                </li>
              );
            })}
            {eligibleVictims.length === 0 ? (
              <li className="text-xs text-text-tertiary">
                {t("organization.seatCount.noEligible")}
              </li>
            ) : null}
          </ul>
          <p className="mt-2 text-xs text-text-tertiary">
            {t("organization.seatCount.selectedOfRequired", {
              picked: picked.size,
              required: requiredCount,
            })}
          </p>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex items-center gap-3">
        <button
          type="submit"
          disabled={
            mutation.isPending ||
            redirecting ||
            !targetValid ||
            target === sub.seat_count ||
            (needsToDeactivate && picked.size !== requiredCount)
          }
          className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {redirecting
            ? t("organization.seatCount.redirecting")
            : mutation.isPending
              ? t("organization.shared.saving")
              : t("organization.seatCount.submit")}
        </button>
        {savedFlash ? (
          <span className="text-sm text-success" role="status">
            {t("organization.shared.saved")}
          </span>
        ) : null}
      </div>
    </form>
  );
}

function LiveSeatCostPreview({
  targetValid,
  target,
  currentSeatCount,
  perUserMinor,
  planCode,
}: {
  targetValid: boolean;
  target: number;
  currentSeatCount: number;
  perUserMinor: number | null;
  planCode: string;
}) {
  // Live preview while the admin is typing a new target. Recomputes from
  // `target × per-user × interval-multiplier` so they see what the next
  // bill will look like before committing. Skipped when the per-user
  // price isn't surfaced (trial / enterprise / comp orgs sit outside
  // the published ladder).
  const { t } = useTranslation("settings");
  const locale = useLocale();
  if (!targetValid) return null;
  if (perUserMinor == null) return null;
  if (planCode !== "monthly" && planCode !== "annual") return null;
  const isAnnual = planCode === "annual";
  const periodLabel = isAnnual
    ? t("organization.livePreview.perYear")
    : t("organization.livePreview.perMonth");
  const multiplier = isAnnual ? 12 : 1;
  const newTotal = perUserMinor * multiplier * target;
  const oldTotal = perUserMinor * multiplier * currentSeatCount;
  const delta = newTotal - oldTotal;
  const unchanged = target === currentSeatCount;
  return (
    <div
      className="mt-3 rounded-md border border-border-subtle bg-surface-overlay px-3 py-2.5 text-sm"
      data-testid="seat-cost-preview"
    >
      <p className="text-text-secondary">
        {t("organization.livePreview.newCostLabel")}{" "}
        <span className="font-semibold tabular-nums text-text-primary">
          {formatMoneyMinor(newTotal, "CZK", locale)}
        </span>{" "}
        / {periodLabel}
        {!unchanged ? (
          <>
            {" ("}
            <span className={delta > 0 ? "text-warning" : "text-success"}>
              {delta > 0 ? "+" : "−"}
              {formatMoneyMinor(Math.abs(delta), "CZK", locale)} / {periodLabel}
            </span>
            {")"}
          </>
        ) : null}
      </p>
    </div>
  );
}

function BillingIntervalCard({ sub }: { sub: SubscriptionLite }) {
  const { t } = useTranslation("settings");
  const locale = useLocale();
  const { accessToken } = useAuth();
  const qc = useQueryClient();

  const currentInterval: "monthly" | "annual" | "other" =
    sub.plan.code === "monthly" ? "monthly" : sub.plan.code === "annual" ? "annual" : "other";
  const pendingInterval: "monthly" | "annual" | null =
    sub.pending_plan?.code === "monthly"
      ? "monthly"
      : sub.pending_plan?.code === "annual"
        ? "annual"
        : null;
  const effective = pendingInterval ?? currentInterval;

  const [target, setTarget] = useState<"monthly" | "annual">(
    effective === "annual" ? "annual" : "monthly",
  );
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setTarget(effective === "annual" ? "annual" : "monthly");
  }, [effective]);

  const mutation = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      return apiFetch("/api/v1/organizations/current/subscription/change-interval", {
        method: "POST",
        token: accessToken,
        body: { plan_code: target },
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["subscription", "current"] });
      void qc.invalidateQueries({ queryKey: ["billing-summary", "current"] });
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2500);
    },
    onError: () => setError(t("organization.billingInterval.error")),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (target === effective) return;
    mutation.mutate();
  }

  // For trial-stage orgs, the "current" interval is the trial; the
  // pending plan is what they intend to land on. Show that wording
  // explicitly so the admin understands what changes when.
  const isTrial = sub.plan.code === "trial";
  const switchTakesEffect = isTrial
    ? t("organization.billingInterval.switchTakesEffect.trial")
    : t("organization.billingInterval.switchTakesEffect.default");

  // Published price ladder: 99 CZK / month vs 996 CZK / year. Mirrors
  // `compute_savings` on the backend. We render both the percent and
  // the absolute currency amount the org would save this year on its
  // current seat count.
  const MONTHLY_PER_USER_MINOR = 9900;
  const ANNUAL_PER_USER_MINOR = 99600;
  const annualSavingsMinor =
    Math.max(0, MONTHLY_PER_USER_MINOR * 12 - ANNUAL_PER_USER_MINOR) * sub.seat_count;
  const annualSubtitle =
    annualSavingsMinor > 0
      ? t("organization.billingInterval.annual.subtitleWithSavings", {
          amount: formatMoneyMinor(annualSavingsMinor, "CZK", locale),
        })
      : t("organization.billingInterval.annual.subtitleNoSavings");

  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-border bg-surface p-6">
      <header>
        <h2 className="text-lg font-semibold">{t("organization.billingInterval.title")}</h2>
        <p className="mt-1 text-sm text-text-tertiary">
          {t("organization.billingInterval.subtitleTemplate", { when: switchTakesEffect })}
        </p>
      </header>

      <div
        role="radiogroup"
        aria-label={t("organization.billingInterval.title")}
        className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        <IntervalRadio
          code="monthly"
          title={t("organization.billingInterval.monthly.title")}
          subtitle={t("organization.billingInterval.monthly.subtitle")}
          selected={target === "monthly"}
          onSelect={() => setTarget("monthly")}
        />
        <IntervalRadio
          code="annual"
          title={t("organization.billingInterval.annual.title")}
          subtitle={annualSubtitle}
          selected={target === "annual"}
          onSelect={() => setTarget("annual")}
        />
      </div>

      {pendingInterval && pendingInterval !== currentInterval ? (
        <p className="mt-4 rounded-md border border-info/40 bg-info-subtle px-3 py-2 text-sm text-info">
          {t("organization.billingInterval.pendingNotice", {
            current: t(`organization.billingInterval.currentLabel.${currentInterval}`),
            pending: t(`organization.billingInterval.pendingLabel.${pendingInterval}`),
          })}
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex items-center gap-3">
        <button
          type="submit"
          disabled={mutation.isPending || target === effective}
          className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {mutation.isPending ? t("organization.shared.saving") : t("organization.billingInterval.submit")}
        </button>
        {savedFlash ? (
          <span className="text-sm text-success" role="status">
            {t("organization.shared.saved")}
          </span>
        ) : null}
      </div>
    </form>
  );
}

function IntervalRadio({
  code,
  title,
  subtitle,
  selected,
  onSelect,
}: {
  code: string;
  title: string;
  subtitle: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      data-interval={code}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "cursor-pointer rounded-md border-2 bg-surface p-4 transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        selected ? "border-accent shadow-sm" : "border-border hover:border-text-tertiary",
      )}
    >
      <p className="text-sm font-semibold text-text-primary">{title}</p>
      <p className="mt-0.5 text-xs text-text-tertiary">{subtitle}</p>
    </div>
  );
}
