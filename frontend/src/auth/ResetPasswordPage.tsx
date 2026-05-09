import { Sparkles } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { authErrorCode, authErrorMessage, confirmPasswordReset } from "@/auth/api";
import { useAuth } from "@/auth/useAuth";
import { ApiError } from "@/lib/api";
import { ThemeToggle } from "@/lib/ThemeToggle";
import { usePageTitle } from "@/lib/usePageTitle";

export function ResetPasswordPage() {
  usePageTitle("Nastavení nového hesla");
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const { setAccessToken } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tokenInvalid, setTokenInvalid] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);
    if (password !== confirm) {
      setErrorMessage("Hesla se neshodují.");
      return;
    }
    if (!token) {
      setTokenInvalid(true);
      return;
    }
    setSubmitting(true);
    try {
      const res = await confirmPasswordReset({ token, newPassword: password });
      setAccessToken(res.access_token);
      navigate("/app");
    } catch (err) {
      if (err instanceof ApiError) {
        const code = authErrorCode(err.body);
        if (code === "token_invalid") {
          setTokenInvalid(true);
        } else if (code === "weak_password") {
          setErrorMessage(
            authErrorMessage(err.body) ??
              "Heslo nesplňuje požadavky (alespoň 12 znaků, písmeno + číslice).",
          );
        } else {
          setErrorMessage("Nastavení hesla se nezdařilo. Zkuste to prosím znovu.");
        }
      } else {
        setErrorMessage("Nastavení hesla se nezdařilo.");
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
        aria-labelledby="reset-title"
        className="w-full max-w-md rounded-lg border border-border bg-surface p-6 text-center shadow-md"
      >
        <div
          aria-hidden
          className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-md bg-highlight text-text-on-accent"
        >
          <Sparkles size={24} strokeWidth={1.75} />
        </div>
        <h1 id="reset-title" className="text-2xl font-semibold">
          Nastavení nového hesla
        </h1>

        {tokenInvalid ? (
          <div className="mt-4 space-y-3">
            <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger">
              Tento odkaz pro obnovení hesla je neplatný nebo již vypršel.
            </p>
            <Link to="/forgot-password" className="text-sm text-accent underline">
              Vyžádat si nový odkaz
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4 text-left" noValidate>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-text-secondary">Nové heslo</span>
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
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-text-secondary">
                Heslo znovu
              </span>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              />
            </label>
            {errorMessage ? (
              <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger">
                {errorMessage}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-10 w-full items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent hover:bg-accent-hover disabled:opacity-50"
            >
              {submitting ? "Ukládání…" : "Nastavit nové heslo"}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
