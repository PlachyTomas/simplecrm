import { type ReactNode, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

/** Icon-only button whose label lives in a tooltip on hover/focus. The
 * tooltip is position:fixed off the button rect and portaled to <body>
 * (house pattern, see PipelinePage's CardActionButton) so no overflow or
 * transform on an ancestor can clip it. */
export function TooltipIconButton({
  label,
  onClick,
  testId,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  testId?: string;
  className?: string;
  children: ReactNode;
}) {
  const tooltipId = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const show = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.top - 6, left: rect.left + rect.width / 2 });
  };
  const hide = () => setPos(null);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          hide();
          onClick();
        }}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        aria-label={label}
        aria-describedby={pos ? tooltipId : undefined}
        data-testid={testId}
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-md text-text-secondary transition-colors duration-fast hover:bg-surface-overlay hover:text-text-primary",
          className,
        )}
      >
        {children}
      </button>
      {pos
        ? createPortal(
            <div
              id={tooltipId}
              role="tooltip"
              style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 80 }}
              className="pointer-events-none -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-border bg-surface-elevated px-2 py-1 text-xs text-text-secondary shadow-md"
            >
              {label}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
