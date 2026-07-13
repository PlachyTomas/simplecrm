import { Compass } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { ThemeToggle } from "@/lib/ThemeToggle";
import { usePageTitle } from "@/lib/usePageTitle";
import { marketingPath } from "@/marketing/slugs";
import { useMarketingLang } from "@/marketing/useMarketingLang";

export function NotFoundPage() {
  const { t } = useTranslation("marketing");
  const lang = useMarketingLang();
  usePageTitle(t("meta.notFoundTitle"));
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle variant="compact" />
      </div>
      <main className="w-full max-w-md rounded-lg border border-border bg-surface p-6 text-center shadow-md">
        <div
          aria-hidden
          className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-md bg-accent-subtle text-accent"
        >
          <Compass size={24} strokeWidth={1.75} />
        </div>
        <h1 className="text-2xl font-semibold">{t("notFound.title")}</h1>
        <p className="mt-3 text-base text-text-secondary">{t("notFound.body")}</p>
        <Link
          to={marketingPath("landing", lang)}
          className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
        >
          {t("notFound.backHome")}
        </Link>
      </main>
    </div>
  );
}
