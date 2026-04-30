import { useQuery } from "@tanstack/react-query";
import { Sparkles, UserPlus } from "lucide-react";
import { useSearchParams, useParams } from "react-router-dom";

import { API_BASE_URL, apiFetch, type ApiError } from "@/lib/api";
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
};

/**
 * Public, unauthenticated landing page for an invitation link. Loads the
 * preview (org name + role), then asks the invitee to sign in with Google
 * — the same OAuth flow the rest of the app uses, with the invite token
 * tunneled through the OAuth `state` so the callback can consume it.
 */
export function AcceptInvitePage() {
  const { token = "" } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const callbackError = searchParams.get("error");
  usePageTitle("Pozvánka do organizace");

  const preview = useQuery<InvitationPreview, ApiError>({
    queryKey: ["onboarding", "invite-preview", token],
    enabled: !!token,
    retry: false,
    queryFn: () =>
      apiFetch<InvitationPreview>(
        `/api/v1/onboarding/invite/${encodeURIComponent(token)}`,
      ),
  });

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
              Přihlaste se prosím stejnou Google adresou.
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

            <a
              href={`${API_BASE_URL}/api/v1/auth/google/login?invite=${encodeURIComponent(token)}`}
              className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
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
