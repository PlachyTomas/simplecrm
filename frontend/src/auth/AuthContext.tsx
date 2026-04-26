import { createContext, useCallback, useEffect, useMemo, useState } from "react";

export interface AuthContextValue {
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
  clearAuth: () => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: React.ReactNode;
  initialToken?: string | null;
}

/**
 * Access tokens are held in memory only — never localStorage — per the
 * security guidance in the product brief. A refresh-token cookie lets a
 * future `/auth/refresh` call hydrate the token; that wiring lands in a
 * later task, so reloading the page during MVP drops the in-memory token
 * and bounces the user back to the login screen.
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash.startsWith("#access_token=")) {
      const cleanUrl = window.location.pathname + window.location.search;
      window.history.replaceState(null, "", cleanUrl);
    }
  }, []);

  const clearAuth = useCallback(() => setAccessToken(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({ accessToken, setAccessToken, clearAuth }),
    [accessToken, clearAuth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
