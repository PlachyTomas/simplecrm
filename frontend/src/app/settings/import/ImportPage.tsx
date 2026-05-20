/**
 * Admin CSV import wizard (v2 multi-file).
 *
 * Three-step flow on a single screen: drop one or more CSV files and
 * confirm each file's role; map each file's columns to app fields;
 * dry-run, review the diff, then commit.
 *
 * Admin-only. Non-admins land here through a stray link and see a
 * redirect to /app instead of the form.
 */

import { ArrowLeft, FileText, Loader2, ShieldAlert, UserCheck, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";

import { sniffCsvHeaders } from "@/app/settings/import/csvSniff";
import {
  autoMap,
  detectFileRole,
  type FileRole as DetectedRole,
} from "@/app/settings/import/detectFileRole";
import { ImportMappingTable } from "@/app/settings/import/ImportMappingTable";
import { ImportPreviewReport } from "@/app/settings/import/ImportPreviewReport";
import {
  type FieldDescriptor,
  type FileRole,
  type ImportPreviewOut,
  type ImportRunInput,
  type MatchSource,
  useCommitImport,
  useImportFields,
  usePreviewImport,
} from "@/app/settings/import/useImport";
import { useOrgUsers } from "@/app/settings/useUsersTeams";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { useToast } from "@/lib/toast";
import { usePageTitle } from "@/lib/usePageTitle";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3;

const ROLE_OPTIONS: { value: DetectedRole; label: string }[] = [
  { value: "companies", label: "Firmy" },
  { value: "contacts", label: "Kontakty" },
  { value: "combined", label: "Firmy + kontakty (jeden řádek = kontakt)" },
  { value: "unknown", label: "Neznámé (vyberte ručně)" },
];

interface FileEntry {
  id: string;
  file: File;
  headers: string[];
  role: DetectedRole;
  mappingCompany: Record<string, string>;
  mappingContact: Record<string, string>;
  matchKeyContact: string;
  sniffError: string | null;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ImportPage() {
  usePageTitle("Import");
  const me = useCurrentUser();
  if (me.isPending) {
    return (
      <div className="flex h-64 items-center justify-center text-text-tertiary">
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }
  if (me.data && me.data.role !== "admin") {
    return <Navigate to="/app" replace />;
  }
  return <ImportPageInner />;
}

function ImportPageInner() {
  const fields = useImportFields();
  const preview = usePreviewImport();
  const commit = useCommitImport();
  const toast = useToast();

  const [step, setStep] = useState<Step>(1);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [matchSource, setMatchSource] = useState<MatchSource>("ico");
  const [skipUnmatched, setSkipUnmatched] = useState(true);
  const [bulkOwnerUserId, setBulkOwnerUserId] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<ImportPreviewOut | null>(null);

  const needsContactSide = entries.some((e) => e.role === "contacts" || e.role === "combined");

  const handleAddFiles = useCallback(
    async (files: FileList | File[]) => {
      const fieldsData = fields.data;
      const newEntries: FileEntry[] = [];
      for (const f of Array.from(files)) {
        let headers: string[] = [];
        let sniffError: string | null = null;
        try {
          headers = (await sniffCsvHeaders(f)).headers;
        } catch (e) {
          sniffError = e instanceof Error ? e.message : String(e);
        }
        const detected = sniffError ? "unknown" : detectFileRole(headers);
        const mappingCompany =
          (detected === "companies" || detected === "combined") && fieldsData
            ? autoMap(headers, "company", fieldsData.company)
            : {};
        const mappingContact =
          (detected === "contacts" || detected === "combined") && fieldsData
            ? autoMap(headers, "contact", fieldsData.contact)
            : {};
        newEntries.push({
          id: makeId(),
          file: f,
          headers,
          role: detected,
          mappingCompany,
          mappingContact,
          matchKeyContact: "",
          sniffError,
        });
      }
      setEntries((prev) => [...prev, ...newEntries]);
    },
    [fields.data],
  );

  const updateEntry = useCallback((id: string, patch: Partial<FileEntry>) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const canGoToStep2 =
    entries.length > 0 && entries.every((e) => e.sniffError === null && e.role !== "unknown");

  const canRunPreview = useMemo(() => {
    if (!canGoToStep2) return false;
    if (!entries.some((e) => e.role === "companies" || e.role === "combined")) return false;
    for (const e of entries) {
      if (e.role === "companies" || e.role === "combined") {
        if (!Object.values(e.mappingCompany).some((v) => v && v !== "ignore")) return false;
      }
      if (e.role === "contacts" || e.role === "combined") {
        if (!Object.values(e.mappingContact).some((v) => v && v !== "ignore")) return false;
        if (!e.matchKeyContact) return false;
      }
    }
    return true;
  }, [entries, canGoToStep2]);

  const buildPayload = useCallback(
    (skipUnmatchedOverride?: boolean): ImportRunInput | null => {
      if (entries.length === 0) return null;
      const payload: ImportRunInput = {
        files: entries.map((e) => e.file),
        specs: entries.map((e) => {
          const fileRole = e.role as FileRole; // sniff-failed entries are blocked earlier
          if (fileRole === "companies") {
            return { role: fileRole, mappingCompany: e.mappingCompany };
          }
          if (fileRole === "contacts") {
            return {
              role: fileRole,
              mappingContact: e.mappingContact,
              matchKeyContact: e.matchKeyContact || null,
            };
          }
          return {
            role: "combined",
            mappingCompany: e.mappingCompany,
            mappingContact: e.mappingContact,
            matchKeyContact: e.matchKeyContact || null,
          };
        }),
      };
      if (needsContactSide) payload.matchSource = matchSource;
      if (skipUnmatchedOverride !== undefined) payload.skipUnmatched = skipUnmatchedOverride;
      if (bulkOwnerUserId) payload.bulkOwnerUserId = bulkOwnerUserId;
      return payload;
    },
    [entries, matchSource, needsContactSide, bulkOwnerUserId],
  );

  const handleRunPreview = useCallback(async () => {
    const payload = buildPayload();
    if (!payload) return;
    try {
      const result = await preview.mutateAsync(payload);
      setPreviewResult(result);
      setStep(3);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Náhled selhal.");
    }
  }, [buildPayload, preview, toast]);

  const resetWizard = useCallback(() => {
    setStep(1);
    setEntries([]);
    setMatchSource("ico");
    setBulkOwnerUserId(null);
    setPreviewResult(null);
  }, []);

  const handleCommit = useCallback(async () => {
    const payload = buildPayload(skipUnmatched);
    if (!payload) return;
    try {
      const result = await commit.mutateAsync(payload);
      toast.success(
        `Hotovo. Vytvořeno: ${result.created_company_ids.length} firem, ${result.created_contact_ids.length} kontaktů.`,
      );
      resetWizard();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import selhal.");
    }
  }, [buildPayload, commit, skipUnmatched, toast, resetWizard]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Hromadný import</h1>
          <p className="mt-0.5 text-sm text-text-tertiary">
            Nahrajte jeden nebo více CSV souborů. U každého si ověříme, co obsahuje, a vy potvrdíte
            mapování polí. Náhled si vždy zobrazíte před zápisem.
          </p>
        </div>
        <Link
          to="/app/settings"
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft size={16} strokeWidth={1.75} />
          Zpět do nastavení
        </Link>
      </div>

      <Stepper step={step} />

      {step === 1 && (
        <StepUpload
          entries={entries}
          onAddFiles={handleAddFiles}
          onUpdate={updateEntry}
          onRemove={removeEntry}
          canContinue={canGoToStep2}
          onContinue={() => setStep(2)}
        />
      )}

      {step === 2 && (
        <StepMapping
          fieldsLoading={fields.isPending}
          companyFields={fields.data?.company ?? []}
          contactFields={fields.data?.contact ?? []}
          entries={entries}
          onUpdate={updateEntry}
          needsContactSide={needsContactSide}
          matchSource={matchSource}
          setMatchSource={setMatchSource}
          bulkOwnerUserId={bulkOwnerUserId}
          setBulkOwnerUserId={setBulkOwnerUserId}
          onBack={() => setStep(1)}
          onPreview={handleRunPreview}
          isPreviewing={preview.isPending}
          canPreview={canRunPreview}
        />
      )}

      {step === 3 && previewResult && (
        <ImportPreviewReport
          result={previewResult}
          skipUnmatched={skipUnmatched}
          setSkipUnmatched={setSkipUnmatched}
          onBack={() => setStep(2)}
          onCommit={handleCommit}
          isCommitting={commit.isPending}
          onCancel={resetWizard}
        />
      )}
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const labels = ["Nahrát soubory", "Namapovat sloupce", "Náhled a potvrzení"];
  return (
    <ol className="mb-8 flex items-center gap-2 text-xs">
      {labels.map((label, idx) => {
        const n = (idx + 1) as Step;
        const isActive = step === n;
        const isDone = step > n;
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              aria-current={isActive ? "step" : undefined}
              className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold",
                isActive && "border-accent bg-accent text-white",
                isDone && "border-accent bg-accent-subtle text-accent",
                !isActive && !isDone && "border-border text-text-tertiary",
              )}
            >
              {n}
            </span>
            <span
              className={cn(
                "uppercase tracking-wide",
                isActive ? "text-text-primary" : "text-text-tertiary",
              )}
            >
              {label}
            </span>
            {idx < labels.length - 1 && (
              <span className="flex-1 border-t border-dashed border-border" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function StepUpload(props: {
  entries: FileEntry[];
  onAddFiles: (files: FileList | File[]) => Promise<void>;
  onUpdate: (id: string, patch: Partial<FileEntry>) => void;
  onRemove: (id: string) => void;
  canContinue: boolean;
  onContinue: () => void;
}) {
  return (
    <section className="space-y-6">
      <label
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border bg-surface px-4 py-10 text-sm text-text-tertiary hover:border-border-strong hover:text-text-primary"
        data-testid="import-dropzone"
      >
        <input
          type="file"
          accept=".csv,text/csv"
          multiple
          className="sr-only"
          onChange={(e) => {
            const list = e.target.files;
            if (!list || list.length === 0) return;
            void props.onAddFiles(list);
            e.target.value = ""; // allow re-selecting the same filename
          }}
          data-testid="import-files-input"
        />
        <FileText size={28} strokeWidth={1.5} aria-hidden />
        <span>Přetáhněte CSV soubory sem nebo klikněte pro výběr</span>
        <span className="text-xs">
          Můžete nahrát více souborů najednou (firmy, kontakty, případně oboje v jednom).
        </span>
      </label>

      {props.entries.length > 0 && (
        <ul className="space-y-3" data-testid="import-files-list">
          {props.entries.map((entry) => (
            <FileEntryRow
              key={entry.id}
              entry={entry}
              onUpdate={props.onUpdate}
              onRemove={props.onRemove}
            />
          ))}
        </ul>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={props.onContinue}
          disabled={!props.canContinue}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="import-continue-to-mapping"
        >
          Pokračovat
        </button>
      </div>
    </section>
  );
}

function FileEntryRow(props: {
  entry: FileEntry;
  onUpdate: (id: string, patch: Partial<FileEntry>) => void;
  onRemove: (id: string) => void;
}) {
  const { entry } = props;
  return (
    <li
      className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3 text-sm md:flex-row md:items-center md:gap-4"
      data-testid="import-file-entry"
    >
      <span className="flex flex-1 items-center gap-2 truncate">
        <FileText size={16} strokeWidth={1.75} className="shrink-0" />
        <span className="truncate font-mono">{entry.file.name}</span>
        <span className="text-xs text-text-tertiary">
          ({(entry.file.size / 1024).toFixed(1)} KB)
        </span>
      </span>
      <span className="text-xs text-text-tertiary">
        {entry.sniffError ? (
          <span className="text-danger">{entry.sniffError}</span>
        ) : (
          <>{entry.headers.length} sloupců</>
        )}
      </span>
      <label className="flex items-center gap-2 text-xs">
        <span className="text-text-tertiary">Role:</span>
        <select
          value={entry.role}
          onChange={(e) => props.onUpdate(entry.id, { role: e.target.value as DetectedRole })}
          disabled={entry.sniffError !== null}
          className="rounded-md border border-border bg-bg px-2 py-1"
          data-testid="import-file-role-select"
        >
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() => props.onRemove(entry.id)}
        aria-label="Odebrat soubor"
        className="rounded p-1 text-text-tertiary hover:text-text-primary"
      >
        <X size={16} strokeWidth={1.75} />
      </button>
    </li>
  );
}

function StepMapping(props: {
  fieldsLoading: boolean;
  companyFields: FieldDescriptor[];
  contactFields: FieldDescriptor[];
  entries: FileEntry[];
  onUpdate: (id: string, patch: Partial<FileEntry>) => void;
  needsContactSide: boolean;
  matchSource: MatchSource;
  setMatchSource: (s: MatchSource) => void;
  bulkOwnerUserId: string | null;
  setBulkOwnerUserId: (id: string | null) => void;
  onBack: () => void;
  onPreview: () => void;
  isPreviewing: boolean;
  canPreview: boolean;
}) {
  if (props.fieldsLoading) {
    return (
      <div className="flex h-32 items-center justify-center text-text-tertiary">
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }
  const hasPerRowOwner = props.entries.some((e) =>
    Object.values(e.mappingCompany).includes("owner"),
  );
  return (
    <section className="space-y-6">
      {props.entries.map((entry) => (
        <FileMapping
          key={entry.id}
          entry={entry}
          companyFields={props.companyFields}
          contactFields={props.contactFields}
          onUpdate={props.onUpdate}
        />
      ))}

      {props.needsContactSide && (
        <MatchSourcePicker matchSource={props.matchSource} setMatchSource={props.setMatchSource} />
      )}

      <BulkOwnerPicker
        bulkOwnerUserId={props.bulkOwnerUserId}
        setBulkOwnerUserId={props.setBulkOwnerUserId}
        hasPerRowOwnerMapping={hasPerRowOwner}
      />

      <div className="flex justify-between">
        <button
          type="button"
          onClick={props.onBack}
          className="rounded-md border border-border px-4 py-2 text-sm hover:bg-bg"
        >
          Zpět
        </button>
        <button
          type="button"
          onClick={props.onPreview}
          disabled={!props.canPreview || props.isPreviewing}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="import-run-preview"
        >
          {props.isPreviewing && <Loader2 className="animate-spin" size={14} />}
          Spustit náhled
        </button>
      </div>
    </section>
  );
}

function FileMapping(props: {
  entry: FileEntry;
  companyFields: FieldDescriptor[];
  contactFields: FieldDescriptor[];
  onUpdate: (id: string, patch: Partial<FileEntry>) => void;
}) {
  const { entry } = props;
  const showCompany = entry.role === "companies" || entry.role === "combined";
  const showContact = entry.role === "contacts" || entry.role === "combined";
  return (
    <details
      open
      className="rounded-md border border-border bg-surface"
      data-testid="import-file-mapping"
    >
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium">
        <FileText size={14} strokeWidth={1.75} />
        <span className="font-mono">{entry.file.name}</span>
        <span className="text-xs uppercase tracking-wide text-text-tertiary">
          · role: {entry.role}
        </span>
      </summary>
      <div className="space-y-4 border-t border-border px-4 py-4">
        {showCompany && (
          <ImportMappingTable
            title="Sloupce firem"
            headers={entry.headers}
            fields={props.companyFields}
            value={entry.mappingCompany}
            onChange={(m) => props.onUpdate(entry.id, { mappingCompany: m })}
            testIdPrefix={`import-mapping-company-${entry.id}`}
          />
        )}
        {showContact && (
          <>
            <ImportMappingTable
              title="Sloupce kontaktů"
              headers={entry.headers}
              fields={props.contactFields}
              value={entry.mappingContact}
              onChange={(m) => props.onUpdate(entry.id, { mappingContact: m })}
              testIdPrefix={`import-mapping-contact-${entry.id}`}
            />
            <label className="block text-sm">
              <span className="mb-1 block text-xs uppercase text-text-tertiary">
                Sloupec pro propojení s firmou
              </span>
              <select
                value={entry.matchKeyContact}
                onChange={(e) => props.onUpdate(entry.id, { matchKeyContact: e.target.value })}
                className="w-full rounded-md border border-border bg-bg px-2 py-1.5"
                data-testid="import-match-key-contact"
              >
                <option value="">— vyberte —</option>
                {entry.headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
    </details>
  );
}

function MatchSourcePicker(props: {
  matchSource: MatchSource;
  setMatchSource: (s: MatchSource) => void;
}) {
  return (
    <fieldset className="space-y-3 rounded-md border border-border bg-surface p-4">
      <legend className="flex items-center gap-2 px-2 text-sm font-medium">
        <ShieldAlert size={14} strokeWidth={1.75} className="text-accent" />
        Klíč pro spárování kontaktů s firmou
      </legend>
      <label className="block text-sm">
        <span className="mb-1 block text-xs uppercase text-text-tertiary">Typ klíče</span>
        <select
          value={props.matchSource}
          onChange={(e) => props.setMatchSource(e.target.value as MatchSource)}
          className="w-full rounded-md border border-border bg-bg px-2 py-1.5"
          data-testid="import-match-source"
        >
          <option value="ico">IČO</option>
          <option value="name">Název firmy</option>
          <option value="email">E-mail</option>
        </select>
      </label>
      <p className="text-xs text-text-tertiary">
        Sloupec u firem musí být zároveň namapovaný na pole „{props.matchSource}". Hodnoty se
        porovnávají napříč všemi nahranými soubory.
      </p>
    </fieldset>
  );
}

function BulkOwnerPicker(props: {
  bulkOwnerUserId: string | null;
  setBulkOwnerUserId: (id: string | null) => void;
  hasPerRowOwnerMapping: boolean;
}) {
  const usersQuery = useOrgUsers();
  const eligible = useMemo(
    () =>
      (usersQuery.data?.items ?? [])
        .filter((u) => u.is_active)
        .sort((a, b) => a.name.localeCompare(b.name, "cs")),
    [usersQuery.data],
  );
  const enabled = props.bulkOwnerUserId !== null;
  return (
    <fieldset className="space-y-3 rounded-md border border-border bg-surface p-4">
      <legend className="flex items-center gap-2 px-2 text-sm font-medium">
        <UserCheck size={14} strokeWidth={1.75} className="text-accent" />
        Přiřadit všem importovaným firmám jednoho obchodníka
      </legend>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) =>
            props.setBulkOwnerUserId(e.target.checked ? (eligible[0]?.id ?? "") : null)
          }
          data-testid="import-bulk-owner-toggle"
        />
        Aktivovat hromadné přiřazení
      </label>
      {enabled && (
        <label className="block text-sm">
          <span className="mb-1 block text-xs uppercase text-text-tertiary">Obchodník</span>
          <select
            value={props.bulkOwnerUserId ?? ""}
            onChange={(e) => props.setBulkOwnerUserId(e.target.value || null)}
            className="w-full rounded-md border border-border bg-bg px-2 py-1.5"
            data-testid="import-bulk-owner-select"
          >
            <option value="">— vyberte —</option>
            {eligible.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email})
              </option>
            ))}
          </select>
        </label>
      )}
      {props.hasPerRowOwnerMapping && enabled && (
        <p className="text-xs text-warning" role="alert">
          Sloupec „Obchodník" je v mapování zapnutý, ale hromadné přiřazení má přednost — sloupec
          bude ignorován.
        </p>
      )}
      <p className="text-xs text-text-tertiary">
        Bez aktivace zůstanou firmy buď bez vlastníka (společný pool), nebo dostanou vlastníka ze
        sloupce „Obchodník" v CSV (e-mail nebo jméno).
      </p>
    </fieldset>
  );
}
