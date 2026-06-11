import type { components } from "@/types/api.generated";

type OrganizationOut = components["schemas"]["OrganizationOut"];

export type BillingKind = "business" | "individual";

export interface BillingFormState {
  kind: BillingKind;
  ico: string;
  dic: string;
  billing_name: string;
  legal_form: string;
  address_street: string;
  address_city: string;
  address_zip: string;
  billing_email: string;
}

export const emptyBillingForm: BillingFormState = {
  kind: "business",
  ico: "",
  dic: "",
  billing_name: "",
  legal_form: "",
  address_street: "",
  address_city: "",
  address_zip: "",
  billing_email: "",
};

/** Minimal org shape the form needs — accepts the full OrganizationOut. */
type OrgBillingSource = Pick<
  OrganizationOut,
  | "name"
  | "ico"
  | "billing_kind"
  | "billing_name"
  | "dic"
  | "legal_form"
  | "address_street"
  | "address_city"
  | "address_zip"
  | "billing_email"
>;

export function billingFormFromOrg(org: OrgBillingSource): BillingFormState {
  const inferred: BillingKind =
    org.billing_kind === "individual" || org.billing_kind === "business"
      ? org.billing_kind
      : !org.ico && !!org.billing_name && !!org.address_street
        ? "individual"
        : "business";
  return {
    kind: inferred,
    ico: org.ico ?? "",
    dic: org.dic ?? "",
    billing_name: org.billing_name ?? "",
    legal_form: org.legal_form ?? "",
    address_street: org.address_street ?? "",
    address_city: org.address_city ?? "",
    address_zip: org.address_zip ?? "",
    billing_email: org.billing_email ?? "",
  };
}

function addressComplete(s: BillingFormState): boolean {
  return (
    s.address_street.trim() !== "" && s.address_city.trim() !== "" && s.address_zip.trim() !== ""
  );
}

export function isBillingFormValid(s: BillingFormState): boolean {
  if (!addressComplete(s)) return false;
  if (s.kind === "individual") return s.billing_name.trim() !== "";
  return /^\d{8}$/.test(s.ico.trim());
}

/** Body for PUT /organizations/current. Individuals clear company-only
 *  fields so the saved row is internally consistent. */
export function billingFormToPayload(
  s: BillingFormState,
): components["schemas"]["OrganizationUpdate"] {
  const isIndividual = s.kind === "individual";
  return {
    billing_kind: s.kind,
    ico: isIndividual ? null : s.ico.trim() || null,
    dic: isIndividual ? null : s.dic.trim() || null,
    legal_form: isIndividual ? null : s.legal_form.trim() || null,
    billing_name: s.billing_name.trim() || null,
    address_street: s.address_street.trim() || null,
    address_city: s.address_city.trim() || null,
    address_zip: s.address_zip.trim() || null,
    billing_email: s.billing_email.trim() || null,
  };
}
