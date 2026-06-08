import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { emptyBillingForm, type BillingFormState } from "../orgBillingForm";
import { OrgBillingFields } from "../OrgBillingFields";
import { testIds } from "@/lib/testids";
import type { RegistryLookupResult } from "@/app/companies/useLookupRegistry";

// Use vi.hoisted so the variable is accessible inside the vi.mock factory
// (Vitest hoists vi.mock calls above the module scope).
const lookupState = vi.hoisted(() => ({
  current: {
    data: undefined as RegistryLookupResult | undefined,
    isError: false,
    isPending: false,
  },
}));

vi.mock("@/auth/useAuth", () => ({ useAuth: () => ({ accessToken: "t" }) }));
vi.mock("@/app/companies/useLookupRegistry", () => ({
  useLookupRegistry: () => lookupState.current,
}));

const ARES_FIXTURE: RegistryLookupResult = {
  ico: "27082440",
  name: "Acme s.r.o.",
  dic: "CZ27082440",
  legal_form: "s.r.o.",
  address_street: "Lidická 1",
  address_city: "Brno",
  address_zip: "60200",
};

beforeEach(() => {
  // Reset to "no data" so the 3 basic tests see the idle state.
  lookupState.current = { data: undefined, isError: false, isPending: false };
});

function renderWith(value: BillingFormState, onChange = vi.fn(), savedIco = "") {
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <OrgBillingFields value={value} onChange={onChange} orgName="Acme" savedIco={savedIco} />
    </QueryClientProvider>,
  );
  return onChange;
}

describe("OrgBillingFields", () => {
  it("shows IČO field in business mode", () => {
    renderWith({ ...emptyBillingForm, kind: "business" });
    expect(screen.getByTestId(testIds.billing.ico)).toBeInTheDocument();
  });
  it("hides IČO and shows name field in individual mode", () => {
    renderWith({ ...emptyBillingForm, kind: "individual" });
    expect(screen.queryByTestId(testIds.billing.ico)).not.toBeInTheDocument();
    expect(screen.getByTestId(testIds.billing.billingName)).toBeInTheDocument();
  });
  it("switching to individual emits kind change", () => {
    const onChange = renderWith({ ...emptyBillingForm, kind: "business" });
    fireEvent.click(screen.getByTestId(testIds.billing.kindIndividual));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kind: "individual" }));
  });

  describe("ARES autofill", () => {
    it("fires onChange with ARES fields when user types a new IČO (savedIco is empty)", () => {
      // Simulate: user typed a brand-new IČO — savedIco="" means it's not stored yet.
      lookupState.current = { data: ARES_FIXTURE, isError: false, isPending: false };

      const onChange = renderWith(
        { ...emptyBillingForm, kind: "business", ico: "27082440" },
        vi.fn(),
        "", // savedIco="" → IČO is user-typed, ARES should fire
      );

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          billing_name: "Acme s.r.o.",
          dic: "CZ27082440",
          address_street: "Lidická 1",
          address_city: "Brno",
          address_zip: "60200",
        }),
      );
    });

    it("does NOT fire onChange when the IČO was hydrated from the server (savedIco matches)", () => {
      // Simulate: consumer mounted with emptyBillingForm then hydrated via
      // onChange to savedIco="27082440" — this is the hydration-clobber case.
      lookupState.current = { data: ARES_FIXTURE, isError: false, isPending: false };

      const onChange = renderWith(
        { ...emptyBillingForm, kind: "business", ico: "27082440" },
        vi.fn(),
        "27082440", // savedIco matches value.ico → treated as already-filled, ARES must NOT fire
      );

      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
