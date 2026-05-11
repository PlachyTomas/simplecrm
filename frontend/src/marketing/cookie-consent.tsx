import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";
import { COOKIE_CONSENT_REOPEN_EVENT } from "@/marketing/cookie-consent-controls";

/**
 * Cookie consent banner — § 89 odst. 3 zák. č. 127/2005 Sb. opt-in, with
 * ÚOOÚ-compliant equivalence between "Přijmout vše" and "Odmítnout vše".
 *
 * Current site loads no third-party trackers, so the consent value is
 * stored purely for compliance and to drive future analytics opt-in. The
 * footer "Nastavení cookies" button calls `openCookieSettings()` to reopen
 * the dialog after a decision was made.
 */

const STORAGE_KEY = "simplecrm.cookie-consent.v1";

type Decision = "all" | "essential";

interface StoredConsent {
  decision: Decision;
  analytics: boolean;
  preferences: boolean;
  marketing: boolean;
  decidedAt: string;
}

function loadConsent(): StoredConsent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredConsent;
    if (parsed.decision !== "all" && parsed.decision !== "essential") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveConsent(value: StoredConsent): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage may be unavailable (private mode); fall through silently.
  }
}

export function CookieConsent() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"banner" | "settings">("banner");
  const [analytics, setAnalytics] = useState(false);
  const [preferences, setPreferences] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const existing = loadConsent();
    if (!existing) {
      setOpen(true);
    } else {
      setAnalytics(existing.analytics);
      setPreferences(existing.preferences);
      setMarketing(existing.marketing);
    }
    const reopen = () => {
      const stored = loadConsent();
      if (stored) {
        setAnalytics(stored.analytics);
        setPreferences(stored.preferences);
        setMarketing(stored.marketing);
      }
      setView("settings");
      setOpen(true);
    };
    window.addEventListener(COOKIE_CONSENT_REOPEN_EVENT, reopen);
    return () => window.removeEventListener(COOKIE_CONSENT_REOPEN_EVENT, reopen);
  }, []);

  const persist = useCallback(
    (
      decision: Decision,
      flags: { analytics: boolean; preferences: boolean; marketing: boolean },
    ) => {
      saveConsent({
        decision,
        analytics: flags.analytics,
        preferences: flags.preferences,
        marketing: flags.marketing,
        decidedAt: new Date().toISOString(),
      });
      setOpen(false);
    },
    [],
  );

  const acceptAll = () => persist("all", { analytics: true, preferences: true, marketing: true });
  const rejectAll = () =>
    persist("essential", { analytics: false, preferences: false, marketing: false });
  const saveCustom = () =>
    persist(analytics || preferences || marketing ? "all" : "essential", {
      analytics,
      preferences,
      marketing,
    });

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-consent-title"
      className="fixed inset-x-0 bottom-0 z-50 px-3 pb-3 sm:px-6 sm:pb-6"
    >
      <div className="mx-auto max-w-[1100px] rounded-lg border border-border bg-surface p-4 shadow-lg sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id="cookie-consent-title" className="text-base font-semibold text-text-primary">
            {view === "banner" ? "Cookies na simplecrm.cz" : "Nastavení cookies"}
          </h2>
          <button
            type="button"
            aria-label="Zavřít"
            onClick={() => setOpen(false)}
            className="text-text-tertiary hover:text-text-primary"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        {view === "banner" ? (
          <BannerView
            onAcceptAll={acceptAll}
            onRejectAll={rejectAll}
            onOpenSettings={() => setView("settings")}
          />
        ) : (
          <SettingsView
            analytics={analytics}
            preferences={preferences}
            marketing={marketing}
            setAnalytics={setAnalytics}
            setPreferences={setPreferences}
            setMarketing={setMarketing}
            onAcceptAll={acceptAll}
            onRejectAll={rejectAll}
            onSave={saveCustom}
          />
        )}
      </div>
    </div>
  );
}

interface BannerViewProps {
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onOpenSettings: () => void;
}

