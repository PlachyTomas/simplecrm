import { Plus } from "lucide-react";
import { useState } from "react";

/**
 * The add-a-todo line. Enter submits and keeps focus, so a burst of todos
 * is one uninterrupted typing run — the same reason iOS keeps the cursor
 * in the new row.
 */
export function TodoComposer({
  placeholder,
  disabled = false,
  testId,
  onAdd,
}: {
  placeholder: string;
  disabled?: boolean;
  testId: string;
  onAdd: (text: string) => Promise<unknown>;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const text = value.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await onAdd(text);
      setValue("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Plus size={14} strokeWidth={1.75} aria-hidden className="shrink-0 text-text-tertiary" />
      <input
        type="text"
        value={value}
        maxLength={500}
        disabled={disabled || busy}
        data-testid={testId}
        aria-label={placeholder}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
          if (e.key === "Escape") setValue("");
        }}
        className="h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-sm text-text-primary transition-colors duration-fast hover:border-border focus:border-accent focus:bg-surface-overlay focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}
