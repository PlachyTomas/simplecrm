import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { useAuth } from "@/auth/useAuth";
import { ApiError, apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

type BlockedCompanyOut = components["schemas"]["BlockedCompanyOut"];
type BlockedCompanyCreate = components["schemas"]["BlockedCompanyCreate"];
type BlockedCompanyReason = BlockedCompanyCreate["reason_category"];
type Page = components["schemas"]["Page_BlockedCompanyOut_"];

const QUERY_KEY = ["blocked-companies"] as const;

// Czech labels keyed by the backend enum — single source of truth for
// dropdown + list-row rendering.
const REASON_LABEL: Record<BlockedCompanyReason, string> = {
  competitor: "Konkurent",
  do_not_contact: "Nekontaktovat",
  bankrupt: "Insolvence",
  legal_issue: "Právní problém",
  other: "Jiný",
};

const dateFmt = new Intl.DateTimeFormat("cs-CZ", { dateStyle: "short" });

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
  const list = useBlockedCompanies();
  const add = useAddBlockedCompany();
  const del = useDeleteBlockedCompany();
  const [ico, setIco] = useState("");
  const [reason, setReason] = useState<BlockedCompanyReason>("competitor");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!/^\d{8}$/.test(ico)) {
      setError("IČO musí mít 8 číslic.");
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
        setError("Toto IČO už na blokovaném seznamu je.");
      } else {
        setError("Přidání selhalo. Zkuste to prosím znovu.");
      }
    }
  };

  const items = list.data?.items ?? [];

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold">Blokovaná IČO</h2>
      <p className="mt-1 text-sm text-text-tertiary">
        Obchodníci nemohou přidat firmu s tímto IČO. Doplňující název doplníme z ARES.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_2fr_auto]"
      >
        <label className="block">
          <span className="text-xs font-medium text-text-secondary">IČO</span>
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
          <span className="text-xs font-medium text-text-secondary">Kategorie</span>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as BlockedCompanyReason)}
            className="mt-1 block h-9 w-full rounded-md border border-border bg-surface-overlay px-2 text-sm"
          >
            {(Object.keys(REASON_LABEL) as BlockedCompanyReason[]).map((key) => (
              <option key={key} value={key}>
                {REASON_LABEL[key]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-text-secondary">Poznámka (volitelné)</span>
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
            {add.isPending ? "Přidávám…" : "Přidat"}
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
              <th className="px-3 py-2 font-medium">IČO</th>
              <th className="px-3 py-2 font-medium">Firma</th>
              <th className="px-3 py-2 font-medium">Kategorie</th>
              <th className="px-3 py-2 font-medium">Poznámka</th>
              <th className="px-3 py-2 font-medium">Přidáno</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {list.isPending ? (
              <tr>
                <td className="px-3 py-3 text-sm text-text-tertiary" colSpan={6}>
                  Načítání…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-sm text-text-tertiary" colSpan={6}>
                  Zatím nic. Přidejte první IČO výše.
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
                    {REASON_LABEL[row.reason_category]}
                  </td>
                  <td className="px-3 py-2 text-text-secondary">{row.note ?? "—"}</td>
                  <td className="px-3 py-2 text-text-tertiary">
                    {dateFmt.format(new Date(row.created_at))}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Odstranit IČO ${row.ico} z blokovaných?`)) {
                          del.mutate(row.id);
                        }
                      }}
                      aria-label={`Odstranit ${row.ico}`}
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
