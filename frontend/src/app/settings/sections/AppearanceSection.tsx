import { MonitorSmartphone } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { IosInstallModal } from "@/app/pwa/IosInstallModal";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { testIds } from "@/lib/testids";
import { ThemeToggle } from "@/lib/ThemeToggle";
import { usePwaInstall } from "@/lib/usePwaInstall";

export function AppearanceSection() {
  const { t } = useTranslation("settings");
  const { canPrompt, isInstalled, isIos, promptInstall } = usePwaInstall();
  const [iosModalOpen, setIosModalOpen] = useState(false);
  // Hide entirely where installing is impossible (Firefox, already
  // installed) — no dead UI.
  const showInstall = !isInstalled && (canPrompt || isIos);

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold">{t("appearance.title")}</h2>
      <p className="mt-1 text-sm text-text-tertiary">{t("appearance.subtitle")}</p>
      <div className="mt-4">
        <ThemeToggle />
      </div>
      <div className="mt-6">
        <p className="mb-2 text-xs font-medium text-text-secondary">{t("appearance.language")}</p>
        <LanguageSwitcher persistToAccount />
      </div>
      {showInstall ? (
        <div className="mt-6">
          <p className="mb-2 text-xs font-medium text-text-secondary">
            {t("appearance.installApp.title")}
          </p>
          <p className="text-sm text-text-tertiary">{t("appearance.installApp.description")}</p>
          <button
            type="button"
            data-testid={testIds.pwa.settingsInstall}
            onClick={() => (isIos ? setIosModalOpen(true) : void promptInstall())}
            className="mt-3 inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary"
          >
            <MonitorSmartphone size={16} strokeWidth={1.75} aria-hidden />
            {t("appearance.installApp.button")}
          </button>
        </div>
      ) : null}
      <IosInstallModal open={iosModalOpen} onClose={() => setIosModalOpen(false)} />
    </section>
  );
}
