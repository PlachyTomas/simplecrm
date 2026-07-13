import type { ParseKeys } from "i18next";

import type { ActivityOut } from "@/app/activities/useActivities";
import type { components } from "@/types/api.generated";

type ActivityType = components["schemas"]["ActivityType"];
type CommonKey = ParseKeys<"common">;

/**
 * Catalog key for every `ActivityType`. Typed as an exhaustive
 * `Record<ActivityType, CommonKey>`, so adding a new enum value fails the
 * build until it gets a label — nothing ever renders as a raw enum string.
 */
export const ACTIVITY_LABEL_KEY: Record<ActivityType, CommonKey> = {
  note: "activities.types.note",
  stage_change: "activities.types.stage_change",
  owner_change: "activities.types.owner_change",
  deal_won: "activities.types.deal_won",
  deal_lost: "activities.types.deal_lost",
  company_freed: "activities.types.company_freed",
  ownership_reassigned: "activities.types.ownership_reassigned",
  subscription_change: "activities.types.subscription_change",
  email_sent: "activities.types.email_sent",
  deal_created: "activities.types.deal_created",
  deal_updated: "activities.types.deal_updated",
  company_updated: "activities.types.company_updated",
  event_created: "activities.types.event_created",
};

// Deal + company field names -> catalog key, for the inline "changed
// fields" detail list (comma-joined, lower case).
const FIELD_LABEL_KEY: Record<string, CommonKey> = {
  name: "activities.fields.name",
  value: "activities.fields.value",
  currency: "activities.fields.currency",
  stage_id: "activities.fields.stage_id",
  owner_user_id: "activities.fields.owner_user_id",
  primary_contact_id: "activities.fields.primary_contact_id",
  expected_close_date: "activities.fields.expected_close_date",
  probability_override: "activities.fields.probability_override",
  lost_reason: "activities.fields.lost_reason",
  company_id: "activities.fields.company_id",
  phone: "activities.fields.phone",
  email: "activities.fields.email",
  website: "activities.fields.website",
  note: "activities.fields.note",
  main_contact_id: "activities.fields.main_contact_id",
  address_street: "activities.fields.address_street",
  address_city: "activities.fields.address_city",
  address_zip: "activities.fields.address_zip",
  industry: "activities.fields.industry",
  legal_form: "activities.fields.legal_form",
  dic: "activities.fields.dic",
  owner: "activities.fields.owner",
};

/**
 * Field name -> catalog key for the per-field "changes" detail (finding
 * #5). Title-cased in copy because each field starts its own line
 * ("Name: old -> new"), unlike the inline, comma-joined legacy list keyed
 * by `FIELD_LABEL_KEY`.
 */
export const CHANGE_FIELD_LABEL_KEY: Record<string, CommonKey> = {
  name: "activities.changeFields.name",
  value: "activities.changeFields.value",
  expected_close_date: "activities.changeFields.expected_close_date",
  probability_override: "activities.changeFields.probability_override",
  owner_user_id: "activities.changeFields.owner_user_id",
  stage_id: "activities.changeFields.stage_id",
  primary_contact_id: "activities.changeFields.primary_contact_id",
  currency: "activities.changeFields.currency",
  ico: "activities.changeFields.ico",
  dic: "activities.changeFields.dic",
  email: "activities.changeFields.email",
  phone: "activities.changeFields.phone",
  website: "activities.changeFields.website",
  note: "activities.changeFields.note",
  industry: "activities.changeFields.industry",
  legal_form: "activities.changeFields.legal_form",
  address_street: "activities.changeFields.address_street",
  address_city: "activities.changeFields.address_city",
  address_zip: "activities.changeFields.address_zip",
  main_contact_id: "activities.changeFields.main_contact_id",
};

/** Catalog key for a changed field, falling back to `null` if unknown (caller shows the raw key). */
export function changeFieldLabelKey(field: string): CommonKey | null {
  return CHANGE_FIELD_LABEL_KEY[field] ?? null;
}

/** Catalog key for a field in the comma-joined legacy list, falling back to `null` if unknown. */
export function fieldLabelKey(field: string): CommonKey | null {
  return FIELD_LABEL_KEY[field] ?? null;
}

/**
 * Structured detail drawn from the activity's payload (the deal name, the
 * event title, the changed fields…) for the rendering component to turn
 * into text. `null` when there's nothing extra to say. Kept key/data-only
 * (no translated strings) since this module has no `t()` of its own — the
 * component translates.
 */
export type ActivityDetailValue =
  | { kind: "text"; value: string }
  | { kind: "stageChangeFromTo"; from: string; to: string }
  | { kind: "stageChangeTo"; to: string }
  | { kind: "fieldsChanged"; fields: string[] };

export function activityDetail(
  a: Pick<ActivityOut, "activity_type" | "payload">,
): ActivityDetailValue | null {
  const p = (a.payload ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
  switch (a.activity_type) {
    case "stage_change": {
      // Names only — never the raw stage UUIDs the payload also carries (#6).
      const from = str(p.from_stage_name);
      const to = str(p.to_stage_name);
      if (from && to) return { kind: "stageChangeFromTo", from, to };
      if (to) return { kind: "stageChangeTo", to };
      return null;
    }
    case "deal_created": {
      const name = str(p.name);
      return name ? { kind: "text", value: name } : null;
    }
    case "event_created": {
      const title = str(p.title);
      return title ? { kind: "text", value: title } : null;
    }
    case "email_sent": {
      const subject = str(p.subject);
      return subject ? { kind: "text", value: subject } : null;
    }
    case "deal_lost": {
      const reason = str(p.lost_reason);
      return reason ? { kind: "text", value: reason } : null;
    }
    case "deal_updated":
    case "company_updated": {
      const changed = p.changed;
      return Array.isArray(changed) && changed.length
        ? { kind: "fieldsChanged", fields: changed.map(String) }
        : null;
    }
    default:
      return null;
  }
}
