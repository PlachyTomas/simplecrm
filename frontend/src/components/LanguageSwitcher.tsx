import { useTranslation } from "react-i18next";

import { LANGUAGE_LABEL, type Language, SUPPORTED_LANGUAGES } from "@/lib/i18n/languages";
import { useUpdateLanguage } from "@/lib/i18n/useUpdateLanguage";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface LanguageSwitcherProps {
  /**
   * Persist the choice to the user's account (Settings). Left off for the
   * pre-login auth pages, where there's no account yet — those only switch
   * the running UI language.
   */
  persistToAccount?: boolean;
  className?: string;
}

/**
 * Segmented control that switches the app language. Mirrors `ThemeToggle`'s
 * house radiogroup styling so the two sit side by side in Settings.
 */
export function LanguageSwitcher({ persistToAccount = false, className }: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation("settings");
  const toast = useToast();
  const update = useUpdateLanguage();

  function select(lang: Language) {
    if (lang === i18n.resolvedLanguage) return;
    if (persistToAccount) {
      update.mutate(lang, {
        onSuccess: () => toast.success(t("appearance.languageSaved")),
        onError: () => toast.error(t("appearance.languageSaveFailed")),
      });
    } else {
      void i18n.changeLanguage(lang);
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={t("appearance.language")}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border bg-surface p-0.5",
        className,
      )}
    >
      {SUPPORTED_LANGUAGES.map((lang) => {
        const active = i18n.resolvedLanguage === lang;
        return (
          <button
            key={lang}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={LANGUAGE_LABEL[lang]}
            onClick={() => select(lang)}
            className={cn(
              "inline-flex h-7 items-center rounded-sm px-2 text-xs font-medium transition-colors duration-fast",
              active
                ? "bg-accent-subtle text-accent"
                : "text-text-tertiary hover:bg-surface-overlay hover:text-text-primary",
            )}
          >
            {LANGUAGE_LABEL[lang]}
          </button>
        );
      })}
    </div>
  );
}
