import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Backdrop click-away guard for modal dialogs: when the user has entered data
 * (`dirty`), a click on the backdrop must NOT silently discard it. Instead the
 * panel gets a brief nudge — the `.dialog-dismiss-nudge` shake + warning
 * border flash from index.css — pointing the user to the explicit Zrušit/X
 * affordances. Escape and the explicit buttons still close as before; a clean
 * dialog still closes on click-away.
 *
 * Usage:
 *   const { onBackdropClick, nudgeClass } = useDismissGuard(onClose, dirty);
 * Put `onClick={onBackdropClick}` on the backdrop container (replacing the
 * `e.target === e.currentTarget` inline check) and append `nudgeClass` to the
 * panel's className.
 */
export function useDismissGuard(onClose: () => void, dirty: boolean) {
  const [nudge, setNudge] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  // Refs so the callbacks stay stable across renders (mirrors useModalDialog).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const requestDismiss = useCallback(() => {
    if (!dirtyRef.current) {
      onCloseRef.current();
      return;
    }
    // Drop the class for one frame so a repeat click restarts the animation.
    setNudge(false);
    window.clearTimeout(timer.current);
    requestAnimationFrame(() => {
      setNudge(true);
      timer.current = window.setTimeout(() => setNudge(false), 450);
    });
  }, []);

  const onBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) requestDismiss();
    },
    [requestDismiss],
  );

  return { onBackdropClick, nudgeClass: nudge ? "dialog-dismiss-nudge" : "" };
}
