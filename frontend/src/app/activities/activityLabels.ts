import type { ActivityOut } from "@/app/activities/useActivities";
import type { components } from "@/types/api.generated";

type ActivityType = components["schemas"]["ActivityType"];

/**
 * Human-readable Czech label for every `ActivityType`. Typed as an exhaustive
 * `Record<ActivityType, string>`, so adding a new enum value fails the build
 * until it gets a label — nothing ever renders as a raw enum string.
 */
export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  note: "Poznámka",
  stage_change: "Změna fáze",
  owner_change: "Změna vlastníka",
  deal_won: "Obchod vyhrán",
  deal_lost: "Obchod neúspěšný",
  company_freed: "Firma uvolněna z poolu",
  ownership_reassigned: "Vlastnictví přeřazeno",
  subscription_change: "Změna předplatného",
  email_sent: "E-mail odeslán",
  deal_created: "Obchod vytvořen",
  deal_updated: "Obchod upraven",
  company_updated: "Firma upravena",
  event_created: "Událost přidána",
};

// Deal + company field names → Czech, for the "changed fields" detail line.
const FIELD_LABEL: Record<string, string> = {
  name: "název",
  value: "hodnota",
  currency: "měna",
  stage_id: "fáze",
  owner_user_id: "vlastník",
  primary_contact_id: "hlavní kontakt",
  expected_close_date: "očekávané uzavření",
  probability_override: "pravděpodobnost",
  lost_reason: "důvod neúspěchu",
  company_id: "firma",
  phone: "telefon",
  email: "e-mail",
  website: "web",
  note: "poznámka",
  main_contact_id: "hlavní kontakt",
  address_street: "ulice",
  address_city: "město",
  address_zip: "PSČ",
  industry: "obor",
  legal_form: "právní forma",
  dic: "DIČ",
  owner: "vlastník",
};

/**
 * Field name → Czech label for the per-field "changes" detail (finding #5).
 * Title-cased because each field starts its own line ("Název: staré → nové"),
 * unlike the inline, comma-joined legacy list in `FIELD_LABEL`.
 */
export const CHANGE_FIELD_LABEL: Record<string, string> = {
  name: "Název",
  value: "Hodnota",
  expected_close_date: "Očekávané uzavření",
  probability_override: "Pravděpodobnost",
  owner_user_id: "Vlastník",
  stage_id: "Fáze",
  primary_contact_id: "Hlavní kontakt",
  currency: "Měna",
  ico: "IČO",
  dic: "DIČ",
  email: "E-mail",
  phone: "Telefon",
  website: "Web",
  note: "Poznámka",
  industry: "Obor",
  legal_form: "Právní forma",
  address_street: "Ulice",
  address_city: "Město",
  address_zip: "PSČ",
  main_contact_id: "Hlavní kontakt",
};

export function activityLabel(activityType: ActivityType): string {
  return ACTIVITY_LABEL[activityType] ?? activityType;
}

/** Czech label for a changed field, falling back to the raw key if unknown. */
export function changeFieldLabel(field: string): string {
  return CHANGE_FIELD_LABEL[field] ?? field;
}

/**
 * A short, human detail drawn from the activity's payload (the deal name, the
 * event title, the changed fields…), or null when there's nothing extra to say.
 */
export function activityDetail(a: Pick<ActivityOut, "activity_type" | "payload">): string | null {
  const p = (a.payload ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
  const changed = (v: unknown): string | null =>
    Array.isArray(v) && v.length
      ? v.map((f) => FIELD_LABEL[String(f)] ?? String(f)).join(", ")
      : null;
  switch (a.activity_type) {
    case "stage_change": {
      // Names only — never the raw stage UUIDs the payload also carries (#6).
      const from = str(p.from_stage_name);
      const to = str(p.to_stage_name);
      if (from && to) return `Fáze: ${from} → ${to}`;
      if (to) return `Fáze: ${to}`;
      return null;
    }
    case "deal_created":
      return str(p.name);
    case "event_created":
      return str(p.title);
    case "email_sent":
      return str(p.subject);
    case "deal_lost":
      return str(p.lost_reason);
    case "deal_updated":
    case "company_updated":
      return changed(p.changed);
    default:
      return null;
  }
}
