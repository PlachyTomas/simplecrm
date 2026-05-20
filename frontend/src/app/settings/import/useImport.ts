/**
 * Mutations + types for the admin CSV import flow (v2 multi-file).
 *
 * The wizard uploads N files in one multipart request, plus a JSON
 * array of *file specs* paralleling the files. Each spec carries the
 * file's role (companies / contacts / combined) + its per-side mapping.
 *
 * Hand-typed because multipart/form-data isn't modelled field-by-field
 * by openapi-typescript. Response types still come from `api.generated`.
 */

import { useMutation, useQuery } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";

export type MatchSource = "ico" | "name" | "email";
export type FileRole = "companies" | "contacts" | "combined";

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

/**
 * One file's spec in the parallel array. Fields are optional or
 * required depending on `role`:
 *
 *   - companies → `mappingCompany` required
 *   - contacts  → `mappingContact` + `matchKeyContact` required
 *   - combined  → `mappingCompany` + `mappingContact` (+ `matchKeyContact`) required
 */
export interface FileSpec {
  role: FileRole;
  mappingCompany?: Record<string, string>;
  mappingContact?: Record<string, string>;
  matchKeyContact?: string | null;
}

export interface ImportRunInput {
  files: File[];
  specs: FileSpec[];
  matchSource?: MatchSource | null;
  skipUnmatched?: boolean;
  bulkOwnerUserId?: string | null;
}

function buildFormData(payload: ImportRunInput): FormData {
  const fd = new FormData();
  for (const f of payload.files) {
    fd.append("files", f);
  }
  fd.set(
    "file_specs_json",
    JSON.stringify(
      payload.specs.map((s) => {
        const out: Record<string, unknown> = { role: s.role };
        if (s.mappingCompany) out.mapping_company = s.mappingCompany;
        if (s.mappingContact) out.mapping_contact = s.mappingContact;
        if (s.matchKeyContact) out.match_key_contact = s.matchKeyContact;
        return out;
      }),
    ),
  );
  if (payload.matchSource) fd.set("match_source", payload.matchSource);
  if (payload.skipUnmatched !== undefined) {
    fd.set("skip_unmatched", payload.skipUnmatched ? "true" : "false");
  }
  if (payload.bulkOwnerUserId) fd.set("bulk_owner_user_id", payload.bulkOwnerUserId);
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
