import { Mail } from "lucide-react";
import { useState } from "react";

import { resendVerification } from "@/auth/api";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { ApiError } from "@/lib/api";

/**
 * Non-blocking nudge for users who signed up with email+password and
 * haven't clicked the verification link yet. Renders nothing for verified
 * users, for users without a session, or while `/auth/me` is still
 * loading.
 *
 * Mounted at the top of both `AppShell` and `CreateOrgPage` so a brand-
 * new user (no organization yet) also sees the prompt — the wizard is the
 * first place they land after signup.
 */
export function UnverifiedEmailBanner() {
  const { data: user } = useCurrentUser();
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user || user.email_verified) return null;

  async function handleResend() {
    if (!user) return;
    setInfo(null);
    setBusy(true);
    try {
      await resendVerification(user.email);
      setInfo("Nový ověřovací e-mail jsme vám právě odeslali.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        const retryAfter =
          (err.body as { detail?: { retry_after_seconds?: number } } | undefined)?.detail
            ?.retry_after_seconds ?? 60;
        setInfo(`Počkejte prosím ${retryAfter} s před dalším pokusem.`);
      } else {
        setInfo("Odeslání se nezdařilo. Zkuste to prosím za chvíli.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="status"
      data-testid="unverified-email-banner"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-warning-subtle bg-warning-subtle px-4 py-2 md:px-8"
    >
      <div className="flex min-w-0 items-center gap-2 text-sm text-warning">
        <Mail size={16} strokeWidth={1.75} aria-hidden />
        <span className="truncate">
          E-mail <strong className="font-semibold">{user.email}</strong> ještě není ověřený.
          Zkontrolujte schránku a klikněte na ověřovací odkaz.
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {info ? <span className="text-xs text-text-secondary">{info}</span> : null}
        <button
          type="button"
          onClick={() => void handleResend()}
          disabled={busy}
          className="border-warning/40 inline-flex h-8 items-center justify-center rounded-md border bg-bg px-3 text-xs font-semibold text-warning transition-colors duration-fast hover:bg-warning-subtle disabled:opacity-50"
        >
          {busy ? "Odesílám…" : "Odeslat znovu"}
        </button>
      </div>
    </div>
  );
}
