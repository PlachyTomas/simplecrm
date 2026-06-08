import { describe, expect, it } from "vitest";

import {
  billingFormFromOrg,
  billingFormToPayload,
  emptyBillingForm,
  isBillingFormValid,
  type BillingFormState,
} from "../orgBillingForm";

const COMPLETE_BUSINESS: BillingFormState = {
  kind: "business",
  ico: "27082440",
  dic: "CZ27082440",
  billing_name: "Acme s.r.o.",
  legal_form: "s.r.o.",
  address_street: "Lidická 1",
  address_city: "Brno",
  address_zip: "60200",
  billing_email: "",
};

const COMPLETE_INDIVIDUAL: BillingFormState = {
  ...emptyBillingForm,
  kind: "individual",
  billing_name: "Jan Novák",
  address_street: "Lidická 1",
  address_city: "Brno",
  address_zip: "60200",
};

describe("isBillingFormValid", () => {
  it("business is valid with 8-digit IČO + full address", () => {
    expect(isBillingFormValid(COMPLETE_BUSINESS)).toBe(true);
  });
  it("business invalid without IČO", () => {
    expect(isBillingFormValid({ ...COMPLETE_BUSINESS, ico: "" })).toBe(false);
  });
  it("business invalid with short IČO", () => {
    expect(isBillingFormValid({ ...COMPLETE_BUSINESS, ico: "270" })).toBe(false);
  });
  it("individual valid with name + address (no IČO)", () => {
    expect(isBillingFormValid(COMPLETE_INDIVIDUAL)).toBe(true);
  });
  it("individual invalid without name", () => {
    expect(isBillingFormValid({ ...COMPLETE_INDIVIDUAL, billing_name: "" })).toBe(false);
  });
  it("invalid when address incomplete", () => {
    expect(isBillingFormValid({ ...COMPLETE_BUSINESS, address_zip: "" })).toBe(false);
  });
});

describe("billingFormFromOrg", () => {
  it("infers individual when no IČO but name+address present and billing_kind null", () => {
    const f = billingFormFromOrg({
      name: "Jan",
      ico: null,
      billing_kind: null,
      billing_name: "Jan Novák",
      address_street: "Lidická 1",
      address_city: "Brno",
      address_zip: "60200",
      dic: null,
      legal_form: null,
      billing_email: null,
    });
    expect(f.kind).toBe("individual");
  });
  it("uses stored billing_kind when present", () => {
    const f = billingFormFromOrg({
      name: "Acme",
      ico: null,
      billing_kind: "business",
      billing_name: null,
      address_street: null,
      address_city: null,
      address_zip: null,
      dic: null,
      legal_form: null,
      billing_email: null,
    });
    expect(f.kind).toBe("business");
  });
});

describe("billingFormToPayload", () => {
  it("individual clears ico/dic/legal_form and sets billing_kind", () => {
    const p = billingFormToPayload(COMPLETE_INDIVIDUAL);
    expect(p.billing_kind).toBe("individual");
    expect(p.ico).toBeNull();
    expect(p.dic).toBeNull();
    expect(p.legal_form).toBeNull();
    expect(p.billing_name).toBe("Jan Novák");
  });
  it("business sends ico + billing_kind business", () => {
    const p = billingFormToPayload(COMPLETE_BUSINESS);
    expect(p.billing_kind).toBe("business");
    expect(p.ico).toBe("27082440");
  });
});
