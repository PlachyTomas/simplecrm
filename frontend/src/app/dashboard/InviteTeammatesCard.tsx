/**
 * Dashboard widget: lightweight invite flow visible while the org has
 * fewer active members than `seat_count`. Reuses the per-email invitation
 * API; the "invite link" the user sees is `InvitationCreated.invite_url`
 * with a copy-to-clipboard control. Once members + open invites match
 * seat_count the card hides itself.
 *
 * Hidden for non-admins / users without `can_invite` since they can't
 * use any of these actions anyway.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Trash2, UserPlus, Users } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useOrgTeams, useOrgUsers } from "@/app/settings/useUsersTeams";
import { useAuth } from "@/auth/useAuth";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { useCurrentSubscription } from "@/components/billing/useCurrentSubscription";
import { ApiError, apiFetch } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { components } from "@/types/api.generated";

type InvitationOut = components["schemas"]["InvitationOut"];
type InvitationCreated = components["schemas"]["InvitationCreated"];
type InvitationCreate = components["schemas"]["InvitationCreate"];
type Page = components["schemas"]["Page_InvitationOut_"];

const INVITES_KEY = ["org", "invitations"] as const;

function useInvitations(enabled: boolean) {
  const { accessToken } = useAuth();
  return useQuery<Page>({
    queryKey: INVITES_KEY,
    enabled: enabled && !!accessToken,
    staleTime: 15_000,
    queryFn: () => apiFetch<Page>("/api/v1/invitations?limit=100", { token: accessToken }),
  });
}

function useCreateInvitation() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<InvitationCreated, Error, InvitationCreate>({
    mutationFn: (body) =>
      apiFetch<InvitationCreated>("/api/v1/invitations", {
        method: "POST",
        token: accessToken,
        body: body as unknown as Record<string, unknown>,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: INVITES_KEY });
    },
  });
}

function useRevokeInvitation() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) =>
      apiFetch<void>(`/api/v1/invitations/${id}`, { method: "DELETE", token: accessToken }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: INVITES_KEY });
    },
  });
}

export function InviteTeammatesCard() {
  const { t } = useTranslation("dashboard");
  const { data: user } = useCurrentUser();
  const subscription = useCurrentSubscription();
  const users = useOrgUsers();
  const teams = useOrgTeams();

  const canManage = !!(user && (user.role === "admin" || user.can_invite));
  const invites = useInvitations(canManage);
  const create = useCreateInvitation();
  const revoke = useRevokeInvitation();
  const toast = useToast();

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!canManage) return null;

  const seatCount = subscription.data?.seat_count;
  const userItems = users.data?.items;
  const activeMembers = userItems ? userItems.filter((u) => u.is_active).length : undefined;
  const pendingInvites = invites.data?.items ?? [];

  // Hide until we know the seat count, then hide once the org is full.
  if (subscription.isPending || users.isPending || invites.isPending) return null;
  if (seatCount == null || activeMembers == null) return null;
  if (activeMembers + pendingInvites.length >= seatCount && pendingInvites.length === 0)
    return null;
  if (activeMembers >= seatCount) return null;

  const remainingSeats = Math.max(0, seatCount - activeMembers - pendingInvites.length);
  const defaultTeamId = teams.data?.items.find((t) => t.is_default)?.id ?? null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError(t("inviteTeammatesCard.invalidEmail"));
      return;
    }
    if (remainingSeats <= 0) {
      setError(t("inviteTeammatesCard.noSeatsAvailable"));
      return;
    }
    try {
      await create.mutateAsync({
        email: trimmed,
        role: "salesperson",
        team_id: defaultTeamId,
        can_invite: false,
      });
      setEmail("");
      toast.success(t("inviteTeammatesCard.invitationReady", { email: trimmed }));
    } catch (err) {
      if (err instanceof ApiError) {
        const detail = (err.body as { detail?: unknown })?.detail;
        if (typeof detail === "string") setError(detail);
        else if (detail && typeof detail === "object" && "detail" in detail)
          setError(String((detail as { detail: unknown }).detail));
        else setError(t("inviteTeammatesCard.createFailed"));
      } else {
        setError(err instanceof Error ? err.message : t("inviteTeammatesCard.createFailed"));
      }
    }
  }

  async function onRevoke(inv: InvitationOut) {
    if (!window.confirm(t("inviteTeammatesCard.revokeConfirm", { email: inv.email }))) return;
    try {
      await revoke.mutateAsync(inv.id);
      toast.success(t("inviteTeammatesCard.revokeSuccess"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("inviteTeammatesCard.revokeFailed"));
    }
  }

  return (
    <section
      aria-labelledby="invite-teammates-title"
      className="rounded-lg border border-border bg-surface p-6"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            aria-hidden
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent-subtle text-accent"
          >
            <Users size={20} strokeWidth={1.75} />
          </div>
          <div>
            <h2 id="invite-teammates-title" className="text-lg font-semibold">
              {t("inviteTeammatesCard.title")}
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              {t("inviteTeammatesCard.orgSeatCount", { count: seatCount })}{" "}
              {t("inviteTeammatesCard.inviteesSentPhrase", {
                sent: activeMembers + pendingInvites.length,
                total: seatCount,
                remaining: remainingSeats,
              })}
            </p>
          </div>
        </div>
        <span className="rounded-full bg-surface-overlay px-3 py-1 text-xs font-semibold tabular-nums text-text-secondary">
          {t("inviteTeammatesCard.activeOfSeats", { active: activeMembers, seats: seatCount })}
        </span>
      </header>

      <form
        onSubmit={onSubmit}
        className="mt-5 flex flex-col gap-2 sm:flex-row"
        aria-label={t("inviteTeammatesCard.formAriaLabel")}
      >
        <label className="flex-1">
          <span className="sr-only">{t("inviteTeammatesCard.emailSrLabel")}</span>
          <input
            type="email"
            required
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("inviteTeammatesCard.emailPlaceholder")}
            className="block h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={create.isPending || remainingSeats <= 0}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-accent px-4 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <UserPlus size={16} strokeWidth={1.75} aria-hidden />
          {create.isPending
            ? t("inviteTeammatesCard.submitting")
            : t("inviteTeammatesCard.submit")}
        </button>
      </form>
      {error ? (
        <p className="mt-2 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {pendingInvites.length > 0 ? (
        <div className="mt-5">
          <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            {t("inviteTeammatesCard.pendingInvitesTitle")}
          </p>
          <ul className="mt-2 space-y-2">
            {pendingInvites.map((inv) => (
              <PendingInviteRow key={inv.id} invitation={inv} onRevoke={() => void onRevoke(inv)} />
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-5 text-xs text-text-tertiary">
        {t("inviteTeammatesCard.settingsPromptPrefix")}{" "}
        <Link to="/app/settings" className="underline hover:text-text-secondary">
          {t("inviteTeammatesCard.settingsPromptLink")}
        </Link>
        .
      </p>
    </section>
  );
}

function PendingInviteRow({
  invitation,
  onRevoke,
}: {
  invitation: InvitationOut;
  onRevoke: () => void;
}) {
  // `invite_url` comes straight off the listing response — backend
  // re-signs the invite's token_jti on each GET, so the link is stable
  // and copy-able even after a page reload.
  const { t } = useTranslation("dashboard");
  const link = invitation.invite_url;
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      window.prompt(t("inviteTeammatesCard.copyPrompt"), link);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border-subtle bg-surface-overlay px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{invitation.email}</span>
      <code className="hidden truncate font-mono text-xs text-text-tertiary md:block md:max-w-xs">
        {link}
      </code>
      <button
        type="button"
        onClick={() => void copy()}
        className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-text-secondary transition-colors duration-fast hover:text-text-primary"
        aria-label={t("inviteTeammatesCard.copyLinkAria", { email: invitation.email })}
      >
        {copied ? (
          <>
            <Check size={12} strokeWidth={2} className="text-success" />{" "}
            {t("inviteTeammatesCard.copied")}
          </>
        ) : (
          <>
            <Copy size={12} strokeWidth={1.75} /> {t("inviteTeammatesCard.copyLink")}
          </>
        )}
      </button>
      <button
        type="button"
        onClick={onRevoke}
        aria-label={t("inviteTeammatesCard.revokeAria", { email: invitation.email })}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary transition-colors duration-fast hover:bg-danger-subtle hover:text-danger"
      >
        <Trash2 size={14} strokeWidth={1.75} />
      </button>
    </li>
  );
}
