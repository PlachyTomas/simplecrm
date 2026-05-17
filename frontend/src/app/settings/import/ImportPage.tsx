/**
 * Admin CSV import wizard.
 *
 * Three-step flow on a single screen: pick mode + drop file(s), build
 * header-to-field mapping (plus match-key pair in modes B/C), run a
 * dry-run and review the diff, then confirm to commit.
 *
 * Admin-only. Non-admins land here through a stray link and see a
 * fenced message instead of the form.
 */

import { ArrowLeft, FileText, Loader2, ShieldAlert, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";

import { sniffCsvHeaders } from "@/app/settings/import/csvSniff";
import { ImportMappingTable } from "@/app/settings/import/ImportMappingTable";
import { ImportPreviewReport } from "@/app/settings/import/ImportPreviewReport";
import {
  type ImportMode,
  type ImportPreviewOut,
  type ImportRunInput,
  type MatchSource,
  useCommitImport,
  useImportFields,
  usePreviewImport,
} from "@/app/settings/import/useImport";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { useToast } from "@/lib/toast";
import { usePageTitle } from "@/lib/usePageTitle";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3;

const MODE_LABELS: { value: ImportMode; label: string; help: string }[] = [
  {
    value: "companies_only",
    label: "Pouze firmy",
    help: "Jeden CSV. Každý řádek = jedna firma.",
  },
  {
    value: "combined",
    label: "Firmy + kontakty v jednom CSV",
    help: "Jeden CSV; každý řádek = kontakt. Firemní pole se mohou opakovat.",
  },
  {
    value: "separate",
    label: "Firmy a kontakty zvlášť",
    help: "Dva CSV. Vyberete sloupec pro propojení.",
  },
];

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
  const [mode, setMode] = useState<ImportMode>("companies_only");
  const [companiesFile, setCompaniesFile] = useState<File | null>(null);
  const [contactsFile, setContactsFile] = useState<File | null>(null);
  const [companyHeaders, setCompanyHeaders] = useState<string[]>([]);
  const [contactHeaders, setContactHeaders] = useState<string[]>([]);
  const [sniffError, setSniffError] = useState<string | null>(null);

  const [mappingCompanies, setMappingCompanies] = useState<Record<string, string>>({});
  const [mappingContacts, setMappingContacts] = useState<Record<string, string>>({});
  const [matchSource, setMatchSource] = useState<MatchSource>("ico");
  const [matchKeyCompany, setMatchKeyCompany] = useState<string>("");
  const [matchKeyContact, setMatchKeyContact] = useState<string>("");
  const [skipUnmatched, setSkipUnmatched] = useState(true);

  const [previewResult, setPreviewResult] = useState<ImportPreviewOut | null>(null);

  const needsContactSide = mode !== "companies_only";

  const handleCompaniesFile = useCallback(async (file: File | null) => {
    setCompaniesFile(file);
    setSniffError(null);
    setCompanyHeaders([]);
    if (file) {
      try {
        const sniff = await sniffCsvHeaders(file);
        setCompanyHeaders(sniff.headers);
      } catch (e) {
        setSniffError(e instanceof Error ? e.message : String(e));
      }
    }
  }, []);

  const handleContactsFile = useCallback(async (file: File | null) => {
    setContactsFile(file);
    setSniffError(null);
    setContactHeaders([]);
    if (file) {
      try {
        const sniff = await sniffCsvHeaders(file);
        setContactHeaders(sniff.headers);
      } catch (e) {
        setSniffError(e instanceof Error ? e.message : String(e));
      }
    }
  }, []);

  // Combined mode shares the same file headers between sides.
  const effectiveContactHeaders = useMemo(
    () => (mode === "combined" ? companyHeaders : contactHeaders),
    [mode, companyHeaders, contactHeaders],
  );

  const buildPayload = useCallback(
    (skipUnmatchedOverride?: boolean): ImportRunInput | null => {
      if (!companiesFile) return null;
      const payload: ImportRunInput = {
        mode,
        companiesFile,
        mappingCompanies,
      };
      if (needsContactSide) {
        payload.mappingContacts = mappingContacts;
        payload.matchSource = matchSource;
        payload.matchKeyCompany = matchKeyCompany || null;
        payload.matchKeyContact = matchKeyContact || null;
      }
      if (mode === "separate") {
        if (!contactsFile) return null;
        payload.contactsFile = contactsFile;
      }
      if (skipUnmatchedOverride !== undefined) {
        payload.skipUnmatched = skipUnmatchedOverride;
      }
      return payload;
    },
    [
      companiesFile,
      contactsFile,
      mode,
      mappingCompanies,
      mappingContacts,
      matchSource,
      matchKeyCompany,
      matchKeyContact,
      needsContactSide,
    ],
  );

  const canGoToStep2 =
    !!companiesFile && (!needsContactSide || mode === "combined" || !!contactsFile);
  const canRunPreview =
    canGoToStep2 &&
    Object.values(mappingCompanies).some((v) => v && v !== "ignore") &&
    (!needsContactSide ||
      (Object.values(mappingContacts).some((v) => v && v !== "ignore") &&
        matchKeyCompany &&
        matchKeyContact));

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
    setCompaniesFile(null);
    setContactsFile(null);
    setCompanyHeaders([]);
    setContactHeaders([]);
    setMappingCompanies({});
    setMappingContacts({});
    setMatchSource("ico");
    setMatchKeyCompany("");
    setMatchKeyContact("");
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
            Nahrajte CSV s firmami a kontakty. Náhled si vždy zobrazíte před zápisem.
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
          mode={mode}
          setMode={(m) => {
            setMode(m);
            setContactsFile(null);
            setContactHeaders([]);
          }}
          companiesFile={companiesFile}
          contactsFile={contactsFile}
          onCompaniesFile={handleCompaniesFile}
          onContactsFile={handleContactsFile}
          sniffError={sniffError}
          canContinue={canGoToStep2}
          onContinue={() => setStep(2)}
        />
      )}

      {step === 2 && (
        <StepMapping
          fieldsLoading={fields.isPending}
          companyFields={fields.data?.company ?? []}
          contactFields={fields.data?.contact ?? []}
          companyHeaders={companyHeaders}
          contactHeaders={effectiveContactHeaders}
          needsContactSide={needsContactSide}
          mappingCompanies={mappingCompanies}
          setMappingCompanies={setMappingCompanies}
          mappingContacts={mappingContacts}
          setMappingContacts={setMappingContacts}
          matchSource={matchSource}
          setMatchSource={setMatchSource}
          matchKeyCompany={matchKeyCompany}
          setMatchKeyCompany={setMatchKeyCompany}
          matchKeyContact={matchKeyContact}
          setMatchKeyContact={setMatchKeyContact}
          onBack={() => setStep(1)}
          onPreview={handleRunPreview}
          isPreviewing={preview.isPending}
          canPreview={!!canRunPreview}
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
  const labels = ["Nahrát soubor", "Namapovat sloupce", "Náhled a potvrzení"];
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
  mode: ImportMode;
  setMode: (m: ImportMode) => void;
  companiesFile: File | null;
  contactsFile: File | null;
  onCompaniesFile: (f: File | null) => Promise<void>;
  onContactsFile: (f: File | null) => Promise<void>;
  sniffError: string | null;
  canContinue: boolean;
  onContinue: () => void;
}) {
  const needsTwo = props.mode === "separate";
  return (
    <section className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Režim importu</legend>
        <div className="grid gap-3 md:grid-cols-3">
          {MODE_LABELS.map((m) => {
            const active = props.mode === m.value;
            return (
              <label
                key={m.value}
                className={cn(
                  "cursor-pointer rounded-md border p-3 text-sm transition-colors",
                  active
                    ? "border-accent bg-accent-subtle"
                    : "border-border bg-surface hover:border-border-strong",
                )}
              >
                <input
                  type="radio"
                  name="import-mode"
                  value={m.value}
                  checked={active}
                  onChange={() => props.setMode(m.value)}
                  className="sr-only"
                  data-testid={`import-mode-${m.value}`}
                />
                <div className="font-medium">{m.label}</div>
                <div className="mt-1 text-xs text-text-tertiary">{m.help}</div>
              </label>
            );
          })}
        </div>
      </fieldset>

      <FileDrop
        label={needsTwo ? "Firmy (CSV)" : "Soubor CSV"}
        file={props.companiesFile}
        onChange={props.onCompaniesFile}
        testId="import-companies-file"
      />
      {needsTwo && (
        <FileDrop
          label="Kontakty (CSV)"
          file={props.contactsFile}
          onChange={props.onContactsFile}
          testId="import-contacts-file"
        />
      )}

      {props.sniffError && (
        <p role="alert" className="text-sm text-danger">
          {props.sniffError}
        </p>
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

function FileDrop(props: {
  label: string;
  file: File | null;
  onChange: (f: File | null) => Promise<void>;
  testId: string;
}) {
  return (
    <div>
      <span className="mb-1 block text-sm font-medium">{props.label}</span>
      {props.file ? (
        <div className="flex items-center justify-between rounded-md border border-border bg-surface p-3 text-sm">
          <span className="flex items-center gap-2">
            <FileText size={16} strokeWidth={1.75} />
            <span className="font-mono">{props.file.name}</span>
            <span className="text-xs text-text-tertiary">
              ({(props.file.size / 1024).toFixed(1)} KB)
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              void props.onChange(null);
            }}
            aria-label="Odebrat soubor"
            className="rounded p-1 text-text-tertiary hover:text-text-primary"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
      ) : (
        <label className="flex cursor-pointer items-center justify-center rounded-md border-2 border-dashed border-border bg-surface px-4 py-8 text-sm text-text-tertiary hover:border-border-strong hover:text-text-primary">
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              void props.onChange(file);
            }}
            data-testid={props.testId}
          />
          Vyberte CSV soubor…
        </label>
      )}
    </div>
  );
}

