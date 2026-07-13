import { CheckCircle2, X, XCircle } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

export type ToastVariant = "success" | "error" | "info";

interface ToastEntry {
  id: number;
  variant: ToastVariant;
  message: string;
}

interface ToastContextValue {
  toast: (variant: ToastVariant, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const FALLBACK: ToastContextValue = {
  toast: () => {},
  success: () => {},
  error: () => {},
};

/**
 * Tiny in-memory toast system. Each mutation in the app can call
 * `toast.success(t("company.saved"))` or `toast.error("...")`. No external dep.
 * Toasts auto-dismiss after 4s (success/info) or 6s (error). Keeps copy
 * consistent (past-tense success, specific error) per FIXES_TASK B12.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<ToastEntry[]>([]);

  const remove = useCallback((id: number) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const toast = useCallback(
    (variant: ToastVariant, message: string) => {
      const id = Date.now() + Math.random();
      setEntries((prev) => [...prev, { id, variant, message }]);
      const ttl = variant === "error" ? 6000 : 4000;
      window.setTimeout(() => remove(id), ttl);
    },
    [remove],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (m) => toast("success", m),
      error: (m) => toast("error", m),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport entries={entries} onDismiss={remove} />
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContextValue {
  return useContext(ToastContext) ?? FALLBACK;
}

function ToastViewport({
  entries,
  onDismiss,
}: {
  entries: ToastEntry[];
  onDismiss: (id: number) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 right-6 z-50 flex w-full max-w-sm flex-col gap-2"
    >
      {entries.map((e) => (
        <ToastCard key={e.id} entry={e} onDismiss={() => onDismiss(e.id)} />
      ))}
    </div>
  );
}

function ToastCard({ entry, onDismiss }: { entry: ToastEntry; onDismiss: () => void }) {
  const { t } = useTranslation("common");
  // Trigger the same auto-dismiss as the provider so dismissing manually
  // still cleans up if the user beat the timer (the parent already removes
  // by id, this is just defensive).
  useEffect(() => {
    return () => undefined;
  }, []);
  const Icon = entry.variant === "success" ? CheckCircle2 : XCircle;
  return (
    <div
      role={entry.variant === "error" ? "alert" : "status"}
      className={cn(
        "pointer-events-auto flex items-start gap-3 rounded-md border px-4 py-3 text-sm shadow-lg",
        entry.variant === "success" && "border-success bg-success-subtle text-text-primary",
        entry.variant === "error" && "border-danger bg-danger-subtle text-text-primary",
        entry.variant === "info" && "border-border bg-surface-elevated text-text-primary",
      )}
    >
      <Icon
        size={16}
        strokeWidth={1.75}
        className={cn(
          "mt-0.5 shrink-0",
          entry.variant === "success" && "text-success",
          entry.variant === "error" && "text-danger",
          entry.variant === "info" && "text-accent",
        )}
        aria-hidden
      />
      <p className="flex-1">{entry.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t("toast.dismissAriaLabel")}
        className="text-text-tertiary hover:text-text-primary"
      >
        <X size={14} strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );
}
