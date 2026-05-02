import { Navigate } from "react-router-dom";

import { useAuth } from "@/auth/useAuth";
import { TrialExpiredGate } from "@/auth/TrialExpiredGate";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { API_BASE_URL, type TrialExpiredPayload, isTrialExpired } from "@/lib/api";

function extractTrialPayload(err: unknown): TrialExpiredPayload | undefined {
  if (!isTrialExpired(err)) return undefined;
  // FastAPI wraps HTTPException(detail=<dict>) as `{"detail": <dict>}`; peel that.
  const body = err.body as { detail: TrialExpiredPayload | unknown };
  const inner = body?.detail;
  if (inner && typeof inner === "object") {
    return inner as TrialExpiredPayload;
  }
  return body as unknown as TrialExpiredPayload;
}

interface ProtectedRouteProps {
  children: React.ReactNode;
  /**
   * When true (default), users without an `organization` are redirected
   * to /onboarding/create-org. Set to false on the create-org page itself
   * so we don't loop redirect.
   */
  requireOrg?: boolean;
}

/**
 * Trial-gate "Exportovat data" handler. Hits `/api/v1/reports/export-csv`
 * directly (the endpoint deliberately bypasses the trial gate so users
 * can always walk away with their data) and downloads the CSV via a
 * blob URL. The deals export is the canonical "your data" file for now;
 * companies / contacts exports are tracked separately.
 *
 * Pass an open `from=1970-01-01&to=today` window so the default
 * this-month-only filter on the reports endpoint doesn't accidentally
 * truncate a long-tenured customer's history at the moment they're
 * trying to walk away.
 */
async function downloadDataExport(accessToken: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const url = `${API_BASE_URL}/api/v1/reports/export-csv?from=1970-01-01&to=${today}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
  });
  if (!res.ok) return;
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = `simplecrm-export-${today}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

export function ProtectedRoute({ children, requireOrg = true }: ProtectedRouteProps) {
  const { accessToken, refreshSettled } = useAuth();
  const query = useCurrentUser();

  // Cold-load: AuthProvider is exchanging the refresh cookie for an access
  // token. Don't bounce to /login until that attempt has settled, otherwise
  // a typed-URL nav or full reload always lands on /login first.
  if (!accessToken && !refreshSettled) {
    return (
      <div className="flex h-full min-h-screen items-center justify-center bg-bg text-sm text-text-tertiary">
        Načítání…
      </div>
    );
  }

  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }

  if (query.isPending) {
    return (
      <div className="flex h-full min-h-screen items-center justify-center bg-bg text-sm text-text-tertiary">
        Načítání…
      </div>
    );
  }

  if (query.isError) {
    const trial = extractTrialPayload(query.error);
    if (trial) {
      return (
        <TrialExpiredGate
          payload={trial}
          onExport={accessToken ? () => void downloadDataExport(accessToken) : undefined}
        />
      );
    }
    return <Navigate to="/login" replace />;
  }

  // Logged in but no org yet → finish onboarding before entering the app.
  if (requireOrg && query.data && !query.data.organization) {
    return <Navigate to="/onboarding/create-org" replace />;
  }

  return <>{children}</>;
}
