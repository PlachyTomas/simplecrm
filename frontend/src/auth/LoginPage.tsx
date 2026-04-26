import { Sparkles } from "lucide-react";
import { type FormEvent, useContext, useState } from "react";
import { useNavigate } from "react-router-dom";

import { AuthContext } from "@/auth/AuthContext";
import { API_BASE_URL, apiFetch } from "@/lib/api";
import { ThemeToggle } from "@/lib/ThemeToggle";

const GOOGLE_LOGIN_PATH = "/api/v1/auth/google/login";
// Dev login panel is double-gated: never appears in a production bundle
// (`import.meta.env.MODE === "production"`) AND requires the explicit
// `VITE_DEV_AUTH_ENABLED=true` flag set on the dev compose service. Both
// must be true. See docker-compose.dev.yml for the wiring.
const DEV_AUTH_ENABLED =
  import.meta.env.MODE !== "production" &&
  import.meta.env.VITE_DEV_AUTH_ENABLED === "true";

interface DevLoginResponse {
  access_token: string;
}

function DevLoginPanel() {
  const auth = useContext(AuthContext);
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@example.com");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch<DevLoginResponse>("/api/v1/auth/dev-login", {
        method: "POST",
        body: { email },
      });
      auth?.setAccessToken(res.access_token);
      navigate("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dev-login selhal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 rounded-md border border-border-subtle bg-surface-elevated p-4 text-left"
    >
      <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
        Dev login
      </p>
      <p className="mt-1 text-xs text-text-secondary">
        Obchází Google OAuth. Aktivní jen když backend běží v režimu{" "}
        <code className="rounded bg-surface px-1 py-0.5 font-mono">dev</code>.
      </p>
      <label className="mt-3 block">
        <span className="text-xs font-medium text-text-tertiary">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text-primary"
        />
      </label>
      {error ? (
        <p className="mt-2 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-text-primary hover:border-accent hover:text-accent disabled:opacity-50"
      >
        {busy ? "Přihlašuji…" : "Přihlásit jako dev uživatel"}
      </button>
    </form>
  );
}

export function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle variant="compact" />
      </div>
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

        {DEV_AUTH_ENABLED ? <DevLoginPanel /> : null}
      </div>
    </div>
  );
}
