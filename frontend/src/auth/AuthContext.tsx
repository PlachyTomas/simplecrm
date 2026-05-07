import { createContext, useCallback, useEffect, useMemo, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";

export interface AuthContextValue {
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
  clearAuth: () => void;
  /**
   * True once the cold-load refresh attempt has either completed or been
   * skipped (because we already had a token from the hash / OAuth callback).
   * Lets ProtectedRoute distinguish "still figuring out auth" from
   * "definitely logged out, redirect to /login".
   */
  refreshSettled: boolean;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: React.ReactNode;
  initialToken?: string | null;
}

interface RefreshResponse {
  access_token: string;
}

/**
 * Access tokens are held in memory only — never localStorage — per the
 * security guidance in the product brief. The httponly refresh cookie set by
 * `/auth/google/callback` is exchanged for a fresh access token via
 * `POST /auth/refresh` on cold-load; that lets a typed-URL navigation, full
 * reload, or new-tab open re-hydrate the in-memory token without bouncing
 * the user through Google again.
 *
 * Cold-load timeline:
 *   1. Render with `accessToken = readTokenFromHash() ?? null`.
 *   2. If null, kick off `POST /auth/refresh` from a useEffect.
 *   3. While the request is in flight, `refreshSettled = false`.
 *   4. On 2xx, set the access token; on any error (including 401), leave
 *      it null. Either way, `refreshSettled` flips to true.
 *
 * The hash is read synchronously in the state initializer so the first
 * render already carries the token. Reading it from a useEffect would
 * race with ProtectedRoute's <Navigate to="/login">, whose effect fires
 * first (children-first effect order) and strips the hash before we get
 * to it.
 */
function readTokenFromHash(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  if (!hash.startsWith("#access_token=")) return null;
  return decodeURIComponent(hash.slice("#access_token=".length));
}

export function AuthProvider({ children, initialToken = null }: AuthProviderProps) {
  const [accessToken, setAccessToken] = useState<string | null>(
    () => initialToken ?? readTokenFromHash(),
  );
  // If we already had a token from the hash, no refresh attempt is needed.
  const [refreshSettled, setRefreshSettled] = useState(() => accessToken !== null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash.startsWith("#access_token=")) {
      const cleanUrl = window.location.pathname + window.location.search;
      window.history.replaceState(null, "", cleanUrl);
    }
  }, []);

  useEffect(() => {
    // Cold-load refresh attempt. Runs once on mount when no in-memory token
    // is present. The refresh cookie may not exist (logged out, expired, or
    // never logged in) — any failure is silent and we stay logged out.
    if (refreshSettled) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<RefreshResponse>("/api/v1/auth/refresh", {
          method: "POST",
        });
        if (!cancelled) setAccessToken(res.access_token);
      } catch (err) {
        // 401 = no/expired/invalid cookie. Anything else (network, 500) is
        // also treated as "stay logged out". Don't surface to user; the
        // login screen is the right next step.
        if (!(err instanceof ApiError) && err) {
          // Logging the unexpected case helps catch CORS / wiring issues
          // early without breaking the UX.
          console.warn("auth refresh failed", err);
        }
      } finally {
        if (!cancelled) setRefreshSettled(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshSettled]);

  const clearAuth = useCallback(() => {
    setAccessToken(null);
    // After an explicit logout the refresh cookie is gone too; don't try
    // to refresh a third time. Settled stays true.
    setRefreshSettled(true);
  }, []);

  const wrappedSetAccessToken = useCallback((token: string | null) => {
    setAccessToken(token);
    if (token !== null) setRefreshSettled(true);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken,
      setAccessToken: wrappedSetAccessToken,
      clearAuth,
      refreshSettled,
    }),
    [accessToken, wrappedSetAccessToken, clearAuth, refreshSettled],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
