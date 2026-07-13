import type { ParseKeys } from "i18next";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { AdminBillingSettings } from "@/admin/AdminBillingSettings";
import { IntegrityPanel } from "@/admin/IntegrityPanel";
import { InvoiceDetailDrawer } from "@/admin/InvoiceDetailDrawer";
import { InvoicesList } from "@/admin/InvoicesList";
import { OrgDetailDrawer } from "@/admin/OrgDetailDrawer";
import { OrgList } from "@/admin/OrgList";
import { useSyncUserLanguage } from "@/lib/i18n/useSyncUserLanguage";
import { ThemeToggle } from "@/lib/ThemeToggle";
import { usePageTitle } from "@/lib/usePageTitle";
import { cn } from "@/lib/utils";

type AdminTab = "organizations" | "invoices" | "settings";

const TABS: { key: AdminTab; labelKey: ParseKeys<"admin"> }[] = [
  { key: "organizations", labelKey: "page.tabs.organizations" },
  { key: "invoices", labelKey: "page.tabs.invoices" },
  { key: "settings", labelKey: "page.tabs.settings" },
];

export function AdminPage() {
  const { t } = useTranslation("admin");
  usePageTitle(t("page.title"));
  useSyncUserLanguage();
  const [activeTab, setActiveTab] = useState<AdminTab>("organizations");
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  // Carry the user_count alongside the selected id so the drawer's
  // Enterprise-price modal can render the live `users × override`
  // preview without a second fetch — the list row already has it.
  const [selectedUserCount, setSelectedUserCount] = useState<number | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-8">
          <div>
            <h1 className="text-2xl font-semibold">{t("page.title")}</h1>
            <p className="mt-0.5 text-sm text-text-tertiary">{t("page.subtitle")}</p>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              to="/app"
              className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
            >
              <ArrowLeft size={16} strokeWidth={1.75} />
              {t("page.backToApp")}
            </Link>
          </div>
        </div>

        <nav aria-label={t("page.sectionsAriaLabel")} className="mx-auto max-w-7xl px-4 md:px-8">
          <ul role="tablist" className="-mb-px flex gap-1">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <li key={tab.key} role="presentation">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveTab(tab.key)}
                    className={cn(
                      "inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors duration-fast",
                      isActive
                        ? "border-accent text-accent"
                        : "border-transparent text-text-secondary hover:text-text-primary",
                    )}
                  >
                    {t(tab.labelKey)}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
        {activeTab === "organizations" ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-[2fr_3fr]">
            <OrgList
              selectedOrgId={selectedOrgId}
              onSelect={(id, userCount) => {
                setSelectedOrgId(id);
                setSelectedUserCount(userCount);
              }}
            />
            {selectedOrgId ? (
              <OrgDetailDrawer orgId={selectedOrgId} userCount={selectedUserCount} />
            ) : (
              <div className="hidden rounded-lg border border-dashed border-border bg-surface p-8 text-center text-sm text-text-tertiary md:block">
                {t("page.selectOrgPrompt")}
              </div>
            )}
          </div>
        ) : activeTab === "invoices" ? (
          <div className="space-y-6">
            <IntegrityPanel />
            <div className="grid grid-cols-1 gap-6 md:grid-cols-[3fr_2fr]">
              <InvoicesList selectedInvoiceId={selectedInvoiceId} onSelect={setSelectedInvoiceId} />
              {selectedInvoiceId ? (
                <InvoiceDetailDrawer
                  invoiceId={selectedInvoiceId}
                  onSelectInvoice={setSelectedInvoiceId}
                />
              ) : (
                <div className="hidden rounded-lg border border-dashed border-border bg-surface p-8 text-center text-sm text-text-tertiary md:block">
                  {t("page.selectInvoicePrompt")}
                </div>
              )}
            </div>
          </div>
        ) : (
          <AdminBillingSettings />
        )}
      </main>
    </div>
  );
}
