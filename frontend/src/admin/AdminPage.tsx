import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { AdminBillingSettings } from "@/admin/AdminBillingSettings";
import { OrgDetailDrawer } from "@/admin/OrgDetailDrawer";
import { OrgList } from "@/admin/OrgList";
import { ThemeToggle } from "@/lib/ThemeToggle";
import { usePageTitle } from "@/lib/usePageTitle";
import { cn } from "@/lib/utils";

type AdminTab = "organizations" | "settings";

const TABS: { key: AdminTab; label: string }[] = [
  { key: "organizations", label: "Organizace" },
  { key: "settings", label: "Nastavení" },
];

export function AdminPage() {
  usePageTitle("Admin");
  const [activeTab, setActiveTab] = useState<AdminTab>("organizations");
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-8">
          <div>
            <h1 className="text-2xl font-semibold">Admin</h1>
            <p className="mt-0.5 text-sm text-text-tertiary">
              Správa organizací, předplatných a fakturačních údajů.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              to="/app"
              className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
            >
              <ArrowLeft size={16} strokeWidth={1.75} />
              Zpět do aplikace
            </Link>
          </div>
        </div>

        <nav aria-label="Sekce admin" className="mx-auto max-w-7xl px-4 md:px-8">
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
                    {tab.label}
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
              onSelect={setSelectedOrgId}
            />
            {selectedOrgId ? (
              <OrgDetailDrawer orgId={selectedOrgId} />
            ) : (
              <div className="hidden rounded-lg border border-dashed border-border bg-surface p-8 text-center text-sm text-text-tertiary md:block">
                Vyberte organizaci ze seznamu pro zobrazení detailu.
              </div>
            )}
          </div>
        ) : (
          <AdminBillingSettings />
        )}
      </main>
    </div>
  );
}
