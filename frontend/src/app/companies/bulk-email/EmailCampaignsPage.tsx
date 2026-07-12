import type { ParseKeys } from "i18next";
import { ArrowLeft, Mail } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
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

const STATUS_LABEL_KEY: Record<string, ParseKeys<"emails">> = {
  sent: "campaigns.statusSent",
  failed: "campaigns.statusFailed",
  skipped: "campaigns.statusSkipped",
};

const STATUS_CLASS: Record<string, string> = {
  sent: "text-success",
  failed: "text-danger",
  skipped: "text-text-tertiary",
};

export function EmailCampaignsPage() {
  const { t } = useTranslation("emails");
  usePageTitle(t("campaigns.pageTitle"));
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
          <ArrowLeft size={14} strokeWidth={1.75} /> {t("campaigns.backToCompanies")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{t("campaigns.pageTitle")}</h1>
        <p className="mt-1 text-sm text-text-tertiary">{t("campaigns.subtitle")}</p>
      </div>

      {isError ? (
        <div className="rounded-md border border-danger-subtle bg-danger-subtle px-4 py-3 text-sm text-danger">
          {t("campaigns.loadError")}
        </div>
      ) : !isPending && (data?.items.length ?? 0) === 0 ? (
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState
            icon={Mail}
            title={t("campaigns.emptyTitle")}
            body={t("campaigns.emptyBody")}
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
  const { t } = useTranslation("emails");
  return (
    <div className="flex shrink-0 gap-3 text-xs tabular-nums">
      <span className="text-success">{t("campaigns.sentCount", { count: c.sent_count })}</span>
      {c.failed_count > 0 ? (
        <span className="text-danger">{t("campaigns.failedCount", { count: c.failed_count })}</span>
      ) : null}
      {c.skipped_count > 0 ? (
        <span className="text-text-tertiary">
          {t("campaigns.skippedCount", { count: c.skipped_count })}
        </span>
      ) : null}
    </div>
  );
}

function CampaignDetail({ id }: { id: string }) {
  const { t } = useTranslation("emails");
  const { data, isPending } = useEmailCampaign(id);
  if (isPending) {
    return <p className="px-4 py-3 text-sm text-text-tertiary">{t("campaigns.loading")}</p>;
  }
  if (!data) return null;
  return (
    <div className="border-t border-border-subtle">
      <table className="min-w-full divide-y divide-border-subtle text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-text-tertiary">
            <th className="px-4 py-2 font-medium">{t("campaigns.tableCompany")}</th>
            <th className="px-4 py-2 font-medium">{t("campaigns.tableEmail")}</th>
            <th className="px-4 py-2 font-medium">{t("campaigns.tableStatus")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {data.recipients.map((r, i) => (
            <tr key={`${r.email}-${i}`}>
              <td className="px-4 py-2 text-text-secondary">{r.company_name}</td>
              <td className="px-4 py-2 text-text-tertiary">{r.email || "—"}</td>
              <td className={cn("px-4 py-2 font-medium", STATUS_CLASS[r.status])}>
                {STATUS_LABEL_KEY[r.status] ? t(STATUS_LABEL_KEY[r.status]!) : r.status}
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
