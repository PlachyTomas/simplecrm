/**
 * Settings → Klávesové zkratky: the complete shortcut catalog (shared
 * with the in-app `?` dialog via `ShortcutsList`). Personal section —
 * every role gets it; there is nothing to configure, only to learn.
 */

import { useTranslation } from "react-i18next";

import { ShortcutsList } from "@/app/shortcuts/ShortcutsList";

export function ShortcutsSection() {
  const { t } = useTranslation("settings");
  return (
    <section className="max-w-xl rounded-lg border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold">{t("shortcutsSection.title")}</h2>
      <p className="mt-1 text-sm text-text-tertiary">{t("shortcutsSection.subtitle")}</p>
      <div className="mt-5">
        <ShortcutsList />
      </div>
    </section>
  );
}
