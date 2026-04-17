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
 */
export function AuthProvider({ children, initialToken = null }: AuthProviderProps) {
  const [accessToken, setAccessToken] = useState<string | null>(initialToken);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash.startsWith("#access_token=")) return;
    const token = decodeURIComponent(hash.slice("#access_token=".length));
    setAccessToken(token);
    const cleanUrl = window.location.pathname + window.location.search;
    window.history.replaceState(null, "", cleanUrl);
  }, []);

  const clearAuth = useCallback(() => setAccessToken(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({ accessToken, setAccessToken, clearAuth }),
    [accessToken, clearAuth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
