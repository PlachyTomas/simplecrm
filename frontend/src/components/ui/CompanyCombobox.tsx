import { useEffect, useState } from "react";

import { useCompanies } from "@/app/companies/useCompanies";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

interface CompanyComboboxProps {
  value: string;
  onChange: (companyId: string, companyName?: string) => void;
  /** Optional initial display name when `value` is pre-populated. */
  initialDisplayName?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** id used to wire a label's htmlFor at the call site. */
  inputId?: string;
}

export function CompanyCombobox({
  value,
  onChange,
  initialDisplayName,
  required = false,
  disabled = false,
  placeholder = "Začněte psát název firmy…",
  inputId,
}: CompanyComboboxProps) {
  const [search, setSearch] = useState(initialDisplayName ?? "");
  const debouncedSearch = useDebouncedValue(search, 250);
  const { data: companiesPage } = useCompanies({ limit: 25, search: debouncedSearch });
  const companies = companiesPage?.items ?? [];

  // If the parent clears the value externally, blank our input too.
  useEffect(() => {
    if (!value && !initialDisplayName) setSearch("");
  }, [value, initialDisplayName]);

  return (
    <div>
      <input
        id={inputId}
        type="text"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          if (value) onChange("", undefined);
        }}
        placeholder={placeholder}
        autoComplete="off"
        disabled={disabled}
        required={required && !value}
        className="block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none disabled:opacity-60"
      />
      {search && !value && companies.length > 0 ? (
        <ul className="mt-2 max-h-40 overflow-y-auto rounded-md border border-border bg-surface">
          {companies.map((company) => (
            <li key={company.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(company.id, company.name);
                  setSearch(company.name);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-text-primary transition-colors duration-fast hover:bg-surface-overlay"
              >
                <span className="truncate">{company.name}</span>
                {company.ico ? (
                  <span className="ml-2 font-mono text-xs text-text-tertiary">{company.ico}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {search && !value && companies.length === 0 ? (
        <p className="mt-2 text-xs text-text-tertiary">Žádná firma neodpovídá hledání.</p>
      ) : null}
    </div>
  );
}
