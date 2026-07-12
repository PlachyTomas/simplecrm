import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/auth/useAuth";
import { useCurrentUser } from "@/auth/useCurrentUser";

interface RequireSuperAdminProps {
  children: React.ReactNode;
}

/**
 * Gate the /admin surface. Mirrors `ProtectedRoute`'s shape but the
 * acceptance bar is `is_super_admin === true`. Non-super-admins
 * authenticated as regular users get bounced to /app; unauthenticated
 * users go to /login. We never reveal whether the route exists to
 * unauthenticated visitors — they always see /login.
 */
export function RequireSuperAdmin({ children }: RequireSuperAdminProps) {
  const { t } = useTranslation("auth");
  const { accessToken, refreshSettled } = useAuth();
  const query = useCurrentUser();

  if (!accessToken && !refreshSettled) {
    return (
      <div className="flex h-full min-h-screen items-center justify-center bg-bg text-sm text-text-tertiary">
        {t("shared.loading")}
      </div>
    );
  }

  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }

  if (query.isPending) {
    return (
      <div className="flex h-full min-h-screen items-center justify-center bg-bg text-sm text-text-tertiary">
        {t("shared.loading")}
      </div>
    );
  }

  if (query.isError || !query.data) {
    return <Navigate to="/login" replace />;
  }

  if (!query.data.is_super_admin) {
    return <Navigate to="/app" replace />;
  }

  return <>{children}</>;
}
