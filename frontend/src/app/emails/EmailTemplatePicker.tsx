import type { ParseKeys } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  type EmailTemplateOut,
  useEmailTemplates,
  useMergeFields,
} from "@/app/emails/useEmailTemplates";
import { testIds } from "@/lib/testids";
import { cn } from "@/lib/utils";

/**
 * Labels for the merge-field vocabulary served by
 * `GET /email-templates/merge-fields`. The key list is the backend's; only the
 * human labels live here. A key without a label falls back to the raw token,
 * so adding one server-side degrades gracefully instead of crashing.
 */
const FIELD_LABEL_KEY: Record<string, ParseKeys<"emails">> = {
  firma: "templates.fields.firma",
  kontakt: "templates.fields.kontakt",
  kontakt_jmeno: "templates.fields.kontakt_jmeno",
  vlastnik: "templates.fields.vlastnik",
  obchod: "templates.fields.obchod",
  hodnota: "templates.fields.hodnota",
  muj_email: "templates.fields.muj_email",
};

/**
 * Compact template select. Renders nothing until the org actually has
 * templates — an empty dropdown above every compose box is pure noise.
 *
 * `hasDraft` drives the overwrite confirm: applying a template replaces both
 * subject and body, so we only ask when there is something to lose.
 */
export function EmailTemplatePicker({
  hasDraft,
  onApply,
  selectTestId,
  enabled = true,
}: {
  hasDraft: boolean;
  onApply: (template: EmailTemplateOut) => void;
  selectTestId: string;
  /** Skip the request while the surface is closed. */
  enabled?: boolean;
}) {
  const { t } = useTranslation("emails");
  const { data } = useEmailTemplates(enabled);
  const [selectedId, setSelectedId] = useState("");

  // Array guard, not just a null check: a failed/odd response must degrade to
  // "no picker", never to a render crash inside the compose modal.
  const templates = Array.isArray(data) ? data : [];
  if (templates.length === 0) return null;

  const handleChange = (id: string) => {
    if (!id) {
      setSelectedId("");
      return;
    }
    const template = templates.find((tpl) => tpl.id === id);
    if (!template) return;
    // Prefilled text (a Re: subject) counts as content worth protecting —
    // the user can't tell "typed" from "prefilled" once it's on screen.
    if (hasDraft && !window.confirm(t("templates.overwriteConfirm"))) return;
    setSelectedId(id);
    onApply(template);
  };

  return (
    <label className="block">
      <span className="text-xs font-medium text-text-secondary">{t("templates.pickerLabel")}</span>
      <select
        value={selectedId}
        data-testid={selectTestId}
        onChange={(e) => handleChange(e.target.value)}
        className="mt-1 block h-9 w-full rounded-md border border-border bg-surface-overlay px-2 text-sm text-text-primary focus:border-accent focus:outline-none"
      >
        <option value="">{t("templates.pickerPlaceholder")}</option>
        {templates.map((tpl) => (
          <option key={tpl.id} value={tpl.id}>
            {tpl.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * The merge-field vocabulary as chips. Read-only in the composer/wizard (the
 * backend substitutes them at send time on both paths); clickable in the
 * template editor, where `onInsert` drops the token at the cursor.
 *
 * `excludeDealFields` drops the deal-only tokens the server flags in
 * `deal_keys` — the bulk-email wizard has no deal behind the send, so listing
 * them there would promise a substitution that always renders empty.
 */
export function MergeFieldHint({
  onInsert,
  className,
  enabled = true,
  excludeDealFields = false,
}: {
  onInsert?: (token: string) => void;
  className?: string;
  enabled?: boolean;
  excludeDealFields?: boolean;
}) {
  const { t } = useTranslation("emails");
  const { data } = useMergeFields(enabled);
  const allKeys = Array.isArray(data?.keys) ? data.keys : [];
  // Older servers don't send `deal_keys`; an absent list simply excludes
  // nothing rather than blanking the hint.
  const dealKeys = Array.isArray(data?.deal_keys) ? data.deal_keys : [];
  const keys = excludeDealFields ? allKeys.filter((key) => !dealKeys.includes(key)) : allKeys;
  if (keys.length === 0) return null;

  return (
    <div className={cn("text-xs text-text-tertiary", className)}>
      <p>{onInsert ? t("templates.mergeHintEditor") : t("templates.mergeHint")}</p>
      <ul className="mt-1 flex flex-wrap gap-1">
        {keys.map((key) => {
          const token = `{${key}}`;
          const labelKey = FIELD_LABEL_KEY[key];
          const label = labelKey ? t(labelKey) : key;
          return (
            <li key={key}>
              {onInsert ? (
                <button
                  type="button"
                  data-testid={testIds.settings.emailTemplates.mergeChip(key)}
                  onClick={() => onInsert(token)}
                  title={label}
                  className="rounded bg-surface-overlay px-1.5 py-0.5 font-mono text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary"
                >
                  {token}
                </button>
              ) : (
                <code
                  className="rounded bg-surface-overlay px-1.5 py-0.5 text-text-secondary"
                  title={label}
                >
                  {token}
                </code>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
