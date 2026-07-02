import { Calendar } from "lucide-react";

import { SmtpSettingsCard } from "@/app/settings/SmtpSettingsCard";
import {
  useGoogleCalendarConnect,
  useGoogleCalendarDisconnect,
  useGoogleCalendarStatus,
} from "@/app/settings/useGoogleCalendar";
import { useToast } from "@/lib/toast";

function GoogleCalendarCard() {
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
            <p className="text-sm font-medium text-text-primary">Google Kalendář</p>
            <p className="mt-0.5 text-sm text-text-secondary">
              Události u obchodů se na přání zapíší i do vašeho Google kalendáře.
            </p>
            {connected ? (
              <p className="mt-1 text-xs text-text-tertiary">
                Propojeno s účtem{" "}
                <span className="font-medium text-text-secondary">{status?.google_email}</span>
              </p>
            ) : null}
            {needsReconnect ? (
              <p className="mt-1 text-xs text-warning">
                Google přístup odvolal — propojte kalendář prosím znovu.
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {connected && !needsReconnect ? (
            <span className="inline-flex items-center rounded-full bg-success-subtle px-2 py-0.5 text-xs font-medium text-success">
              Aktivní
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
                  Propojit znovu
                </button>
              ) : null}
              <button
                type="button"
                onClick={() =>
                  disconnect.mutate(undefined, {
                    onSuccess: () => toast.success("Google Kalendář byl odpojen"),
                    onError: () => toast.error("Odpojení se nezdařilo, zkuste to prosím znovu"),
                  })
                }
                disabled={disconnect.isPending}
                className="h-9 rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary hover:border-danger-subtle hover:bg-danger-subtle hover:text-danger disabled:cursor-not-allowed disabled:opacity-60"
              >
                Odpojit
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() =>
                connect.mutate(undefined, {
                  onError: () => toast.error("Propojení se nepodařilo zahájit, zkuste to znovu"),
                })
              }
              disabled={isPending || connect.isPending}
              className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-text-on-accent hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {connect.isPending ? "Přesměrování…" : "Propojit"}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

export function IntegrationsSection() {
  const integrations = [
    {
      name: "ARES",
      body: "Automatické doplňování firemních údajů z veřejného registru.",
      active: true,
    },
    {
      name: "Slack",
      body: "Notifikace o vyhraných obchodech do týmového kanálu.",
      active: false,
    },
    {
      name: "Webhooky",
      body: "Posílejte události (deal won / company freed) na vlastní URL.",
      active: false,
    },
  ];
  return (
    <section className="space-y-3">
      <header>
        <h2 className="text-lg font-semibold">Integrace</h2>
        <p className="mt-1 text-sm text-text-tertiary">
          Propojte SimpleCRM s nástroji, které již používáte.
        </p>
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
                Aktivní
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-surface-overlay px-2 py-0.5 text-xs font-medium text-text-tertiary">
                Brzy
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
