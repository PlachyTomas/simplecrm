import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

import { useContacts } from "@/app/contacts/useContacts";
import { useOrgUsers } from "@/app/settings/useUsersTeams";
import { testIds } from "@/lib/testids";
import { matchesAny } from "@/lib/fold";

export interface PickedAttendee {
  kind: "contact" | "user";
  id: string;
  name: string;
}

interface AttendeeOption extends PickedAttendee {
  /** Second line in the dropdown: the company for a contact, the email for a teammate. */
  detail: string | null;
  companyId: string | null;
}

interface AttendeePickerProps {
  selected: PickedAttendee[];
  onChange: (attendees: PickedAttendee[]) => void;
  /** The modal's shared input classes. */
  inputCls: string;
  /** The event's company — its contacts sort to the top of the list. */
  companyId?: string | null;
}

/**
 * Who is coming: teammates and contacts in one chips picker, modeled on
 * `LabelPicker`. Both kinds are fetched as a page and filtered in the browser
 * (neither endpoint searches server-side), and the picked set is split back
 * into `attendee_user_ids` / `attendee_contact_ids` by the form.
 */
export function AttendeePicker({ selected, onChange, inputCls, companyId }: AttendeePickerProps) {
  const { t } = useTranslation("deals");
  const inputId = useId();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const users = useOrgUsers();
  const contacts = useContacts({ limit: 100 });

  const trimmed = query.trim();
  const selectedIds = new Set(selected.map((attendee) => attendee.id));
  const loading = users.isPending || contacts.isPending;
  const failed = users.isError || contacts.isError;

  const options: AttendeeOption[] = [
    ...(users.data?.items ?? [])
      .filter((user) => user.is_active)
      .map((user) => ({
        kind: "user" as const,
        id: user.id,
        name: user.name,
        detail: user.email,
        companyId: null,
      })),
    ...(contacts.data?.items ?? []).map((contact) => ({
      kind: "contact" as const,
      id: contact.id,
      name: `${contact.first_name} ${contact.last_name}`.trim(),
      detail: contact.company_name ?? contact.email ?? null,
      companyId: contact.company_id ?? null,
    })),
  ];
  const matches = options
    .filter((option) => !selectedIds.has(option.id))
    .filter((option) => matchesAny([option.name, option.detail], trimmed))
    .sort((a, b) => rank(a, companyId) - rank(b, companyId))
    .slice(0, 25);

  function pick(option: AttendeeOption) {
    onChange([...selected, { kind: option.kind, id: option.id, name: option.name }]);
    setQuery("");
  }

  function remove(attendeeId: string) {
    onChange(selected.filter((attendee) => attendee.id !== attendeeId));
  }

  const showList = open && (matches.length > 0 || loading || (!!trimmed && !failed));

  return (
    <div className="text-sm">
      <label htmlFor={inputId} className="mb-1 block text-text-secondary">
        {t("eventFormModal.attendees.label")}
      </label>
      {selected.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((attendee) => (
            <li key={attendee.id}>
              <span
                data-testid={testIds.events.attendeePicker.chip(attendee.id)}
                className="inline-flex items-center gap-1 rounded-full bg-surface-overlay px-2 py-0.5 text-xs font-medium text-text-secondary"
              >
                {attendee.name}
                <button
                  type="button"
                  onClick={() => remove(attendee.id)}
                  data-testid={testIds.events.attendeePicker.remove(attendee.id)}
                  aria-label={t("eventFormModal.attendees.remove", { name: attendee.name })}
                  className="opacity-70 transition-opacity duration-fast hover:opacity-100"
                >
                  <X size={12} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="relative">
        <input
          id={inputId}
          type="text"
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          data-testid={testIds.events.attendeePicker.input}
          value={query}
          maxLength={100}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              // The picker's Enter belongs to the picker, not the form.
              e.preventDefault();
              const first = matches[0];
              if (first) pick(first);
            } else if (e.key === "Escape" && open) {
              e.stopPropagation();
              setOpen(false);
            }
          }}
          placeholder={t("eventFormModal.attendees.placeholder")}
          className={inputCls}
        />
        {showList ? (
          <div
            id={listId}
            role="listbox"
            aria-label={t("eventFormModal.attendees.label")}
            className="absolute left-0 right-0 z-10 mt-1 max-h-40 overflow-y-auto rounded-md border border-border bg-surface-elevated py-1 shadow-md"
          >
            {matches.map((option) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={false}
                data-testid={testIds.events.attendeePicker.option(option.id)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(option)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-text-secondary transition-colors duration-fast hover:bg-surface-overlay hover:text-text-primary"
              >
                <span className="truncate">{option.name}</span>
                {option.detail ? (
                  <span className="truncate text-xs text-text-tertiary">{option.detail}</span>
                ) : null}
                <span className="ml-auto shrink-0 text-xs text-text-tertiary">
                  {option.kind === "user"
                    ? t("eventFormModal.attendees.kindUser")
                    : t("eventFormModal.attendees.kindContact")}
                </span>
              </button>
            ))}
            {matches.length === 0 ? (
              <p className="px-3 py-1.5 text-xs text-text-tertiary" role="status">
                {loading
                  ? t("eventFormModal.attendees.loading")
                  : t("eventFormModal.attendees.noMatch")}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      {failed ? (
        <p className="mt-1 text-xs text-danger" role="alert">
          {t("eventFormModal.attendees.loadError")}
        </p>
      ) : (
        <p className="mt-1 text-xs text-text-tertiary">{t("eventFormModal.attendees.hint")}</p>
      )}
    </div>
  );
}

function rank(option: AttendeeOption, companyId: string | null | undefined): number {
  return companyId && option.companyId === companyId ? 0 : 1;
}
