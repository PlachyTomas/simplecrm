/**
 * The `?` overlay — the shortcut catalog in a dialog. Content is shared
 * with Settings → Klávesové zkratky via `ShortcutsList`.
 */

import { useTranslation } from "react-i18next";

import { ShortcutsList } from "@/app/shortcuts/ShortcutsList";
import { testIds } from "@/lib/testids";
import { useModalDialog } from "@/lib/useModalDialog";

export function ShortcutsHelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation("common");
  const dialogRef = useModalDialog<HTMLDivElement>(onClose, open);
  if (!open) return null;
  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-help-title"
      data-testid={testIds.shortcuts.helpDialog}
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 px-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-lg border border-border bg-surface shadow-lg">
        <header className="shrink-0 border-b border-border-subtle p-5">
          <h2 id="shortcuts-help-title" className="text-lg font-semibold">
            {t("shortcuts.title")}
          </h2>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <ShortcutsList />
        </div>
      </div>
    </div>
  );
}
