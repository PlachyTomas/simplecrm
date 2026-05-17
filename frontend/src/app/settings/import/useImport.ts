/**
 * Mutations + types for the admin CSV import flow.
 *
 * The backend exposes three endpoints under /admin/imports/*. We hand-
 * type the request payloads here because they're multipart/form-data —
 * the auto-generated openapi-typescript types don't model `FormData`
 * field-by-field. The response types come from `api.generated.ts`.
 */

import { useMutation, useQuery } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";

export type ImportMode = "companies_only" | "combined" | "separate";
export type MatchSource = "ico" | "name" | "email";

export interface FieldDescriptor {
  key: string;
  label: string;
  required: boolean;
}

export interface FieldsCatalog {
  company: FieldDescriptor[];
  contact: FieldDescriptor[];
}

export interface RowError {
  row_index: number;
  side: "company" | "contact";
  field: string | null;
  code: string;
  message: string;
}

export interface UpdateDiff {
  row_index: number;
  entity_type: "company" | "contact";
  entity_id: string;
  changes: Record<string, { from: string | null; to: string | null }>;
}

export interface UnmatchedContact {
  row_index: number;
  first_name: string | null;
  last_name: string | null;
  match_key_value: string | null;
}

export interface ImportCounts {
  companies_to_create: number;
  companies_to_update: number;
  contacts_to_create: number;
  contacts_to_update: number;
  invalid_rows: number;
  unmatched_contacts: number;
}

export interface ImportPreviewOut {
  counts: ImportCounts;
  errors: RowError[];
  unmatched: UnmatchedContact[];
  update_diffs: UpdateDiff[];
  update_diffs_truncated: boolean;
}

export interface ImportCommitOut {
  counts: ImportCounts;
  errors: RowError[];
  created_company_ids: string[];
  updated_company_ids: string[];
  created_contact_ids: string[];
  updated_contact_ids: string[];
}

export interface ImportRunInput {
  mode: ImportMode;
  mappingCompanies: Record<string, string>;
  mappingContacts?: Record<string, string>;
  matchSource?: MatchSource | null;
  matchKeyCompany?: string | null;
  matchKeyContact?: string | null;
  companiesFile: File;
  contactsFile?: File | null;
  skipUnmatched?: boolean;
}

function buildFormData(payload: ImportRunInput): FormData {
  const fd = new FormData();
  fd.set("mode", payload.mode);
  fd.set("mapping_companies_json", JSON.stringify(payload.mappingCompanies));
  if (payload.mappingContacts) {
    fd.set("mapping_contacts_json", JSON.stringify(payload.mappingContacts));
  }
  if (payload.matchSource) fd.set("match_source", payload.matchSource);
  if (payload.matchKeyCompany) fd.set("match_key_company", payload.matchKeyCompany);
  if (payload.matchKeyContact) fd.set("match_key_contact", payload.matchKeyContact);
  if (payload.skipUnmatched !== undefined) {
    fd.set("skip_unmatched", payload.skipUnmatched ? "true" : "false");
  }
  fd.set("companies_file", payload.companiesFile);
  if (payload.contactsFile) fd.set("contacts_file", payload.contactsFile);
  return fd;
}

export function useImportFields() {
  const { accessToken } = useAuth();
  return useQuery<FieldsCatalog>({
    queryKey: ["admin-imports", "fields"],
    enabled: !!accessToken,
    queryFn: () => apiFetch<FieldsCatalog>("/api/v1/admin/imports/fields", { token: accessToken }),
  });
}

export function usePreviewImport() {
  const { accessToken } = useAuth();
  return useMutation<ImportPreviewOut, Error, ImportRunInput>({
    mutationFn: (payload) =>
      apiFetch<ImportPreviewOut>("/api/v1/admin/imports/preview", {
        method: "POST",
        token: accessToken,
        body: buildFormData(payload),
      }),
  });
}

export function useCommitImport() {
  const { accessToken } = useAuth();
  return useMutation<ImportCommitOut, Error, ImportRunInput>({
    mutationFn: (payload) =>
      apiFetch<ImportCommitOut>("/api/v1/admin/imports/commit", {
        method: "POST",
        token: accessToken,
        body: buildFormData(payload),
      }),
  });
}
