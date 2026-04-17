import { Sparkles } from "lucide-react";

import { API_BASE_URL } from "@/lib/api";

const GOOGLE_LOGIN_PATH = "/api/v1/auth/google/login";

export function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 text-center shadow-md">
        <div
          aria-hidden
          className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-md bg-highlight text-text-on-accent"
        >
          <Sparkles size={24} strokeWidth={1.75} />
        </div>
        <h1 className="text-2xl font-semibold">Vítejte v SimpleCRM</h1>
        <p className="mt-3 text-base text-text-secondary">
          Přihlaste se pomocí Google účtu. První uživatel získá 30 dní zdarma.
        </p>

        <a
          href={`${API_BASE_URL}${GOOGLE_LOGIN_PATH}`}
          className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
        >
          Přihlásit se přes Google
        </a>

        <p className="mt-4 text-xs text-text-tertiary">
          Kliknutím souhlasíte s obchodními podmínkami a se zpracováním osobních údajů.
        </p>
      </div>
    </div>
  );
}