function StepMapping(props: {
  fieldsLoading: boolean;
  companyFields: { key: string; label: string; required: boolean }[];
  contactFields: { key: string; label: string; required: boolean }[];
  companyHeaders: string[];
  contactHeaders: string[];
  needsContactSide: boolean;
  mappingCompanies: Record<string, string>;
  setMappingCompanies: (m: Record<string, string>) => void;
  mappingContacts: Record<string, string>;
  setMappingContacts: (m: Record<string, string>) => void;
  matchSource: MatchSource;
  setMatchSource: (s: MatchSource) => void;
  matchKeyCompany: string;
  setMatchKeyCompany: (h: string) => void;
  matchKeyContact: string;
  setMatchKeyContact: (h: string) => void;
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
  return (
    <section className="space-y-6">
      <ImportMappingTable
        title="Sloupce firem"
        headers={props.companyHeaders}
        fields={props.companyFields}
        value={props.mappingCompanies}
        onChange={props.setMappingCompanies}
        testIdPrefix="import-mapping-company"
      />
      {props.needsContactSide && (
        <>
          <ImportMappingTable
            title="Sloupce kontaktů"
            headers={props.contactHeaders}
            fields={props.contactFields}
            value={props.mappingContacts}
            onChange={props.setMappingContacts}
            testIdPrefix="import-mapping-contact"
          />
          <MatchKeyPicker
            companyHeaders={props.companyHeaders}
            contactHeaders={props.contactHeaders}
            matchSource={props.matchSource}
            setMatchSource={props.setMatchSource}
            matchKeyCompany={props.matchKeyCompany}
            setMatchKeyCompany={props.setMatchKeyCompany}
            matchKeyContact={props.matchKeyContact}
            setMatchKeyContact={props.setMatchKeyContact}
          />
        </>
      )}

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

function MatchKeyPicker(props: {
  companyHeaders: string[];
  contactHeaders: string[];
  matchSource: MatchSource;
  setMatchSource: (s: MatchSource) => void;
  matchKeyCompany: string;
  setMatchKeyCompany: (h: string) => void;
  matchKeyContact: string;
  setMatchKeyContact: (h: string) => void;
}) {
  return (
    <fieldset className="space-y-3 rounded-md border border-border bg-surface p-4">
      <legend className="flex items-center gap-2 px-2 text-sm font-medium">
        <ShieldAlert size={14} strokeWidth={1.75} className="text-accent" />
        Klíč pro spárování kontaktů s firmou
      </legend>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block text-xs uppercase text-text-tertiary">Typ klíče</span>
          <select
            value={props.matchSource}
            onChange={(e) => props.setMatchSource(e.target.value as MatchSource)}
            className="w-full rounded-md border border-border bg-bg px-2 py-1.5"
          >
            <option value="ico">IČO</option>
            <option value="name">Název firmy</option>
            <option value="email">E-mail</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs uppercase text-text-tertiary">
            Sloupec ve firmách
          </span>
          <select
            value={props.matchKeyCompany}
            onChange={(e) => props.setMatchKeyCompany(e.target.value)}
            className="w-full rounded-md border border-border bg-bg px-2 py-1.5"
            data-testid="import-match-key-company"
          >
            <option value="">— vyberte —</option>
            {props.companyHeaders.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs uppercase text-text-tertiary">
            Sloupec v kontaktech
          </span>
          <select
            value={props.matchKeyContact}
            onChange={(e) => props.setMatchKeyContact(e.target.value)}
            className="w-full rounded-md border border-border bg-bg px-2 py-1.5"
            data-testid="import-match-key-contact"
          >
            <option value="">— vyberte —</option>
            {props.contactHeaders.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-text-tertiary">
        Sloupec ve firmách musí být zároveň namapovaný na pole „{props.matchSource}".
      </p>
    </fieldset>
  );
}
