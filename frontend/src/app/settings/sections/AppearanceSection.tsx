import { useTranslation } from "react-i18next";

import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/lib/ThemeToggle";

export function AppearanceSection() {
  const { t } = useTranslation("settings");
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
    </section>
  );
}
