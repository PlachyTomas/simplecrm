import { Calendar } from "lucide-react";
import { useTranslation } from "react-i18next";

import { SmtpSettingsCard } from "@/app/settings/SmtpSettingsCard";
import {
  useGoogleCalendarConnect,
  useGoogleCalendarDisconnect,
  useGoogleCalendarStatus,
} from "@/app/settings/useGoogleCalendar";
import { useToast } from "@/lib/toast";

function GoogleCalendarCard() {
  const { t } = useTranslation("settings");
  const toast = useToast();
  const { data: status, isPending } = useGoogleCalendarStatus();
  const connect = useGoogleCalendarConnect();
  const disconnect = useGoogleCalendarDisconnect();

  const connected = status?.connected ?? false;
  const needsReconnect = connected && (status?.sync_broken ?? false);

  return (
    <li className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-md bg-accent-subtle p-2 text-accent">
            <Calendar size={18} strokeWidth={1.75} />
          </span>
          <div>
            <p className="text-sm font-medium text-text-primary">
              {t("integrations.googleCalendar.title")}
            </p>
            <p className="mt-0.5 text-sm text-text-secondary">
              {t("integrations.googleCalendar.subtitle")}
            </p>
            {connected ? (
              <p className="mt-1 text-xs text-text-tertiary">
                {t("integrations.googleCalendar.connectedWith")}{" "}
                <span className="font-medium text-text-secondary">{status?.google_email}</span>
              </p>
            ) : null}
            {needsReconnect ? (
              <p className="mt-1 text-xs text-warning">
                {t("integrations.googleCalendar.needsReconnect")}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {connected && !needsReconnect ? (
            <span className="inline-flex items-center rounded-full bg-success-subtle px-2 py-0.5 text-xs font-medium text-success">
              {t("integrations.activeBadge")}
            </span>
          ) : null}
          {connected ? (
            <>
              {needsReconnect ? (
                <button
                  type="button"
                  onClick={() => connect.mutate()}
                  disabled={connect.isPending}
                  className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-text-on-accent hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t("integrations.googleCalendar.reconnectButton")}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() =>
                  disconnect.mutate(undefined, {
                    onSuccess: () => toast.success(t("integrations.googleCalendar.disconnectSuccessToast")),
                    onError: () => toast.error(t("integrations.googleCalendar.disconnectErrorToast")),
                  })
                }
                disabled={disconnect.isPending}
                className="h-9 rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary hover:border-danger-subtle hover:bg-danger-subtle hover:text-danger disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t("integrations.googleCalendar.disconnectButton")}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() =>
                connect.mutate(undefined, {
                  onError: () => toast.error(t("integrations.googleCalendar.connectErrorToast")),
                })
              }
              disabled={isPending || connect.isPending}
              className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-text-on-accent hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {connect.isPending
                ? t("integrations.googleCalendar.connecting")
                : t("integrations.googleCalendar.connectButton")}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

export function IntegrationsSection() {
  const { t } = useTranslation("settings");
  const integrations = [
    {
      name: t("integrations.items.ares.name"),
      body: t("integrations.items.ares.body"),
      active: true,
    },
    {
      name: t("integrations.items.slack.name"),
      body: t("integrations.items.slack.body"),
      active: false,
    },
    {
      name: t("integrations.items.webhooks.name"),
      body: t("integrations.items.webhooks.body"),
      active: false,
    },
  ];
  return (
    <section className="space-y-3">
      <header>
        <h2 className="text-lg font-semibold">{t("integrations.title")}</h2>
        <p className="mt-1 text-sm text-text-tertiary">{t("integrations.subtitle")}</p>
      </header>
      <ul className="space-y-3">
        <SmtpSettingsCard />
        <GoogleCalendarCard />
        {integrations.map((i) => (
          <li
            key={i.name}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4"
          >
            <div>
              <p className="text-sm font-medium text-text-primary">{i.name}</p>
              <p className="mt-0.5 text-sm text-text-secondary">{i.body}</p>
            </div>
            {i.active ? (
              <span className="inline-flex items-center rounded-full bg-success-subtle px-2 py-0.5 text-xs font-medium text-success">
                {t("integrations.activeBadge")}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-surface-overlay px-2 py-0.5 text-xs font-medium text-text-tertiary">
                {t("integrations.comingSoonBadge")}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
