import { useQuery } from "@tanstack/react-query";
import { Sparkles, UserPlus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { acceptInvite, authErrorCode, authErrorMessage } from "@/auth/api";
import { useAuth } from "@/auth/useAuth";
import { ApiError, API_BASE_URL, apiFetch } from "@/lib/api";
import { ThemeToggle } from "@/lib/ThemeToggle";
import { usePageTitle } from "@/lib/usePageTitle";
import type { components } from "@/types/api.generated";

type InvitationPreview = components["schemas"]["InvitationPreview"];

const ROLE_LABEL: Record<string, string> = {
  admin: "administrátor",
  manager: "manažer",
  salesperson: "obchodník",
};

const CALLBACK_ERROR_MESSAGES: Record<string, string> = {
  invitation_email_mismatch:
    "Pozvánka byla vystavena na jiný e-mail, než kterým jste se přihlásili.",
  invitation_expired: "Tato pozvánka vypršela. Požádejte administrátora o novou.",
  invitation_consumed: "Tato pozvánka už byla použita.",
  invitation_not_found: "Pozvánka nebyla nalezena.",
  user_already_in_organization:
    "Tento e-mail už patří k jiné organizaci. Použijte jiný účet, nebo nejdřív opusťte stávající organizaci.",
  weak_password: "Heslo nesplňuje požadavky (alespoň 12 znaků, písmeno + číslice).",
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
  const { token = "" } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const callbackError = searchParams.get("error");
  usePageTitle("Pozvánka do organizace");
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
      apiFetch<InvitationPreview>(
        `/api/v1/onboarding/invite/${encodeURIComponent(token)}`,
      ),
  });

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
        if (code && CALLBACK_ERROR_MESSAGES[code]) {
          setFormError(CALLBACK_ERROR_MESSAGES[code]);
        } else if (code === "weak_password") {
          setFormError(
            authErrorMessage(err.body) ??
              CALLBACK_ERROR_MESSAGES.weak_password ??
              "Heslo je příliš slabé.",
          );
        } else {
          setFormError("Přijetí pozvánky se nezdařilo. Zkuste to prosím znovu.");
        }
      } else {
        setFormError("Přijetí pozvánky se nezdařilo.");
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
          <p className="text-sm text-text-tertiary">Načítání pozvánky…</p>
        ) : preview.isError ? (
          <InviteError err={preview.error} />
        ) : (
          <>
            <h1 id="invite-title" className="text-2xl font-semibold">
              Pozvánka do {preview.data.organization_name}
            </h1>
            <p className="mt-3 text-sm text-text-secondary">
              Byli jste pozváni jako{" "}
              <strong className="text-text-primary">
                {ROLE_LABEL[preview.data.role] ?? preview.data.role}
              </strong>
              {preview.data.team_name ? (
                <>
                  {" "}
                  do týmu{" "}
                  <strong className="text-text-primary">
                    {preview.data.team_name}
                  </strong>
                </>
              ) : null}
              .
            </p>
            <p className="mt-1 text-xs text-text-tertiary">
              Pozvánka byla zaslána na <strong>{preview.data.email}</strong>.
            </p>

            {callbackError ? (
              <p
                role="alert"
                className="mt-4 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger"
              >
                {CALLBACK_ERROR_MESSAGES[callbackError] ??
                  "Přijetí pozvánky se nezdařilo."}
              </p>
            ) : null}

            <form
              onSubmit={handleEmailAccept}
              className="mt-6 space-y-4 text-left"
              noValidate
            >
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-text-secondary">
                  Vaše jméno
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
                  Heslo
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
                  Alespoň 12 znaků, jedno písmeno a jedna číslice.
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
                {submitting ? "Odesílání…" : "Přijmout pozvánku"}
              </button>
            </form>

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs uppercase tracking-wide text-text-tertiary">
                nebo
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <a
              href={`${API_BASE_URL}/api/v1/auth/google/login?invite=${encodeURIComponent(token)}`}
              className="inline-flex h-10 w-full items-center justify-center rounded-md border border-border bg-bg px-5 text-sm font-medium text-text-primary transition-colors duration-fast hover:bg-bg-subtle"
            >
              Přijmout přes Google
            </a>
          </>
        )}
      </main>
    </div>
  );
}

function InviteError({ err }: { err: ApiError }) {
  let message: string;
  if (err.status === 410) {
    message = CALLBACK_ERROR_MESSAGES.invitation_expired ?? "Pozvánka vypršela.";
  } else if (err.status === 409) {
    message = CALLBACK_ERROR_MESSAGES.invitation_consumed ?? "Pozvánka byla už použita.";
  } else if (err.status === 404) {
    message = "Pozvánka neexistuje nebo je neplatná.";
  } else {
    message = "Pozvánku se nepodařilo načíst.";
  }
  return (
    <>
      <h1 className="text-2xl font-semibold">Pozvánka není platná</h1>
      <p className="mt-3 text-sm text-text-secondary">{message}</p>
      <p className="mt-1 text-xs text-text-tertiary">
        Pokud si myslíte, že jde o chybu, požádejte administrátora o nový
        odkaz.
      </p>
    </>
  );
}
