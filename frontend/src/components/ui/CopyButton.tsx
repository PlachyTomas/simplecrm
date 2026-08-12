import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface Props {
  /** The exact text placed on the clipboard. */
  value: string;
  /** Accessible name while idle (icon-only button). */
  label: string;
  /** Accessible name for the ~1.5s confirmation after a copy. */
  copiedLabel: string;
  /** Prompt title for the no-clipboard-API fallback. Omit to skip it. */
  promptLabel?: string;
  testId?: string;
  className?: string;
}

/** How long the check mark stays before the icon reverts. */
const CONFIRM_MS = 1_500;

/**
 * Icon button that copies a single value and does nothing else.
 *
 * It usually sits next to something clickable — a `mailto:` link, a contact
 * row — so the click is stopped dead here: copying must never also open the
 * mail client or navigate. The check-mark swap is the whole feedback; no
 * toast, because these live in dense rows where a toast per copy is noise.
 */
export function CopyButton({ value, label, copiedLabel, promptLabel, testId, className }: Props) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy(e: React.MouseEvent) {
    // Both halves matter: stopPropagation for a clickable ancestor,
    // preventDefault for an anchor or a form submit around it.
    e.preventDefault();
    e.stopPropagation();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), CONFIRM_MS);
    } catch {
      // No clipboard API over plain HTTP or in some in-app browsers — fall
      // back to a selectable prompt, like the invite link and inbound address.
      if (promptLabel) window.prompt(promptLabel, value);
    }
  }

  return (
    <button
      type="button"
      onClick={(e) => void copy(e)}
      data-testid={testId}
      aria-label={copied ? copiedLabel : label}
      title={copied ? copiedLabel : label}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors duration-fast hover:bg-surface-overlay hover:text-text-primary",
        copied && "text-success",
        className,
      )}
    >
      {copied ? (
        <Check size={14} strokeWidth={1.75} aria-hidden />
      ) : (
        <Copy size={14} strokeWidth={1.75} aria-hidden />
      )}
    </button>
  );
}
