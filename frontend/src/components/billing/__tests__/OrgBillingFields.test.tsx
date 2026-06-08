import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { emptyBillingForm, type BillingFormState } from "../orgBillingForm";
import { OrgBillingFields } from "../OrgBillingFields";
import { testIds } from "@/lib/testids";

vi.mock("@/auth/useAuth", () => ({ useAuth: () => ({ accessToken: "t" }) }));
vi.mock("@/app/companies/useLookupRegistry", () => ({
  useLookupRegistry: () => ({ data: undefined, isError: false, isPending: false }),
}));

function renderWith(value: BillingFormState, onChange = vi.fn()) {
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <OrgBillingFields value={value} onChange={onChange} orgName="Acme" />
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
});
