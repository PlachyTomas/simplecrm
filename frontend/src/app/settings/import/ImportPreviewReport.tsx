/**
 * Dry-run report shown between /preview and /commit.
 *
 * Three blocks:
 *   1. Count cards (create / update / invalid / unmatched).
 *   2. Per-row errors list with codes (first 100; the API returns
 *      everything but the UI clips to keep the screen readable).
 *   3. Update diffs — collapsible, shows field-level from→to changes
 *      so the admin sees exactly what will change on existing rows
 *      before committing.
 */

import { AlertCircle, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useState } from "react";

import type { ImportPreviewOut } from "@/app/settings/import/useImport";
import { cn } from "@/lib/utils";

const MAX_ERRORS_RENDERED = 100;

export function ImportPreviewReport(props: {
  result: ImportPreviewOut;
  skipUnmatched: boolean;
  setSkipUnmatched: (v: boolean) => void;
  onBack: () => void;
  onCommit: () => void;
  isCommitting: boolean;
  onCancel: () => void;
}) {
  const { result } = props;
  const totalCreated = result.counts.companies_to_create + result.counts.contacts_to_create;
  const totalUpdated = result.counts.companies_to_update + result.counts.contacts_to_update;
  const blocked = result.counts.invalid_rows > 0 && totalCreated === 0 && totalUpdated === 0;

  return (
    <section className="space-y-6">
      <div className="grid gap-3 md:grid-cols-4">
        <CountCard label="Firmy — nové" value={result.counts.companies_to_create} />
        <CountCard label="Firmy — aktualizace" value={result.counts.companies_to_update} />
        <CountCard label="Kontakty — nové" value={result.counts.contacts_to_create} />
        <CountCard label="Kontakty — aktualizace" value={result.counts.contacts_to_update} />
        <CountCard
          label="Chybné řádky"
          value={result.counts.invalid_rows}
          tone={result.counts.invalid_rows > 0 ? "danger" : "neutral"}
        />
        <CountCard
          label="Nezpárované kontakty"
          value={result.counts.unmatched_contacts}
          tone={result.counts.unmatched_contacts > 0 ? "warning" : "neutral"}
        />
      </div>

      {result.errors.length > 0 && <ErrorList errors={result.errors} />}

      {result.update_diffs.length > 0 && (
        <DiffPanel diffs={result.update_diffs} truncated={result.update_diffs_truncated} />
      )}

      {result.unmatched.length > 0 && <UnmatchedList unmatched={result.unmatched} />}

      <fieldset className="rounded-md border border-border bg-surface p-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={props.skipUnmatched}
            onChange={(e) => props.setSkipUnmatched(e.target.checked)}
            data-testid="import-skip-unmatched"
          />
          Přeskočit nezpárované kontakty bez chybové hlášky
        </label>
        <p className="mt-1 pl-6 text-xs text-text-tertiary">
          Pokud zatrhnete, kontakty bez nalezené firmy se přeskočí — chybové hlášky nezablokují
          import. Jinak je import považuje za chyby a zapíše pouze úspěšné řádky.
        </p>
      </fieldset>

      <div className="flex justify-between">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={props.onBack}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-bg"
          >
            Upravit mapování
          </button>
          <button
            type="button"
            onClick={props.onCancel}
            className="rounded-md border border-border px-4 py-2 text-sm text-text-tertiary hover:text-text-primary"
          >
            Zrušit
          </button>
        </div>
        <button
          type="button"
          onClick={props.onCommit}
          disabled={blocked || props.isCommitting}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="import-confirm-commit"
        >
          {props.isCommitting && <Loader2 className="animate-spin" size={14} />}
          {blocked ? "Není co importovat" : "Potvrdit a importovat"}
        </button>
      </div>
    </section>
  );
}

function CountCard(props: {
  label: string;
  value: number;
  tone?: "neutral" | "warning" | "danger";
}) {
  const tone = props.tone ?? "neutral";
  return (
    <div
      className={cn(
        "rounded-md border bg-surface p-3 text-sm",
        tone === "warning" && "border-warning",
        tone === "danger" && "border-danger",
        tone === "neutral" && "border-border",
      )}
    >
      <div className="text-xs uppercase tracking-wide text-text-tertiary">{props.label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{props.value}</div>
    </div>
  );
}

function ErrorList({ errors }: { errors: ImportPreviewOut["errors"] }) {
  const visible = errors.slice(0, MAX_ERRORS_RENDERED);
  const overflow = errors.length - visible.length;
  return (
    <details open className="rounded-md border border-danger bg-danger/5 p-4">
      <summary className="cursor-pointer text-sm font-medium text-danger">
        Chybové řádky ({errors.length})
      </summary>
      <ul className="mt-3 space-y-2 text-sm">
        {visible.map((err, idx) => (
          <li key={`${err.row_index}-${err.code}-${idx}`} className="flex items-start gap-2">
            <AlertCircle size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-danger" />
            <span>
              <span className="font-mono text-xs text-text-tertiary">
                ř. {err.row_index} ({err.side}
                {err.field ? `, ${err.field}` : ""})
              </span>{" "}
              — {err.message}
            </span>
          </li>
        ))}
      </ul>
      {overflow > 0 && (
        <p className="mt-2 text-xs text-text-tertiary">…dalších {overflow} chyb skryto.</p>
      )}
    </details>
  );
}

function DiffPanel(props: { diffs: ImportPreviewOut["update_diffs"]; truncated: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-md border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium"
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        Bude změněno: {props.diffs.length} záznamů
        {props.truncated && (
          <span className="ml-2 text-xs text-text-tertiary">(zobrazeno prvních 200)</span>
        )}
      </button>
      {open && (
        <div className="space-y-3 border-t border-border p-4 text-sm">
          {props.diffs.map((diff) => (
            <div key={`${diff.entity_id}-${diff.row_index}`}>
              <div className="text-xs text-text-tertiary">
                ř. {diff.row_index} · {diff.entity_type} · {diff.entity_id}
              </div>
              <ul className="mt-1 space-y-0.5">
                {Object.entries(diff.changes).map(([field, change]) => (
                  <li key={field} className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-text-secondary">{field}:</span>
                    <span className="text-text-tertiary line-through">{change.from ?? "—"}</span>
                    <span>→</span>
                    <span className="font-medium">{change.to ?? "—"}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UnmatchedList({ unmatched }: { unmatched: ImportPreviewOut["unmatched"] }) {
  return (
    <details className="rounded-md border border-warning bg-warning/5 p-4">
      <summary className="cursor-pointer text-sm font-medium text-warning">
        Nezpárované kontakty ({unmatched.length})
      </summary>
      <ul className="mt-3 space-y-1 text-sm">
        {unmatched.map((u) => (
          <li key={u.row_index} className="font-mono text-xs">
            ř. {u.row_index} — {u.first_name ?? "?"} {u.last_name ?? "?"} (klíč:{" "}
            {u.match_key_value ?? "—"})
          </li>
        ))}
      </ul>
    </details>
  );
}
