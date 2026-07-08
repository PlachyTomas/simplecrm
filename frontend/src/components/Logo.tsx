import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

interface LogoProps {
  /**
   * `"full"` renders the icon mark plus the "SimpleCRM" wordmark (default).
   * `"mark"` renders just the icon mark for tight/collapsed spots — pair it
   * with an `aria-label="SimpleCRM"` on the wrapping element, since there's
   * no visible text left to name it.
   */
  variant?: "full" | "mark";
  /**
   * Wordmark text size. `"lg"` matches the landing page header, `"sm"`
   * matches the landing page footer / other compact contexts. No effect on
   * `variant="mark"`.
   */
  size?: "lg" | "sm";
  className?: string;
}

const WORDMARK_SIZE_CLASSES: Record<NonNullable<LogoProps["size"]>, string> = {
  lg: "text-lg font-semibold",
  sm: "text-sm font-semibold",
};

/**
 * SimpleCRM brand mark: a pink Sparkles glyph in a rounded highlight-colored
 * box, plus the "SimpleCRM" wordmark. This is the canonical mark — shared by
 * the landing page header/footer and the app sidebar/header, so the three
 * can no longer drift apart (the favicon mirrors it too, see
 * `frontend/public/favicon.svg`).
 *
 * Presentational only — wrap it in a `Link`/`NavLink` at the call site and
 * give that link an accessible label. The icon box is `aria-hidden`; with
 * `variant="full"` the visible "SimpleCRM" text also names it, but with
 * `variant="mark"` the accessible name comes entirely from the wrapping
 * element's `aria-label`.
 */
export function Logo({ variant = "full", size = "lg", className }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        aria-hidden
        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-highlight text-text-on-accent"
      >
        <Sparkles size={18} strokeWidth={1.75} />
      </span>
      {variant === "full" ? (
        <span className={WORDMARK_SIZE_CLASSES[size]}>SimpleCRM</span>
      ) : null}
    </span>
  );
}
