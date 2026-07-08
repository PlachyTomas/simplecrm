import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EmailComposeModal } from "@/app/emails/EmailComposeModal";
import type { SentEmailOut } from "@/app/emails/useEmails";
import { AuthProvider } from "@/auth/AuthContext";
import { ToastProvider } from "@/lib/toast";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider initialToken="fake">
        <ToastProvider>{ui}</ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const PARENT: SentEmailOut = {
  id: "e1",
  organization_id: "o1",
  sender_user_id: null,
  deal_id: "d1",
  company_id: "c1",
  to_emails: ["jan@acme.cz"],
  cc_emails: ["sef@acme.cz"],
  bcc_emails: [],
  subject: "Nabídka",
  body: "Ahoj",
  attachment_filenames: [],
  status: "sent",
  error: null,
  message_id: "<abc@simplecrm.cz>",
  in_reply_to_message_id: null,
  thread_id: "t1",
  sent_at: null,
  created_at: "2026-07-08T10:00:00Z",
};

describe("EmailComposeModal", () => {
  it("prefills recipients and a Re: subject in reply mode", () => {
    wrap(<EmailComposeModal open onClose={vi.fn()} dealId="d1" replyTo={PARENT} />);
    expect(screen.getByRole("heading", { name: "Odpovědět" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Re: Nabídka")).toBeInTheDocument();
    // Prefilled To/CC chips.
    expect(screen.getByText("jan@acme.cz")).toBeInTheDocument();
    expect(screen.getByText("sef@acme.cz")).toBeInTheDocument();
  });

  it("disables Odeslat until there is a recipient and subject", () => {
    wrap(<EmailComposeModal open onClose={vi.fn()} dealId="d1" defaultTo={null} />);
    expect(screen.getByRole("button", { name: /Odeslat/ })).toBeDisabled();
  });

  it("enables Odeslat when a recipient is prefilled and a subject is typed", () => {
    wrap(<EmailComposeModal open onClose={vi.fn()} dealId="d1" replyTo={PARENT} />);
    // Reply mode prefills both To and subject → send is enabled.
    expect(screen.getByRole("button", { name: /Odeslat/ })).toBeEnabled();
  });
});
