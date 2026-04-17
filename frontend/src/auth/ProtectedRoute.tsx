import { Navigate } from "react-router-dom";

import { useAuth } from "@/auth/useAuth";
import { TrialExpiredGate } from "@/auth/TrialExpiredGate";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { type TrialExpiredPayload, isTrialExpired } from "@/lib/api";

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
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { accessToken } = useAuth();
  const query = useCurrentUser();

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
      return <TrialExpiredGate payload={trial} />;
    }
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
