import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { useCurrentUser } from "@/auth/useCurrentUser";
import { isLanguage } from "@/lib/i18n/languages";

/**
 * One-way server → client language sync. When the account's stored language
 * differs from the running UI language — a fresh login, or a change made on
 * another device — adopt the server's value. This never writes back (the
 * switcher owns client → server), so the two directions can't fight.
 */
export function useSyncUserLanguage(): void {
  const { data: user } = useCurrentUser();
  const { i18n } = useTranslation();
  const serverLanguage = user?.language;

  useEffect(() => {
    if (isLanguage(serverLanguage) && serverLanguage !== i18n.resolvedLanguage) {
      void i18n.changeLanguage(serverLanguage);
    }
  }, [serverLanguage, i18n]);
}
