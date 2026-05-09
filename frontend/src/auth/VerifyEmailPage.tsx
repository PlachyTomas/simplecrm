import { Sparkles } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import {
  authErrorCode,
  authErrorMessage,
  checkVerifyToken,
  consumeVerifyToken,
} from "@/auth/api";
import { useAuth } from "@/auth/useAuth";
import { ApiError } from "@/lib/api";
import { ThemeToggle } from "@/lib/ThemeToggle";
import { usePageTitle } from "@/lib/usePageTitle";

type Phase =
  | { kind: "checking" }
  | { kind: "consuming" }
  | { kind: "needs_password"; email: string }
  | { kind: "error"; message: string }
  | { kind: "success" };

/**
 * Two-step verify flow:
 *   1. POST /verify-email/check  → { email, requires_password }
 *   2a. requires_password=false  → immediately POST /verify-email/consume,
 *       set in-memory access token, navigate to /app.
 *   2b. requires_password=true   → render a password form (the user is a
 *       Google-only account adding email/password login), then submit to
 *       /verify-email/consume with the password.
 */
export function VerifyEmailPage() {
  usePageTitle("Ověření e-mailu");
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const { setAccessToken } = useAuth();
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setPhase({ kind: "error", message: "Chybějící ověřovací token v odkazu." });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const check = await checkVerifyToken(token);
        if (cancelled) return;
        if (check.requires_password) {
          setPhase({ kind: "needs_password", email: check.email });
          return;
        }
        setPhase({ kind: "consuming" });
        const res = await consumeVerifyToken({ token });
        if (cancelled) return;
        setAccessToken(res.access_token);
        setPhase({ kind: "success" });
        navigate("/app");
      } catch (err) {
        if (cancelled) return;
        setPhase({
          kind: "error",
          message:
            err instanceof ApiError
              ? "Tento odkaz je neplatný nebo již vypršel. Vyžádejte si nový e-mail."
              : "Ověření se nepodařilo. Zkuste to prosím znovu.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleSubmitPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await consumeVerifyToken({ token, password });
      setAccessToken(res.access_token);
      setPhase({ kind: "success" });
      navigate("/app");
    } catch (err) {
      if (err instanceof ApiError && authErrorCode(err.body) === "weak_password") {
        setPhase({
          kind: "needs_password",
          email: phase.kind === "needs_password" ? phase.email : "",
        });
        // Show inline message via component-level error state
        setLocalError(
          authErrorMessage(err.body) ??
            "Heslo nesplňuje požadavky (alespoň 12 znaků, písmeno + číslice).",
        );
      } else if (err instanceof ApiError) {
        setPhase({
          kind: "error",
          message: "Tento odkaz je neplatný nebo již vypršel. Vyžádejte si nový e-mail.",
        });
      } else {
        setLocalError("Ověření se nepodařilo. Zkuste to prosím znovu.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle variant="compact" />
      </div>
      <main
        aria-labelledby="verify-title"
        className="w-full max-w-md rounded-lg border border-border bg-surface p-6 text-center shadow-md"
      >
        <div
          aria-hidden
          className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-md bg-highlight text-text-on-accent"
        >
          <Sparkles size={24} strokeWidth={1.75} />
        </div>
        <h1 id="verify-title" className="text-2xl font-semibold">
          Ověření e-mailu
        </h1>

        {phase.kind === "checking" || phase.kind === "consuming" ? (
          <p className="mt-4 text-sm text-text-secondary">Načítání…</p>
        ) : null}

        {phase.kind === "needs_password" ? (
          <form onSubmit={handleSubmitPassword} className="mt-6 space-y-4 text-left" noValidate>
            <p className="text-sm text-text-secondary">
              Účet pro <strong className="text-text-primary">{phase.email}</strong> nemá zatím
              nastavené heslo. Zvolte si ho prosím nyní — od příště se budete moci přihlásit jak
              přes Google, tak e-mailem.
            </p>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-text-secondary">Heslo</span>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              />
              <span className="mt-1 block text-xs text-text-tertiary">
                Alespoň 12 znaků, jedno písmeno a jedna číslice.
              </span>
            </label>
            {localError ? (
              <p
                role="alert"
                className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger"
              >
                {localError}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-10 w-full items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent hover:bg-accent-hover disabled:opacity-50"
            >
              {submitting ? "Ukládání…" : "Nastavit heslo a pokračovat"}
            </button>
          </form>
        ) : null}

        {phase.kind === "error" ? (
          <div className="mt-4 space-y-3">
            <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger">
              {phase.message}
            </p>
            <Link to="/login" className="text-sm text-accent underline">
              Zpět na přihlášení
            </Link>
          </div>
        ) : null}

        {phase.kind === "success" ? (
          <p className="mt-4 text-sm text-text-secondary">Přesměrovávám…</p>
        ) : null}
      </main>
    </div>
  );
}
