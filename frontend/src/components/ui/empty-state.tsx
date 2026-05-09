import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  /** Lucide icon rendered in the monochrome glyph. */
  icon: LucideIcon;
  /** 18/600 headline — Czech, warm, specific. */
  title: string;
  /** 14/regular body — single sentence, vykání. */
  body: ReactNode;
  /** Optional primary action — verb that matches the headline. */
  primary?: { label: string; onClick?: () => void; href?: string };
  /** Optional secondary text-link beneath the primary. */
  secondary?: { label: string; onClick?: () => void; href?: string };
  /** Use the `filtered` tone for "no results for these filters" states. */
  tone?: "default" | "filtered";
  className?: string;
}

/**
 * Unified empty-state primitive. Use this everywhere a data-dependent view
 * has no rows. Pages should hide their header primary CTA while this is
 * rendered (Segment guidance — avoid duplicate primaries).
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  primary,
  secondary,
  tone = "default",
  className,
}: EmptyStateProps) {
  const filtered = tone === "filtered";
  return (
    <div
      role="status"
      className={cn(
        "mx-auto flex max-w-md flex-col items-center justify-center gap-3 px-4 py-12 text-center",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-flex h-12 w-12 items-center justify-center rounded-md",
          filtered ? "bg-surface-overlay text-text-tertiary" : "bg-accent-subtle text-accent",
        )}
      >
        <Icon size={24} strokeWidth={1.75} />
      </span>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-text-secondary">{body}</p>
      {primary ? <PrimaryAction action={primary} /> : null}
      {secondary ? <SecondaryAction action={secondary} /> : null}
    </div>
  );
}

interface ActionConfig {
  label: string;
  onClick?: () => void;
  href?: string;
}

function PrimaryAction({ action }: { action: ActionConfig }) {
  const className =
    "mt-1 inline-flex h-9 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover";
  if (action.href) {
    return (
      <a href={action.href} className={className}>
        {action.label}
      </a>
    );
  }
  return (
    <button type="button" onClick={action.onClick} className={className}>
      {action.label}
    </button>
  );
}

function SecondaryAction({ action }: { action: ActionConfig }) {
  const className = "text-sm font-medium text-accent underline-offset-4 hover:underline";
  if (action.href) {
    return (
      <a href={action.href} className={className}>
        {action.label}
      </a>
    );
  }
  return (
    <button type="button" onClick={action.onClick} className={className}>
      {action.label}
    </button>
  );
}
