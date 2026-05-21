import { useQuery } from "@tanstack/react-query";
import { FileWarning } from "lucide-react";
import { Link } from "react-router-dom";

import { useAuth } from "@/auth/useAuth";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

type OrganizationOut = components["schemas"]["OrganizationOut"];

/**
 * Persistent red banner for org admins when the organization's
 * Fakturační údaje (IČO + address) aren't filled in. Without them
 * the first invoice would render with a blank customer block and
 * wouldn't be a valid daňový doklad.
 *
 * Modeled on `UnverifiedEmailBanner`: not dismissible, no time
 * window — the banner stays up until the admin fixes the data.
 * Only admins see it; managers/salespeople can't edit
 * organization settings, so nagging them is noise.
 */
export function InvoiceDetailsNudge() {
  const { accessToken } = useAuth();
  const { data: user } = useCurrentUser();
  const orgQuery = useQuery<OrganizationOut>({
    queryKey: ["organizations", "current"],
    enabled: !!accessToken && !!user?.organization && user?.role === "admin",
    queryFn: () =>
      apiFetch<OrganizationOut>("/api/v1/organizations/current", { token: accessToken }),
  });

  if (!user || user.role !== "admin" || !user.organization || !orgQuery.data) return null;

  // "Complete" = enough to render a compliant Czech tax invoice. IČO +
  // street address are the two we'll always need; city / zip come along
  // automatically from ARES, so checking street is a tight-enough proxy.
  const org = orgQuery.data;
  const complete = !!(org.ico && org.address_street && org.address_city && org.address_zip);
  if (complete) return null;

  return (
    <div
      role="alert"
      data-testid="invoice-details-nudge"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-danger/30 bg-danger-subtle px-4 py-2 md:px-8"
    >
      <div className="flex min-w-0 items-center gap-2 text-sm text-danger">
        <FileWarning size={16} strokeWidth={1.75} aria-hidden />
        <span className="truncate">
          Doplňte fakturační údaje (IČO a adresu). Bez nich nemůžeme vystavit platnou fakturu.
        </span>
      </div>
      <Link
        to="/app/settings"
        className="inline-flex h-8 shrink-0 items-center justify-center rounded-md bg-danger px-3 text-xs font-semibold text-white transition-colors duration-fast hover:bg-danger/90"
      >
        Doplnit fakturační údaje
      </Link>
    </div>
  );
}
