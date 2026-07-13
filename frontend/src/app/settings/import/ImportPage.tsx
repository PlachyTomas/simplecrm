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

import type { ParseKeys } from "i18next";
import { ArrowLeft, FileText, Loader2, ShieldAlert, UserCheck, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate } from "react-router-dom";

import { CsvSniffError, sniffCsvHeaders } from "@/app/settings/import/csvSniff";
import {
  autoMap,
  detectFileRole,
  type FileRole as DetectedRole,
} from "@/app/settings/import/detectFileRole";
import { ImportMappingTable } from "@/app/settings/import/ImportMappingTable";
import { ImportPreviewReport } from "@/app/settings/import/ImportPreviewReport";
import { formatNumber } from "@/lib/format";
import { useLocale } from "@/lib/i18n/useLocale";
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

const ROLE_KEYS: DetectedRole[] = ["companies", "contacts", "combined", "unknown"];

const ROLE_LABEL_KEY: Record<DetectedRole, ParseKeys<"settings">> = {
  companies: "import.roles.companies",
  contacts: "import.roles.contacts",
  combined: "import.roles.combined",
  unknown: "import.roles.unknown",
};

const SNIFF_ERROR_KEY: Record<string, ParseKeys<"settings">> = {
  missing_header_row: "import.upload.errors.missingHeaderRow",
  empty_header_row: "import.upload.errors.emptyHeaderRow",
};

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
  const { t } = useTranslation("settings");
  usePageTitle(t("import.page.pageTitle"));
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
  const { t } = useTranslation("settings");
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
  // Matching by e-mail only works against companies in the same batch — a
  // contacts-only import matches existing firms, which support company-ID/name only.
  const hasCompanySource = entries.some((e) => e.role === "companies" || e.role === "combined");
  useEffect(() => {
    if (!hasCompanySource && matchSource === "email") setMatchSource("ico");
  }, [hasCompanySource, matchSource]);

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
          sniffError =
            e instanceof CsvSniffError
              ? t(SNIFF_ERROR_KEY[e.message] ?? "import.upload.errors.generic")
              : t("import.upload.errors.generic");
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
    [fields.data, t],
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
    // A contacts-only file is allowed on its own — its rows attach to
    // firms that already exist in the DB, matched by the chosen key.
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
      toast.error(e instanceof Error ? e.message : t("import.preview.previewFailed"));
    }
  }, [buildPayload, preview, toast, t]);

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
        t("import.preview.doneToast", {
          companies: t("import.preview.createdCompanies", {
            count: result.created_company_ids.length,
          }),
          contacts: t("import.preview.createdContacts", {
            count: result.created_contact_ids.length,
          }),
        }),
      );
      resetWizard();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("import.preview.importFailed"));
    }
  }, [buildPayload, commit, skipUnmatched, toast, resetWizard, t]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("import.page.title")}</h1>
          <p className="mt-0.5 text-sm text-text-tertiary">{t("import.page.subtitle")}</p>
        </div>
        <Link
          to="/app/settings"
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft size={16} strokeWidth={1.75} />
          {t("import.page.backLink")}
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
          allowEmailKey={hasCompanySource}
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
  const { t } = useTranslation("settings");
  const labels = [
    t("import.stepper.upload"),
    t("import.stepper.mapping"),
    t("import.stepper.preview"),
  ];
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
  const { t } = useTranslation("settings");
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
        <span>{t("import.upload.dropzoneText")}</span>
        <span className="text-xs">{t("import.upload.dropzoneHint")}</span>
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
          {t("import.upload.continueButton")}
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
  const { t } = useTranslation("settings");
  const locale = useLocale();
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
          ({formatNumber(entry.file.size / 1024, locale, { maximumFractionDigits: 1 })} KB)
        </span>
      </span>
      <span className="text-xs text-text-tertiary">
        {entry.sniffError ? (
          <span className="text-danger">{entry.sniffError}</span>
        ) : (
          <>{t("import.upload.columnsCount", { count: entry.headers.length })}</>
        )}
      </span>
      <label className="flex items-center gap-2 text-xs">
        <span className="text-text-tertiary">{t("import.upload.roleLabel")}</span>
        <select
          value={entry.role}
          onChange={(e) => props.onUpdate(entry.id, { role: e.target.value as DetectedRole })}
          disabled={entry.sniffError !== null}
          className="rounded-md border border-border bg-bg px-2 py-1"
          data-testid="import-file-role-select"
        >
          {ROLE_KEYS.map((value) => (
            <option key={value} value={value}>
              {t(ROLE_LABEL_KEY[value])}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() => props.onRemove(entry.id)}
        aria-label={t("import.upload.removeAriaLabel")}
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
  allowEmailKey: boolean;
  bulkOwnerUserId: string | null;
  setBulkOwnerUserId: (id: string | null) => void;
  onBack: () => void;
  onPreview: () => void;
  isPreviewing: boolean;
  canPreview: boolean;
}) {
  const { t } = useTranslation("settings");
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
        <MatchSourcePicker
          matchSource={props.matchSource}
          setMatchSource={props.setMatchSource}
          allowEmailKey={props.allowEmailKey}
        />
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
          {t("import.mapping.backButton")}
        </button>
        <button
          type="button"
          onClick={props.onPreview}
          disabled={!props.canPreview || props.isPreviewing}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="import-run-preview"
        >
          {props.isPreviewing && <Loader2 className="animate-spin" size={14} />}
          {t("import.mapping.previewButton")}
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
  const { t } = useTranslation("settings");
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
            title={t("import.mapping.companyColumnsTitle")}
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
              title={t("import.mapping.contactColumnsTitle")}
              headers={entry.headers}
              fields={props.contactFields}
              value={entry.mappingContact}
              onChange={(m) => props.onUpdate(entry.id, { mappingContact: m })}
              testIdPrefix={`import-mapping-contact-${entry.id}`}
            />
            <label className="block text-sm">
              <span className="mb-1 block text-xs uppercase text-text-tertiary">
                {t("import.mapping.matchKeyLabel")}
              </span>
              <select
                value={entry.matchKeyContact}
                onChange={(e) => props.onUpdate(entry.id, { matchKeyContact: e.target.value })}
                className="w-full rounded-md border border-border bg-bg px-2 py-1.5"
                data-testid="import-match-key-contact"
              >
                <option value="">{t("import.mapping.matchKeyPlaceholder")}</option>
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
  allowEmailKey: boolean;
}) {
  const { t } = useTranslation("settings");
  return (
    <fieldset className="space-y-3 rounded-md border border-border bg-surface p-4">
      <legend className="flex items-center gap-2 px-2 text-sm font-medium">
        <ShieldAlert size={14} strokeWidth={1.75} className="text-accent" />
        {t("import.mapping.matchSource.legend")}
      </legend>
      <label className="block text-sm">
        <span className="mb-1 block text-xs uppercase text-text-tertiary">
          {t("import.mapping.matchSource.typeLabel")}
        </span>
        <select
          value={props.matchSource}
          onChange={(e) => props.setMatchSource(e.target.value as MatchSource)}
          className="w-full rounded-md border border-border bg-bg px-2 py-1.5"
          data-testid="import-match-source"
        >
          <option value="ico">{t("import.mapping.matchSource.ico")}</option>
          <option value="name">{t("import.mapping.matchSource.name")}</option>
          {props.allowEmailKey && (
            <option value="email">{t("import.mapping.matchSource.email")}</option>
          )}
        </select>
      </label>
      <p className="text-xs text-text-tertiary">{t("import.mapping.matchSource.hint")}</p>
    </fieldset>
  );
}

function BulkOwnerPicker(props: {
  bulkOwnerUserId: string | null;
  setBulkOwnerUserId: (id: string | null) => void;
  hasPerRowOwnerMapping: boolean;
}) {
  const { t } = useTranslation("settings");
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
        {t("import.mapping.bulkOwner.legend")}
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
        {t("import.mapping.bulkOwner.checkboxLabel")}
      </label>
      {enabled && (
        <label className="block text-sm">
          <span className="mb-1 block text-xs uppercase text-text-tertiary">
            {t("import.mapping.bulkOwner.selectLabel")}
          </span>
          <select
            value={props.bulkOwnerUserId ?? ""}
            onChange={(e) => props.setBulkOwnerUserId(e.target.value || null)}
            className="w-full rounded-md border border-border bg-bg px-2 py-1.5"
            data-testid="import-bulk-owner-select"
          >
            <option value="">{t("import.mapping.bulkOwner.selectPlaceholder")}</option>
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
          {t("import.mapping.bulkOwner.overrideWarning")}
        </p>
      )}
      <p className="text-xs text-text-tertiary">{t("import.mapping.bulkOwner.hint")}</p>
    </fieldset>
  );
}
