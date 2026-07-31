/**
 * App-wide keyboard layer (desktop). Mounted once in AppShell.
 *
 * - ⌘K / Ctrl+K or `/` → focus the global search (custom event; the
 *   search component owns its input).
 * - `n` → new deal from anywhere (AddDealModal hosted here, stages from
 *   the default pipeline).
 * - `g` then a letter → navigate (see GO_ROUTES; 1.5 s to complete).
 * - `?` → shortcut catalog dialog.
 *
 * Guards: never while typing in an input/textarea/select/contentEditable,
 * never with a modifier held (except ⌘K itself), and sequences don't
 * start while a dialog is open — its focus trap owns the keyboard.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { AddDealModal } from "@/app/deals/AddDealModal";
import { ShortcutsHelpDialog } from "@/app/shortcuts/ShortcutsHelpDialog";
import { usePipeline } from "@/app/settings/usePipelineSettings";
import { FOCUS_SEARCH_EVENT, GO_ROUTES, isDialogOpen, isEditableTarget } from "@/lib/shortcuts";

const SEQUENCE_TIMEOUT_MS = 1500;

export function GlobalShortcuts() {
  const navigate = useNavigate();
  const [helpOpen, setHelpOpen] = useState(false);
  const [newDealOpen, setNewDealOpen] = useState(false);
  const pendingG = useRef(false);
  const gTimer = useRef<number | undefined>(undefined);

  const { data: pipeline } = usePipeline();
  const stageOptions = useMemo(
    () => (pipeline?.stages ?? []).map((s) => ({ id: s.id, name: s.name })),
    [pipeline],
  );
  const firstOpenStageId = useMemo(
    () => pipeline?.stages?.find((s) => s.stage_type === "open")?.id,
    [pipeline],
  );

  useEffect(() => {
    const clearSequence = () => {
      pendingG.current = false;
      window.clearTimeout(gTimer.current);
    };

    const onKey = (e: KeyboardEvent) => {
      // ⌘K / Ctrl+K works everywhere except inside another text control's
      // own combos; it intentionally beats the dialog guard — jumping to
      // search is safe from anywhere.
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent(FOCUS_SEARCH_EVENT));
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      if (isDialogOpen()) return;

      const key = e.key;
      if (pendingG.current) {
        clearSequence();
        const route = GO_ROUTES[key.toLowerCase()];
        if (route) {
          e.preventDefault();
          navigate(route);
        }
        return;
      }

      switch (key) {
        case "/":
          e.preventDefault();
          window.dispatchEvent(new CustomEvent(FOCUS_SEARCH_EVENT));
          return;
        case "?":
          e.preventDefault();
          setHelpOpen(true);
          return;
        case "n":
        case "N":
          e.preventDefault();
          setNewDealOpen(true);
          return;
        case "g":
        case "G":
          pendingG.current = true;
          window.clearTimeout(gTimer.current);
          gTimer.current = window.setTimeout(clearSequence, SEQUENCE_TIMEOUT_MS);
          return;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearSequence();
    };
  }, [navigate]);

  return (
    <>
      <ShortcutsHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      {newDealOpen ? (
        <AddDealModal
          open
          onClose={() => setNewDealOpen(false)}
          stages={stageOptions}
          initialStageId={firstOpenStageId}
        />
      ) : null}
    </>
  );
}
