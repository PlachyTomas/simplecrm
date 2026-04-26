import { Monitor, Moon, Sun } from "lucide-react";

import { type Theme, useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  /** Slim two-button variant in landing page nav uses `compact`. */
  variant?: "default" | "compact";
  className?: string;
}

const OPTIONS: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Světlý", icon: Sun },
  { value: "dark", label: "Tmavý", icon: Moon },
  { value: "system", label: "Systém", icon: Monitor },
];

export function ThemeToggle({ variant = "default", className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Motiv vzhledu"
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border bg-surface p-0.5",
        className,
      )}
    >
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const active = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.label}
            onClick={() => setTheme(option.value)}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-sm px-2 text-xs font-medium transition-colors duration-fast",
              active
                ? "bg-accent-subtle text-accent"
                : "text-text-tertiary hover:bg-surface-overlay hover:text-text-primary",
            )}
          >
            <Icon size={14} strokeWidth={1.75} aria-hidden />
            {variant === "default" ? <span>{option.label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
