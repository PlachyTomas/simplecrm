import { ArrowLeft, Mail } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import {
  type CampaignOut,
  useEmailCampaign,
  useEmailCampaigns,
} from "@/app/companies/bulk-email/useBulkEmail";
import { EmptyState } from "@/components/ui/empty-state";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { usePageTitle } from "@/lib/usePageTitle";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  sent: "Odesláno",
  failed: "Selhalo",
  skipped: "Přeskočeno",
};

const STATUS_CLASS: Record<string, string> = {
  sent: "text-success",
  failed: "text-danger",
  skipped: "text-text-tertiary",
};

export function EmailCampaignsPage() {
  usePageTitle("Historie hromadných e-mailů");
  const { data, isPending, isError } = useEmailCampaigns();
  const { data: user } = useCurrentUser();
  const [openId, setOpenId] = useState<string | null>(null);

  const locale = user?.organization?.locale ?? "cs-CZ";
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6">
        <Link
          to="/app/companies"
          className="inline-flex items-center gap-1 text-sm text-text-tertiary hover:text-text-primary"
        >
          <ArrowLeft size={14} strokeWidth={1.75} /> Zpět na firmy
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Historie hromadných e-mailů</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Přehled odeslaných kampaní a stav doručení jednotlivých příjemců.
        </p>
      </div>

      {isError ? (
        <div className="rounded-md border border-danger-subtle bg-danger-subtle px-4 py-3 text-sm text-danger">
          Historii se nepodařilo načíst.
        </div>
      ) : !isPending && (data?.items.length ?? 0) === 0 ? (
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState
            icon={Mail}
            title="Zatím žádné kampaně"
            body="Až odešlete hromadný e-mail, najdete ho tady i s výsledkem doručení."
          />
        </div>
      ) : (
        <ul className="space-y-2">
          {(data?.items ?? []).map((c) => (
            <li key={c.id} className="overflow-hidden rounded-lg border border-border bg-surface">
              <button
                type="button"
                onClick={() => setOpenId((id) => (id === c.id ? null : c.id))}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-overlay"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text-primary">{c.subject}</p>
                  <p className="text-xs text-text-tertiary">{fmt.format(new Date(c.created_at))}</p>
                </div>
                <CampaignCounts c={c} />
              </button>
              {openId === c.id ? <CampaignDetail id={c.id} /> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CampaignCounts({ c }: { c: CampaignOut }) {
  return (
    <div className="flex shrink-0 gap-3 text-xs tabular-nums">
      <span className="text-success">{c.sent_count} odesláno</span>
      {c.failed_count > 0 ? <span className="text-danger">{c.failed_count} selhalo</span> : null}
      {c.skipped_count > 0 ? (
        <span className="text-text-tertiary">{c.skipped_count} přeskočeno</span>
      ) : null}
    </div>
  );
}

function CampaignDetail({ id }: { id: string }) {
  const { data, isPending } = useEmailCampaign(id);
  if (isPending) {
    return <p className="px-4 py-3 text-sm text-text-tertiary">Načítání…</p>;
  }
  if (!data) return null;
  return (
    <div className="border-t border-border-subtle">
      <table className="min-w-full divide-y divide-border-subtle text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-text-tertiary">
            <th className="px-4 py-2 font-medium">Firma</th>
            <th className="px-4 py-2 font-medium">E-mail</th>
            <th className="px-4 py-2 font-medium">Stav</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {data.recipients.map((r, i) => (
            <tr key={`${r.email}-${i}`}>
              <td className="px-4 py-2 text-text-secondary">{r.company_name}</td>
              <td className="px-4 py-2 text-text-tertiary">{r.email || "—"}</td>
              <td className={cn("px-4 py-2 font-medium", STATUS_CLASS[r.status])}>
                {STATUS_LABEL[r.status] ?? r.status}
                {r.error && r.status !== "sent" ? (
                  <span className="ml-1 text-xs text-text-tertiary">({r.error})</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
