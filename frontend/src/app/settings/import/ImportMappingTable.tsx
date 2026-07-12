/**
 * Per-side mapping table — one row per CSV header, with a <select> for
 * each picking a target DB field (or "Ignorovat").
 *
 * Required fields show a warning when no header is mapped to them, so
 * the admin knows the /preview will reject before they click.
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

export interface FieldOption {
  key: string;
  label: string;
  required: boolean;
}

export function ImportMappingTable(props: {
  title: string;
  headers: string[];
  fields: FieldOption[];
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  testIdPrefix: string;
}) {
  const { t } = useTranslation("settings");
  const requiredKeys = useMemo(
    () => props.fields.filter((f) => f.required).map((f) => f.key),
    [props.fields],
  );
  const mappedTargets = useMemo(
    () => new Set(Object.values(props.value).filter((v) => v && v !== "ignore")),
    [props.value],
  );
  const missingRequired = requiredKeys.filter((k) => !mappedTargets.has(k));

  return (
    <fieldset className="rounded-md border border-border bg-surface p-4">
      <legend className="px-2 text-sm font-medium">{props.title}</legend>
      {props.headers.length === 0 ? (
        <p className="text-sm text-text-tertiary">{t("import.mappingTable.emptyMessage")}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-text-tertiary">
              <th className="pb-2 pr-4">{t("import.mappingTable.csvColumnHeader")}</th>
              <th className="pb-2">{t("import.mappingTable.appFieldHeader")}</th>
            </tr>
          </thead>
          <tbody>
            {props.headers.map((header) => {
              const current = props.value[header] ?? "ignore";
              return (
                <tr key={header} className="border-t border-border">
                  <td className="py-2 pr-4 font-mono text-text-secondary">{header}</td>
                  <td className="py-2">
                    <select
                      value={current}
                      onChange={(e) => props.onChange({ ...props.value, [header]: e.target.value })}
                      className="rounded-md border border-border bg-bg px-2 py-1"
                      data-testid={`${props.testIdPrefix}-${header}`}
                      aria-label={t("import.mappingTable.columnAriaLabel", { header })}
                    >
                      <option value="ignore">{t("import.mappingTable.ignoreOption")}</option>
                      {props.fields.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                          {f.required ? " *" : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {missingRequired.length > 0 && (
        <p className={cn("mt-3 text-xs text-warning")} role="alert">
          {t("import.mappingTable.missingRequiredPrefix")}{" "}
          {missingRequired.map((k) => props.fields.find((f) => f.key === k)?.label ?? k).join(", ")}
        </p>
      )}
    </fieldset>
  );
}
