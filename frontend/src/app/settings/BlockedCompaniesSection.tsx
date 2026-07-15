import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ParseKeys } from "i18next";
import { Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/auth/useAuth";
import { ApiError, apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useLocale } from "@/lib/i18n/useLocale";
import type { components } from "@/types/api.generated";

type BlockedCompanyOut = components["schemas"]["BlockedCompanyOut"];
type BlockedCompanyCreate = components["schemas"]["BlockedCompanyCreate"];
type BlockedCompanyReason = BlockedCompanyCreate["reason_category"];
type Page = components["schemas"]["Page_BlockedCompanyOut_"];

const QUERY_KEY = ["blocked-companies"] as const;

// Catalog keys keyed by the backend enum — single source of truth for
// dropdown + list-row rendering.
const REASON_LABEL_KEY: Record<BlockedCompanyReason, ParseKeys<"settings">> = {
  competitor: "blockedCompanies.reasons.competitor",
  do_not_contact: "blockedCompanies.reasons.do_not_contact",
  bankrupt: "blockedCompanies.reasons.bankrupt",
  legal_issue: "blockedCompanies.reasons.legal_issue",
  other: "blockedCompanies.reasons.other",
};

function useBlockedCompanies() {
  const { accessToken } = useAuth();
  return useQuery<Page>({
    queryKey: QUERY_KEY,
    enabled: !!accessToken,
    queryFn: () =>
      apiFetch<Page>("/api/v1/admin/blocked-companies?limit=100", { token: accessToken }),
  });
}

function useAddBlockedCompany() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<BlockedCompanyOut, Error, BlockedCompanyCreate>({
    mutationFn: (body) =>
      apiFetch<BlockedCompanyOut>("/api/v1/admin/blocked-companies", {
        method: "POST",
        token: accessToken,
        body: body as unknown as Record<string, unknown>,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

function useDeleteBlockedCompany() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) =>
      apiFetch<void>(`/api/v1/admin/blocked-companies/${id}`, {
        method: "DELETE",
        token: accessToken,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function BlockedCompaniesSection() {
  const { t } = useTranslation("settings");
  const list = useBlockedCompanies();
  const add = useAddBlockedCompany();
  const del = useDeleteBlockedCompany();
  const locale = useLocale();
  const [ico, setIco] = useState("");
  const [reason, setReason] = useState<BlockedCompanyReason>("competitor");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!/^\d{8}$/.test(ico)) {
      setError(t("blockedCompanies.errors.invalidIco"));
      return;
    }
    try {
      await add.mutateAsync({
        ico,
        reason_category: reason,
        note: note.trim() || null,
      });
      setIco("");
      setNote("");
      setReason("competitor");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(t("blockedCompanies.errors.duplicate"));
      } else {
        setError(t("blockedCompanies.errors.generic"));
      }
    }
  };

  const items = list.data?.items ?? [];

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold">{t("blockedCompanies.title")}</h2>
      <p className="mt-1 text-sm text-text-tertiary">{t("blockedCompanies.subtitle")}</p>

      <form
        onSubmit={handleSubmit}
        className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_2fr_auto]"
      >
        <label className="block">
          <span className="text-xs font-medium text-text-secondary">
            {t("blockedCompanies.form.icoLabel")}
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={ico}
            onChange={(e) => setIco(e.target.value.replace(/\D/g, "").slice(0, 8))}
            placeholder="27082440"
            className="mt-1 block h-9 w-full rounded-md border border-border bg-surface-overlay px-2 font-mono text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-text-secondary">
            {t("blockedCompanies.form.categoryLabel")}
          </span>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as BlockedCompanyReason)}
            className="mt-1 block h-9 w-full rounded-md border border-border bg-surface-overlay px-2 text-sm"
          >
            {(Object.keys(REASON_LABEL_KEY) as BlockedCompanyReason[]).map((key) => (
              <option key={key} value={key}>
                {t(REASON_LABEL_KEY[key])}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-text-secondary">
            {t("blockedCompanies.form.noteLabel")}
          </span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            className="mt-1 block h-9 w-full rounded-md border border-border bg-surface-overlay px-2 text-sm"
          />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={add.isPending}
            className="inline-flex h-9 items-center rounded-md bg-accent px-4 text-sm font-medium text-text-on-accent hover:bg-accent-hover disabled:opacity-60"
          >
            {add.isPending
              ? t("blockedCompanies.form.adding")
              : t("blockedCompanies.form.addButton")}
          </button>
        </div>
      </form>
      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-md border border-danger-subtle bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-md border border-border-subtle">
        <table className="w-full">
          <thead className="bg-surface-overlay text-left text-xs uppercase tracking-wider text-text-tertiary">
            <tr>
              <th className="px-3 py-2 font-medium">{t("blockedCompanies.table.ico")}</th>
              <th className="px-3 py-2 font-medium">{t("blockedCompanies.table.company")}</th>
              <th className="px-3 py-2 font-medium">{t("blockedCompanies.table.category")}</th>
              <th className="px-3 py-2 font-medium">{t("blockedCompanies.table.note")}</th>
              <th className="px-3 py-2 font-medium">{t("blockedCompanies.table.added")}</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {list.isPending ? (
              <tr>
                <td className="px-3 py-3 text-sm text-text-tertiary" colSpan={6}>
                  {t("blockedCompanies.loading")}
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-sm text-text-tertiary" colSpan={6}>
                  {t("blockedCompanies.empty")}
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.id} className="border-t border-border-subtle text-sm">
                  <td className="px-3 py-2 font-mono">{row.ico}</td>
                  <td className="px-3 py-2 text-text-secondary">
                    {row.ares_name ?? <span className="text-text-tertiary">—</span>}
                  </td>
                  <td className="px-3 py-2 text-text-secondary">
                    {t(REASON_LABEL_KEY[row.reason_category])}
                  </td>
                  <td className="px-3 py-2 text-text-secondary">{row.note ?? "—"}</td>
                  <td className="px-3 py-2 text-text-tertiary">
                    {formatDate(row.created_at, locale, { dateStyle: "short" })}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(t("blockedCompanies.removeConfirm", { ico: row.ico }))) {
                          del.mutate(row.id);
                        }
                      }}
                      aria-label={t("blockedCompanies.removeAriaLabel", { ico: row.ico })}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-danger-subtle hover:text-danger"
                    >
                      <Trash2 size={14} strokeWidth={1.75} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
