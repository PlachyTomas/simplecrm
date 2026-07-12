import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

interface GatedMailButtonProps {
  /** SMTP configured AND verified (see {@link isSmtpVerified}). */
  verified: boolean;
  /** Opens the composer. Called only when {@link verified}. */
  onClick: () => void;
  /** Button contents (icon, or icon + label). */
  children: ReactNode;
  /** Button styling — the caller controls the shape (label vs icon-only). */
  className?: string;
  /** aria-label, required for icon-only buttons. */
  ariaLabel?: string;
}

/**
 * A "Send email" button that is gated on verified SMTP. When SMTP is not
 * verified the button stays focusable (`aria-disabled`, not `disabled`) and
 * no-ops on click, and a small popover — shown on hover AND focus — explains
 * how to fix it with a link to the Integrations settings section (review
 * finding #2/#7/#9).
 *
 * The popover is positioned with `position: fixed` off the button's rect so it
 * is never clipped by an ancestor's `overflow-hidden`/`overflow-x-auto` (the
 * deal dialog panel and the company deals table both clip).
 */
export function GatedMailButton({
  verified,
  onClick,
  children,
  className,
  ariaLabel,
}: GatedMailButtonProps) {
  const { t } = useTranslation("emails");
  const tooltipId = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  if (verified) {
    return (
      <button type="button" onClick={onClick} aria-label={ariaLabel} className={className}>
        {children}
      </button>
    );
  }

  const show = () => {
    window.clearTimeout(hideTimer.current);
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      const width = 240;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      setPos({ top: rect.bottom + 6, left });
    } else {
      setPos({ top: 0, left: 8 });
    }
  };

  // A short delay bridges the gap between the button and the popover so the
  // pointer (or focus) can travel to the link inside without it vanishing.
  const scheduleHide = () => {
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setPos(null), 120);
  };

  const open = pos !== null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-disabled="true"
        aria-describedby={open ? tooltipId : undefined}
        aria-label={ariaLabel}
        onClick={(e) => e.preventDefault()}
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
        onFocus={show}
        onBlur={scheduleHide}
        className={cn(className, "cursor-not-allowed opacity-60")}
      >
        {children}
      </button>
      {open ? (
        <div
          id={tooltipId}
          role="tooltip"
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 80, width: 240 }}
          onMouseEnter={show}
          onMouseLeave={scheduleHide}
          className="rounded-md border border-border bg-surface-elevated p-3 text-xs text-text-secondary shadow-lg"
        >
          {t("gatedMail.hint")}{" "}
          <Link
            to="/app/settings/integrations"
            className="font-medium text-accent hover:text-accent-hover"
            onFocus={show}
            onBlur={scheduleHide}
          >
            {t("gatedMail.settingsLink")}
          </Link>
        </div>
      ) : null}
    </>
  );
}
