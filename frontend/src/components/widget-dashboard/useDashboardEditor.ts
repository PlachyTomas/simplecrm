import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";

interface UseDashboardEditorOptions<C> {
  /** The last-loaded server config. `null`/`undefined` while the query is in flight. */
  loaded: C | null | undefined;
  /** Persist the draft. Resolves when the write settles; edit mode then closes. */
  onSave: (draft: C) => Promise<unknown>;
  /** Reset to the server default (DELETE). Called after `confirmReset`, if provided. */
  onReset: () => Promise<unknown>;
  /**
   * Optional guard shown before a reset — return `false` to abort. Reports
   * wires this to `window.confirm(...)`; omit it to reset without a prompt.
   */
  confirmReset?: () => boolean;
}

export interface DashboardEditor<C> {
  isEditMode: boolean;
  /** The in-memory draft, live only while editing. */
  draft: C | null;
  /** What the page should render: the draft while editing, else the loaded config. */
  working: C | null;
  /** Direct draft setter — page handlers spread `working` and set the next draft. */
  setDraft: Dispatch<SetStateAction<C | null>>;
  enterEdit: () => void;
  cancel: () => void;
  save: () => Promise<void>;
  reset: () => Promise<void>;
}

/**
 * Edit-mode draft state for a widget dashboard, extracted verbatim from
 * `ReportsPage` so Home can reuse it with zero behavior change.
 *
 * The working copy is whatever's currently displayed: in view mode the
 * server config, in edit mode the in-memory draft (so unsaved moves
 * don't blow away when the query refetches). The draft initializes once
 * on entering edit mode and clears whenever edit mode ends. Escape
 * cancels, matching the Cancel button.
 */
export function useDashboardEditor<C>({
  loaded,
  onSave,
  onReset,
  confirmReset,
}: UseDashboardEditorOptions<C>): DashboardEditor<C> {
  const [isEditMode, setIsEditMode] = useState(false);
  const [draft, setDraft] = useState<C | null>(null);

  const working = isEditMode ? draft : (loaded ?? null);

  // Initialize the draft once when entering edit mode; clear it when leaving.
  useEffect(() => {
    if (isEditMode && loaded && !draft) {
      setDraft(loaded);
    }
    if (!isEditMode && draft) {
      setDraft(null);
    }
  }, [isEditMode, loaded, draft]);

  // Escape exits edit mode without saving — keyboard parity with the
  // Cancel button. react-grid-layout's drag is mouse-only, so this is
  // the only keyboard escape hatch we promise.
  useEffect(() => {
    if (!isEditMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDraft(null);
        setIsEditMode(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isEditMode]);

  const enterEdit = useCallback(() => setIsEditMode(true), []);

  const cancel = useCallback(() => {
    setDraft(null);
    setIsEditMode(false);
  }, []);

  const save = useCallback(async () => {
    if (!draft) return;
    await onSave(draft);
    setIsEditMode(false);
  }, [draft, onSave]);

  const reset = useCallback(async () => {
    if (confirmReset && !confirmReset()) return;
    await onReset();
    setIsEditMode(false);
    setDraft(null);
  }, [onReset, confirmReset]);

  return { isEditMode, draft, working, setDraft, enterEdit, cancel, save, reset };
}
