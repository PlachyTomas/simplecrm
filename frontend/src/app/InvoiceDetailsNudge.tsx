import { useQuery } from "@tanstack/react-query";
import { FileWarning, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "@/auth/useAuth";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { apiFetch } from "@/lib/api";
import { csNoun } from "@/lib/i18n/nouns";
import type { components } from "@/types/api.generated";

type OrganizationOut = components["schemas"]["OrganizationOut"];

const SESSION_KEY = "simplecrm-invoice-details-nudge-dismissed-at";
// Days-remaining threshold for surfacing the nudge. Once the trial is
// this close to ending we *need* the address on file so the first invoice
// renders with a valid customer block.
const NUDGE_WINDOW_DAYS = 7;

/**
 * Surfaces a non-blocking warning at the top of the app shell when the
 * trial is ≤7 days from ending AND the org hasn't filled in the
 * customer-side invoice fields yet (IČO + address). Routes to Settings →
 * Organizace so the user can fix it before the first invoice generates.
 *
 * The mirror of TrialBanner: same dismiss-for-session pattern, same
 * placement convention. We deliberately don't render before the trial
 * cliff is close — there's no urgency on day 1, and the InvoiceDetailsCard
 * is also reachable from a normal Settings visit.
 */
export function InvoiceDetailsNudge() {
  const { accessToken } = useAuth();
  const { data: user } = useCurrentUser();
  const orgQuery = useQuery<OrganizationOut>({
    queryKey: ["organizations", "current"],
    enabled: !!accessToken && !!user?.organization,
    queryFn: () =>
      apiFetch<OrganizationOut>("/api/v1/organizations/current", { token: accessToken }),
  });

  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_KEY)) setDismissed(true);
    } catch {
      /* sessionStorage unavailable — banner stays visible */
    }
  }, []);

  if (dismissed || !user?.organization || !orgQuery.data) return null;

  const daysRemaining = Math.max(
    0,
    Math.ceil(
      (new Date(user.organization.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    ),
  );
  if (daysRemaining > NUDGE_WINDOW_DAYS) return null;

  // "Complete" = enough to render a compliant Czech tax invoice. IČO +
  // street address are the two we'll always need; city / zip come along
  // automatically from ARES, so checking street is a tight-enough proxy.
  const org = orgQuery.data;
  const complete = !!(org.ico && org.address_street && org.address_city && org.address_zip);
  if (complete) return null;

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(SESSION_KEY, String(Date.now()));
    } catch {
      /* fine — UI dismissal alone is enough */
    }
    setDismissed(true);
  };

  return (
    <div
      role="status"
      data-testid="invoice-details-nudge"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-warning-subtle bg-warning-subtle px-4 py-2 md:px-8"
    >
      <div className="flex min-w-0 items-center gap-2 text-sm text-warning">
        <FileWarning size={16} strokeWidth={1.75} aria-hidden />
        <span className="truncate">
          Doplňte fakturační údaje — zkušebka končí za {daysRemaining}{" "}
          {csNoun(daysRemaining, "den")} a první faktura by jinak neobsahovala IČO a adresu.
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          to="/app/settings"
          className="inline-flex h-8 items-center justify-center rounded-md bg-warning px-3 text-xs font-semibold text-text-on-accent transition-colors duration-fast hover:opacity-90"
        >
          Doplnit fakturační údaje
        </Link>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Zavřít upozornění"
          className="hover:bg-warning/10 rounded-md p-1 text-warning"
        >
          <X size={14} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
    </div>
  );
}
