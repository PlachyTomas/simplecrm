import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { Language } from "@/lib/i18n/languages";
import { queryClient } from "@/lib/queryClient";

/**
 * Client → server language change. Optimistically switches the running UI
 * (i18next `changeLanguage`) before the request resolves, persists the choice
 * to the account, then invalidates the cached user so the server-synced value
 * matches what's already on screen.
 */
export function useUpdateLanguage() {
  const { accessToken } = useAuth();
  const { i18n } = useTranslation();

  return useMutation({
    mutationFn: async (language: Language) => {
      await i18n.changeLanguage(language);
      await apiFetch<Record<string, string>>("/api/v1/users/me/language", {
        method: "PATCH",
        token: accessToken,
        body: { language },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });
}
