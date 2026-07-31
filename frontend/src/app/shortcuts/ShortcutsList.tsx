/**
 * Rendered catalog of keyboard shortcuts — one component, two homes:
 * the `?` help dialog and Settings → Klávesové zkratky. Duplicate rows
 * for the same action (⌘K and `/`) collapse into one line with both
 * combos so the list reads as capabilities, not keycodes.
 */

import { Fragment } from "react";
import { useTranslation } from "react-i18next";

import { SHORTCUT_GROUPS, type ShortcutDef } from "@/lib/shortcuts";

function Keys({ def }: { def: ShortcutDef }) {
  return (
    <span className="inline-flex items-center gap-1">
      {def.keys.map((key, i) => (
        <Fragment key={i}>
          {i > 0 ? <span className="text-xs text-text-tertiary">→</span> : null}
          <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-border bg-surface-overlay px-1.5 font-mono text-xs text-text-secondary">
            {key}
          </kbd>
        </Fragment>
      ))}
    </span>
  );
}

export function ShortcutsList() {
  const { t } = useTranslation("common");
  return (
    <div className="space-y-5">
      {SHORTCUT_GROUPS.map((group) => {
        // Collapse same-label rows (⌘K + "/") into one line.
        const rows = new Map<string, ShortcutDef[]>();
        for (const item of group.items) {
          const key = item.labelKey;
          rows.set(key, [...(rows.get(key) ?? []), item]);
        }
        return (
          <section key={group.id}>
            <h3 className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
              {t(group.titleKey)}
            </h3>
            <ul className="mt-2 divide-y divide-border-subtle">
              {[...rows.entries()].map(([labelKey, defs]) => (
                <li key={labelKey} className="flex items-center justify-between gap-4 py-2">
                  <span className="text-sm text-text-primary">
                    {t(labelKey as (typeof defs)[0]["labelKey"])}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    {defs.map((def, i) => (
                      <Fragment key={def.id}>
                        {i > 0 ? (
                          <span className="text-xs text-text-tertiary">
                            {t("shortcuts.orSeparator")}
                          </span>
                        ) : null}
                        <Keys def={def} />
                      </Fragment>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <p className="text-xs text-text-tertiary">{t("shortcuts.editableHint")}</p>
    </div>
  );
}
