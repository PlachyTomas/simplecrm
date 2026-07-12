import { ArrowLeft, Sparkles } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { authErrorCode, authErrorMessage, resendVerification, signup } from "@/auth/api";
import { useAuth } from "@/auth/useAuth";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ApiError, API_BASE_URL } from "@/lib/api";
import { ThemeToggle } from "@/lib/ThemeToggle";
import { usePageTitle } from "@/lib/usePageTitle";

const GOOGLE_LOGIN_PATH = "/api/v1/auth/google/login";

type Phase =
  | { kind: "form" }
  | { kind: "sent"; email: string }
  | { kind: "error"; message: string };

export function SignupPage() {
  usePageTitle("Registrace");
  const navigate = useNavigate();
  const { setAccessToken } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const [resendInfo, setResendInfo] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPhase({ kind: "form" });
    setSubmitting(true);
    try {
      const res = await signup({ email, password, name });
      // Brand-new signups now come back with a session — drop the user
      // into the app and let the "verify your email" banner do the rest.
      // The Google-only-linking branch still returns just `detail`, in
      // which case we keep the existing "check your email" panel.
      if (res.access_token) {
        setAccessToken(res.access_token);
        navigate("/app");
        return;
      }
      setPhase({ kind: "sent", email });
    } catch (err) {
      if (err instanceof ApiError) {
        const code = authErrorCode(err.body);
        if (code === "email_already_registered") {
          setPhase({
            kind: "error",
            message: "Tento e-mail už je u nás registrovaný. Přihlaste se, nebo si obnovte heslo.",
          });
        } else if (code === "weak_password") {
          setPhase({
            kind: "error",
            message:
              authErrorMessage(err.body) ??
              "Heslo nesplňuje požadavky (alespoň 12 znaků, písmeno + číslice).",
          });
        } else {
          setPhase({
            kind: "error",
            message: "Registrace se nezdařila. Zkuste to prosím znovu.",
          });
        }
      } else {
        setPhase({ kind: "error", message: "Registrace se nezdařila." });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (phase.kind !== "sent") return;
    setResendInfo(null);
    try {
      await resendVerification(phase.email);
      setResendInfo("Nový ověřovací e-mail jsme vám právě odeslali.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        const retryAfter =
          (err.body as { detail?: { retry_after_seconds?: number } } | undefined)?.detail
            ?.retry_after_seconds ?? 60;
        setResendInfo(`Počkejte prosím ${retryAfter} s před dalším pokusem.`);
      } else {
        setResendInfo("Odeslání se nezdařilo. Zkuste to prosím za chvíli.");
      }
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
        aria-labelledby="signup-title"
        className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-md"
      >
        <div
          aria-hidden
          className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-md bg-highlight text-text-on-accent"
        >
          <Sparkles size={24} strokeWidth={1.75} />
        </div>
        <h1 id="signup-title" className="text-center text-2xl font-semibold">
          {phase.kind === "sent" ? "Zkontrolujte svůj e-mail" : "Registrace do SimpleCRM"}
        </h1>

        {phase.kind === "sent" ? (
          <div className="mt-6 space-y-4 text-center">
            <p className="text-sm text-text-secondary">
              Na adresu <strong className="text-text-primary">{phase.email}</strong> jsme odeslali
              ověřovací e-mail. Kliknutím na odkaz dokončíte registraci.
            </p>
            <button
              type="button"
              onClick={handleResend}
              className="hover:bg-bg-subtle inline-flex h-10 items-center justify-center rounded-md border border-border bg-bg px-5 text-sm font-medium text-text-primary"
            >
              Odeslat e-mail znovu
            </button>
            {resendInfo ? (
              <p className="bg-bg-subtle rounded-md px-3 py-2 text-sm text-text-secondary">
                {resendInfo}
              </p>
            ) : null}
            <p className="text-sm text-text-secondary">
              <Link to="/login" className="underline">
                Zpět na přihlášení
              </Link>
            </p>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-text-secondary">Jméno</span>
                <input
                  type="text"
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
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

              {phase.kind === "error" ? (
                <p
                  role="alert"
                  className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger"
                >
                  {phase.message}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex h-10 w-full items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:opacity-50"
              >
                {submitting ? "Odesílání…" : "Zaregistrovat se"}
              </button>
            </form>

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs uppercase tracking-wide text-text-tertiary">nebo</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <a
              href={`${API_BASE_URL}${GOOGLE_LOGIN_PATH}`}
              className="hover:bg-bg-subtle inline-flex h-10 w-full items-center justify-center rounded-md border border-border bg-bg px-5 text-sm font-medium text-text-primary"
            >
              Zaregistrovat se přes Google
            </a>

            <p className="mt-6 text-center text-sm text-text-secondary">
              Už máte účet?{" "}
              <Link to="/login" className="font-medium text-accent underline">
                Přihlásit se
              </Link>
            </p>
          </>
        )}

        <div className="mt-6 flex justify-center">
          <LanguageSwitcher />
        </div>
      </main>
    </div>
  );
}
