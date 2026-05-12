import { ArrowLeft, Sparkles } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { authErrorCode, login } from "@/auth/api";
import { useAuth } from "@/auth/useAuth";
import { ApiError, API_BASE_URL } from "@/lib/api";
import { ThemeToggle } from "@/lib/ThemeToggle";
import { usePageTitle } from "@/lib/usePageTitle";

const GOOGLE_LOGIN_PATH = "/api/v1/auth/google/login";

interface ErrorState {
  message: string;
  showGoogleCta?: boolean;
}

export function LoginPage() {
  usePageTitle("Přihlášení");
  const navigate = useNavigate();
  const { setAccessToken } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<ErrorState | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await login({ email, password });
      setAccessToken(res.access_token);
      navigate("/app");
    } catch (err) {
      if (err instanceof ApiError) {
        const code = authErrorCode(err.body);
        if (code === "oauth_only_account") {
          setError({
            message:
              "Tento e-mail je registrován přes Google. Použijte prosím přihlášení přes Google.",
            showGoogleCta: true,
          });
        } else {
          setError({ message: "Nesprávný e-mail nebo heslo." });
        }
      } else {
        setError({ message: "Přihlášení se nezdařilo. Zkuste to prosím znovu." });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-bg px-4">
      <Link
        to="/"
        className="absolute left-4 top-4 inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-overlay hover:text-text-primary"
      >
        <ArrowLeft size={16} strokeWidth={1.75} aria-hidden />
        Zpět na úvod
      </Link>
      <div className="absolute right-4 top-4">
        <ThemeToggle variant="compact" />
      </div>
      <main
        aria-labelledby="login-title"
        className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-md"
      >
        <div
          aria-hidden
          className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-md bg-highlight text-text-on-accent"
        >
          <Sparkles size={24} strokeWidth={1.75} />
        </div>
        <h1 id="login-title" className="text-center text-2xl font-semibold">
          Přihlášení do SimpleCRM
        </h1>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-text-secondary">E-mail</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-text-secondary">Heslo</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>

          {error ? (
            <div role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger">
              <p>{error.message}</p>
              {error.showGoogleCta ? (
                <a
                  href={`${API_BASE_URL}${GOOGLE_LOGIN_PATH}`}
                  className="mt-2 inline-block text-sm font-medium underline"
                >
                  Přihlásit se přes Google
                </a>
              ) : null}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:opacity-50"
          >
            {submitting ? "Přihlašování…" : "Přihlásit se"}
          </button>
          <div className="text-right">
            <Link to="/forgot-password" className="text-sm text-text-secondary underline">
              Zapomněli jste heslo?
            </Link>
          </div>
        </form>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs uppercase tracking-wide text-text-tertiary">nebo</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <a
          href={`${API_BASE_URL}${GOOGLE_LOGIN_PATH}`}
          className="hover:bg-bg-subtle inline-flex h-10 w-full items-center justify-center rounded-md border border-border bg-bg px-5 text-sm font-medium text-text-primary transition-colors duration-fast"
        >
          Přihlásit se přes Google
        </a>

        <p className="mt-6 text-center text-sm text-text-secondary">
          Nemáte účet?{" "}
          <Link to="/signup" className="font-medium text-accent underline">
            Zaregistrovat se
          </Link>
        </p>
      </main>
    </div>
  );
}