function BannerView({ onAcceptAll, onRejectAll, onOpenSettings }: BannerViewProps) {
  return (
    <>
      <p className="mt-2 text-sm text-text-secondary">
        Tento web používá cookies. Nezbytné cookies používáme pro správné fungování webu. S vaším
        souhlasem budeme používat i analytické a preferenční cookies pro zlepšování naší služby.
        Podrobné nastavení můžete kdykoli změnit. Více informací v{" "}
        <Link to="/cookies" className="underline">
          Zásadách používání cookies
        </Link>
        .
      </p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <ConsentButton onClick={onAcceptAll} variant="primary">
          Přijmout vše
        </ConsentButton>
        <ConsentButton onClick={onRejectAll} variant="primary">
          Odmítnout vše
        </ConsentButton>
        <ConsentButton onClick={onOpenSettings} variant="ghost">
          Nastavení
        </ConsentButton>
      </div>
    </>
  );
}

interface SettingsViewProps {
  analytics: boolean;
  preferences: boolean;
  marketing: boolean;
  setAnalytics: (v: boolean) => void;
  setPreferences: (v: boolean) => void;
  setMarketing: (v: boolean) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onSave: () => void;
}

function SettingsView(props: SettingsViewProps) {
  return (
    <>
      <p className="mt-2 text-sm text-text-secondary">
        Vyberte si, které kategorie cookies chcete povolit. Tlačítka „Přijmout vše" a „Odmítnout
        vše" jsou rovnocenná.
      </p>
      <div className="mt-4 space-y-3">
        <Category
          title="Nezbytné"
          description="Bez těchto cookies web nefunguje (přihlášení, záznam vaší volby cookies). Zákonný základ — § 89 odst. 3 zák. č. 127/2005 Sb."
          checked={true}
          disabled={true}
        />
        <Category
          title="Analytické"
          description="Měření návštěvnosti pro zlepšování služby. Bez vašeho souhlasu žádný analytický nástroj nespouštíme."
          checked={props.analytics}
          onChange={props.setAnalytics}
        />
        <Category
          title="Preferenční"
          description="Zapamatování si vašich preferencí (např. zvolené téma)."
          checked={props.preferences}
          onChange={props.setPreferences}
        />
        <Category
          title="Marketingové"
          description="V současné době nepoužíváme."
          checked={props.marketing}
          onChange={props.setMarketing}
        />
      </div>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <ConsentButton onClick={props.onAcceptAll} variant="primary">
          Přijmout vše
        </ConsentButton>
        <ConsentButton onClick={props.onRejectAll} variant="primary">
          Odmítnout vše
        </ConsentButton>
        <ConsentButton onClick={props.onSave} variant="ghost">
          Uložit volbu
        </ConsentButton>
      </div>
    </>
  );
}

interface CategoryProps {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (v: boolean) => void;
}

function Category({ title, description, checked, disabled, onChange }: CategoryProps) {
  return (
    <label
      className={cn(
        "flex items-start gap-3 rounded-md border border-border-subtle bg-surface-overlay p-3",
        disabled ? "opacity-80" : "cursor-pointer",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        className="mt-1 h-4 w-4 rounded border-border accent-accent"
      />
      <span>
        <span className="block text-sm font-medium text-text-primary">{title}</span>
        <span className="mt-0.5 block text-xs text-text-tertiary">{description}</span>
      </span>
    </label>
  );
}

interface ConsentButtonProps {
  onClick: () => void;
  variant: "primary" | "ghost";
  children: React.ReactNode;
}

function ConsentButton({ onClick, variant, children }: ConsentButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        // ÚOOÚ: Accept All / Reject All MUST be visually equivalent — same
        // size, padding, and contrast. Only "Nastavení" is rendered ghost.
        "inline-flex h-10 items-center justify-center rounded-md px-5 text-sm font-medium transition-colors duration-fast",
        variant === "primary"
          ? "bg-accent text-text-on-accent hover:bg-accent-hover"
          : "hover:bg-bg-subtle border border-border bg-bg text-text-primary",
      )}
    >
      {children}
    </button>
  );
}
