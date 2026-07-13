import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/auth/useAuth";
import { ApiError, apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useLocale } from "@/lib/i18n/useLocale";

export interface IntegrityFailure {
  invoice_id: string;
  invoice_number: string;
  kind: "pdf" | "isdoc";
  error: string;
}

export interface IntegrityRunOut {
  run_id: string;
  checked: number;
  ok: number;
  failed: number;
  failures: IntegrityFailure[];
  created_at: string | null;
}

function useLatestIntegrityRun() {
  const { accessToken } = useAuth();
  return useQuery<IntegrityRunOut | null>({
    queryKey: ["admin", "integrity", "last"],
    enabled: !!accessToken,
    staleTime: 30 * 1000,
    queryFn: async () => {
      try {
        return await apiFetch<IntegrityRunOut | null>("/api/v1/admin/invoices/integrity/last-run", {
          token: accessToken,
        });
      } catch (err) {
        if (err instanceof ApiError) return null;
        throw err;
      }
    },
  });
}

function useRunIntegrityCheck() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<IntegrityRunOut>("/api/v1/admin/invoices/integrity/check", {
        method: "POST",
        token: accessToken,
      }),
    onSuccess: (data) => {
      qc.setQueryData(["admin", "integrity", "last"], data);
    },
  });
}

export function IntegrityPanel() {
  const { t } = useTranslation("admin");
  const locale = useLocale();
  const lastRun = useLatestIntegrityRun();
  const runCheck = useRunIntegrityCheck();

  const data = lastRun.data ?? null;
  const noRunYet = lastRun.isSuccess && data === null;

  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{t("integrityPanel.title")}</h2>
          <p className="text-xs text-text-tertiary">{t("integrityPanel.description")}</p>
        </div>
        <button
          type="button"
          onClick={() => runCheck.mutate()}
          disabled={runCheck.isPending}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {runCheck.isPending ? t("integrityPanel.running") : t("integrityPanel.runButton")}
        </button>
      </div>

      {lastRun.isPending ? (
        <p className="mt-4 text-sm text-text-tertiary">{t("integrityPanel.loading")}</p>
      ) : noRunYet ? (
        <p className="mt-4 text-sm text-text-secondary">{t("integrityPanel.noRunYet")}</p>
      ) : data ? (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat label={t("integrityPanel.stats.checked")} value={data.checked} />
            <Stat
              label={t("integrityPanel.stats.ok")}
              value={data.ok}
              tone={data.ok === data.checked ? "ok" : "neutral"}
            />
            <Stat
              label={t("integrityPanel.stats.failed")}
              value={data.failed}
              tone={data.failed > 0 ? "danger" : "ok"}
            />
          </div>
          {data.created_at ? (
            <p className="text-xs text-text-tertiary">
              {t("integrityPanel.lastRun", {
                date: formatDate(data.created_at, locale, { dateStyle: "short", timeStyle: "short" }),
                runId: data.run_id.slice(0, 8),
              })}
            </p>
          ) : null}
          {data.failures.length > 0 ? (
            <ul className="space-y-1 rounded-md border border-danger-subtle bg-danger/5 p-3 text-xs">
              {data.failures.map((f, idx) => (
                <li key={`${f.invoice_id}-${f.kind}-${idx}`}>
                  <span className="font-medium">{f.invoice_number}</span>{" "}
                  <span className="text-text-tertiary">({f.kind})</span> — {f.error}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-success">{t("integrityPanel.allVerified")}</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

interface StatProps {
  label: string;
  value: number;
  tone?: "ok" | "danger" | "neutral";
}

function Stat({ label, value, tone = "neutral" }: StatProps) {
  const toneClass =
    tone === "ok" ? "text-success" : tone === "danger" ? "text-danger" : "text-text-primary";
  return (
    <div className="rounded-md border border-border bg-bg p-3">
      <p className={`text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      <p className="text-xs text-text-tertiary">{label}</p>
    </div>
  );
}
