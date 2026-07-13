import { Sparkles } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { requestPasswordReset } from "@/auth/api";
import { ApiError } from "@/lib/api";
import { ThemeToggle } from "@/lib/ThemeToggle";
import { usePageTitle } from "@/lib/usePageTitle";

export function ForgotPasswordPage() {
  const { t } = useTranslation("auth");
  usePageTitle(t("forgotPassword.pageTitle"));
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);
    try {
      await requestPasswordReset(email);
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        const retryAfter =
          (err.body as { detail?: { retry_after_seconds?: number } } | undefined)?.detail
            ?.retry_after_seconds ?? 60;
        setErrorMessage(t("shared.rateLimited", { seconds: retryAfter }));
      } else {
        setErrorMessage(t("forgotPassword.errors.generic"));
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
        aria-labelledby="forgot-title"
        className="w-full max-w-md rounded-lg border border-border bg-surface p-6 text-center shadow-md"
      >
        <div
          aria-hidden
          className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-md bg-highlight text-text-on-accent"
        >
          <Sparkles size={24} strokeWidth={1.75} />
        </div>
        <h1 id="forgot-title" className="text-2xl font-semibold">
          {t("forgotPassword.heading")}
        </h1>

        {done ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-text-secondary">
              {t("forgotPassword.doneMessagePrefix")}{" "}
              <strong className="text-text-primary">{email}</strong>{" "}
              {t("forgotPassword.doneMessageSuffix")}
            </p>
            <Link to="/login" className="text-sm text-accent underline">
              {t("shared.backToLogin")}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4 text-left" noValidate>
            <p className="text-sm text-text-secondary">{t("forgotPassword.intro")}</p>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-text-secondary">
                {t("shared.emailLabel")}
              </span>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
              {submitting ? t("shared.submitting") : t("forgotPassword.submit")}
            </button>
            <p className="text-center text-sm text-text-secondary">
              <Link to="/login" className="underline">
                {t("shared.backToLogin")}
              </Link>
            </p>
          </form>
        )}
      </main>
    </div>
  );
}
