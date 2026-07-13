import { useQuery } from "@tanstack/react-query";
import { Sparkles, UserPlus } from "lucide-react";
import { type FormEvent, useState } from "react";
import type { ParseKeys } from "i18next";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { acceptInvite, authErrorCode, authErrorMessage } from "@/auth/api";
import { useAuth } from "@/auth/useAuth";
import { ApiError, API_BASE_URL, apiFetch } from "@/lib/api";
import { ThemeToggle } from "@/lib/ThemeToggle";
import { usePageTitle } from "@/lib/usePageTitle";
import type { components } from "@/types/api.generated";

type InvitationPreview = components["schemas"]["InvitationPreview"];

const ROLE_LABEL_KEY: Record<string, ParseKeys<"onboarding">> = {
  admin: "invite.roles.admin",
  manager: "invite.roles.manager",
  salesperson: "invite.roles.salesperson",
};

const CALLBACK_ERROR_KEY: Record<string, ParseKeys<"onboarding">> = {
  invitation_email_mismatch: "invite.errors.invitation_email_mismatch",
  invitation_expired: "invite.errors.invitation_expired",
  invitation_consumed: "invite.errors.invitation_consumed",
  invitation_not_found: "invite.errors.invitation_not_found",
  user_already_in_organization: "invite.errors.user_already_in_organization",
  weak_password: "invite.errors.weak_password",
};

/**
 * Public, unauthenticated landing page for an invitation link. Loads the
 * preview (org name + role), then offers two ways to accept:
 *   1. Google OAuth — invite token tunneled through OAuth `state`,
 *      consumed by `/auth/google/callback`.
 *   2. Email + password — name + password form, posted to
 *      `/auth/invite/accept`. The invite click itself proves email
 *      ownership so we skip the verify-email step and auto-login.
 */
export function AcceptInvitePage() {
  const { t } = useTranslation("onboarding");
  const { token = "" } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const callbackError = searchParams.get("error");
  usePageTitle(t("invite.pageTitle"));
  const navigate = useNavigate();
  const { setAccessToken } = useAuth();

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const preview = useQuery<InvitationPreview, ApiError>({
    queryKey: ["onboarding", "invite-preview", token],
    enabled: !!token,
    retry: false,
    queryFn: () =>
      apiFetch<InvitationPreview>(`/api/v1/onboarding/invite/${encodeURIComponent(token)}`),
  });

  function callbackErrorMessage(code: string | null): string {
    const key = code ? CALLBACK_ERROR_KEY[code] : undefined;
    return key ? t(key) : t("invite.errors.generic");
  }

  async function handleEmailAccept(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await acceptInvite({ token, password, name });
      setAccessToken(res.access_token);
      navigate("/app");
    } catch (err) {
      if (err instanceof ApiError) {
        const code = authErrorCode(err.body);
        const key = code ? CALLBACK_ERROR_KEY[code] : undefined;
        if (code === "weak_password") {
          // Prefer the backend's message — it names the exact requirement
          // (length, character classes) the password failed.
          setFormError(authErrorMessage(err.body) ?? t("invite.errors.weak_password"));
        } else if (key) {
          setFormError(t(key));
        } else {
          setFormError(t("invite.errors.generic"));
        }
      } else {
        setFormError(t("invite.errors.genericNoResponse"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const roleKey = preview.data ? ROLE_LABEL_KEY[preview.data.role] : undefined;
  const roleLabel = preview.data ? (roleKey ? t(roleKey) : preview.data.role) : "";

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle variant="compact" />
      </div>
      <main
        aria-labelledby="invite-title"
        className="w-full max-w-md rounded-lg border border-border bg-surface p-6 text-center shadow-md"
      >
        <div
          aria-hidden
          className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-md bg-highlight text-text-on-accent"
        >
          {callbackError ? (
            <Sparkles size={24} strokeWidth={1.75} />
          ) : (
            <UserPlus size={24} strokeWidth={1.75} />
          )}
        </div>

        {preview.isPending ? (
          <p className="text-sm text-text-tertiary">{t("invite.loading")}</p>
        ) : preview.isError ? (
          <InviteError err={preview.error} />
        ) : (
          <>
            <h1 id="invite-title" className="text-2xl font-semibold">
              {t("invite.heading", { orgName: preview.data.organization_name })}
            </h1>
            <p className="mt-3 text-sm text-text-secondary">
              {t("invite.invitedAsPrefix")}{" "}
              <strong className="text-text-primary">{roleLabel}</strong>
              {preview.data.team_name ? (
                <>
                  {" "}
                  {t("invite.toTeamPrefix")}{" "}
                  <strong className="text-text-primary">{preview.data.team_name}</strong>
                </>
              ) : null}
              .
            </p>
            <p className="mt-1 text-xs text-text-tertiary">
              {t("invite.sentToPrefix")} <strong>{preview.data.email}</strong>.
            </p>

            {callbackError ? (
              <p
                role="alert"
                className="mt-4 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger"
              >
                {callbackErrorMessage(callbackError)}
              </p>
            ) : null}

            <form onSubmit={handleEmailAccept} className="mt-6 space-y-4 text-left" noValidate>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-text-secondary">
                  {t("invite.nameLabel")}
                </span>
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
                <span className="mb-1 block text-sm font-medium text-text-secondary">
                  {t("invite.passwordLabel")}
                </span>
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
                  {t("invite.passwordHint")}
                </span>
              </label>
              {formError ? (
                <p
                  role="alert"
                  className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger"
                >
                  {formError}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex h-10 w-full items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:opacity-50"
              >
                {submitting ? t("invite.submitting") : t("invite.submit")}
              </button>
            </form>

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs uppercase tracking-wide text-text-tertiary">
                {t("invite.or")}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <a
              href={`${API_BASE_URL}/api/v1/auth/google/login?invite=${encodeURIComponent(token)}`}
              className="hover:bg-bg-subtle inline-flex h-10 w-full items-center justify-center rounded-md border border-border bg-bg px-5 text-sm font-medium text-text-primary transition-colors duration-fast"
            >
              {t("invite.googleCta")}
            </a>
          </>
        )}
      </main>
    </div>
  );
}

function InviteError({ err }: { err: ApiError }) {
  const { t } = useTranslation("onboarding");
  let message: string;
  if (err.status === 410) {
    message = t("invite.errors.invitation_expired");
  } else if (err.status === 409) {
    message = t("invite.errors.invitation_consumed");
  } else if (err.status === 404) {
    message = t("invite.notFoundMessage");
  } else {
    message = t("invite.loadFailedMessage");
  }
  return (
    <>
      <h1 className="text-2xl font-semibold">{t("invite.invalidHeading")}</h1>
      <p className="mt-3 text-sm text-text-secondary">{message}</p>
      <p className="mt-1 text-xs text-text-tertiary">{t("invite.invalidHint")}</p>
    </>
  );
}
