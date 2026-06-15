import { ChevronDown, ChevronRight, Mail, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  type BulkEmailFilters,
  type CampaignOut,
  type RecipientCandidate,
  useResolveRecipients,
  useSendBulkEmail,
} from "@/app/companies/bulk-email/useBulkEmail";
import { useOrgUsers } from "@/app/settings/useUsersTeams";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface EmailOption {
  email: string;
  label: string;
  contactId: string | null;
}

/** Build the selectable address list for a company: its default address
 * first (a contact's name when it maps to one, else "Firemní e-mail"), then
 * any remaining contacts that have an email. */
function emailOptions(c: RecipientCandidate): EmailOption[] {
  const out: EmailOption[] = [];
  const seen = new Set<string>();
  const contactByEmail = new Map<string, RecipientCandidate["contacts"][number]>();
  for (const ct of c.contacts) {
    if (ct.email) contactByEmail.set(ct.email.toLowerCase(), ct);
  }
  if (c.default_email) {
    const ct = contactByEmail.get(c.default_email.toLowerCase());
    out.push({
      email: c.default_email,
      label: ct ? `${ct.first_name} ${ct.last_name}` : "Firemní e-mail",
      contactId: ct?.id ?? null,
    });
    seen.add(c.default_email.toLowerCase());
  }
  for (const ct of c.contacts) {
    if (ct.email && !seen.has(ct.email.toLowerCase())) {
      out.push({ email: ct.email, label: `${ct.first_name} ${ct.last_name}`, contactId: ct.id });
      seen.add(ct.email.toLowerCase());
    }
  }
  return out;
}

const inputClass =
  "mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none";

const SKIP_LABELS: Record<string, string> = {
  no_email: "bez e-mailu",
  blocked: "na blocklistu",
};

export function BulkEmailWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();
  const { data: usersPage } = useOrgUsers();
  const resolve = useResolveRecipients();
  const send = useSendBulkEmail();

  const isManagerOrAdmin = user?.role === "admin" || user?.role === "manager";

  const [step, setStep] = useState(1);
  const [filters, setFilters] = useState<BulkEmailFilters>({});
  const [candidates, setCandidates] = useState<RecipientCandidate[] | null>(null);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [createDeals, setCreateDeals] = useState(false);
  const [dealTitle, setDealTitle] = useState("");
  const [result, setResult] = useState<CampaignOut | null>(null);

  // Reset everything whenever the modal is (re)opened.
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setFilters({});
    setCandidates(null);
    setSelected({});
    setExpanded(new Set());
    setSubject("");
    setBody("");
    setAttachment(null);
    setCreateDeals(false);
    setDealTitle("");
    setResult(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const totalSelected = useMemo(
    () => Object.values(selected).reduce((n, emails) => n + emails.length, 0),
    [selected],
  );

  if (!open) return null;

  const runResolve = () => {
    const payload: BulkEmailFilters = {
      industry: filters.industry?.trim() || null,
      owner_user_id: filters.owner_user_id ?? null,
      has_won_deal: filters.has_won_deal ?? null,
      no_order_since_days: filters.no_order_since_days ?? null,
    };
    resolve.mutate(payload, {
      onSuccess: (cands) => {
        setCandidates(cands);
        const initial: Record<string, string[]> = {};
        for (const c of cands) {
          if (c.emailable && c.default_email) initial[c.company_id] = [c.default_email];
        }
        setSelected(initial);
        setStep(2);
      },
      onError: () => toast.error("Načtení firem se nezdařilo, zkuste to prosím znovu."),
    });
  };

  const toggleEmail = (companyId: string, email: string) => {
    setSelected((prev) => {
      const current = prev[companyId] ?? [];
      const next = current.includes(email)
        ? current.filter((e) => e !== email)
        : [...current, email];
      return { ...prev, [companyId]: next };
    });
  };

  const toggleExpand = (companyId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(companyId)) next.delete(companyId);
      else next.add(companyId);
      return next;
    });
  };

  const doSend = () => {
    const candidateById = new Map((candidates ?? []).map((c) => [c.company_id, c]));
    const recipients = Object.entries(selected)
      .filter(([, emails]) => emails.length > 0)
      .map(([companyId, emails]) => {
        const cand = candidateById.get(companyId);
        const opts = cand ? emailOptions(cand) : [];
        const firstContact = opts.find((o) => o.email === emails[0])?.contactId ?? null;
        return { company_id: companyId, emails, contact_id: firstContact };
      });

    send.mutate(
      {
        payload: {
          subject: subject.trim(),
          body,
          recipients,
          create_deals: createDeals,
          deal_title: createDeals ? dealTitle.trim() || null : null,
        },
        attachment,
      },
      {
        onSuccess: (campaign) => setResult(campaign),
        onError: (err) =>
          toast.error(
            err instanceof ApiError && err.status === 422
              ? "Odeslání odmítnuto — zkontrolujte nastavení SMTP a příjemce."
              : "Odeslání se nezdařilo, zkuste to prosím znovu.",
          ),
      },
    );
  };

  const emailableCount = (candidates ?? []).filter((c) => c.emailable).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-email-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 px-0 backdrop-blur-sm md:items-center md:px-4"
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-xl md:rounded-2xl">
        <header className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
          <div className="flex items-center gap-2">
            <Mail size={18} strokeWidth={1.75} className="text-accent" />
            <h2 id="bulk-email-title" className="text-base font-semibold text-text-primary">
              Hromadný e-mail
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zavřít"
            className="rounded-md p-1 text-text-tertiary hover:bg-surface-overlay hover:text-text-primary"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>

        {result ? (
          <SendResult
            result={result}
            onClose={onClose}
            onHistory={() => navigate("/app/email-campaigns")}
          />
        ) : (
          <>
            <div className="border-b border-border-subtle px-5 py-2">
              <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-tertiary">
                {["Filtr", "Příjemci", "Text", "Odeslání"].map((label, i) => (
                  <li
                    key={label}
                    className={cn(
                      "font-medium",
                      step === i + 1 ? "text-accent" : step > i + 1 ? "text-text-secondary" : "",
                    )}
                  >
                    {i + 1}. {label}
                  </li>
                ))}
              </ol>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {step === 1 ? (
                <div className="space-y-3">
                  <p className="text-sm text-text-secondary">
                    Vyfiltrujte firmy ze svého portfolia, kterým chcete e-mail poslat.
                  </p>
                  <label className="block">
                    <span className="text-xs font-medium text-text-secondary">Obor</span>
                    <input
                      className={inputClass}
                      value={filters.industry ?? ""}
                      onChange={(e) => setFilters((f) => ({ ...f, industry: e.target.value }))}
                      placeholder="např. IT, Stavebnictví…"
                    />
                  </label>
                  {isManagerOrAdmin ? (
                    <label className="block">
                      <span className="text-xs font-medium text-text-secondary">Vlastník</span>
                      <select
                        className={inputClass}
                        value={filters.owner_user_id ?? ""}
                        onChange={(e) =>
                          setFilters((f) => ({ ...f, owner_user_id: e.target.value || null }))
                        }
                      >
                        <option value="">Všichni vlastníci</option>
                        {(usersPage?.items ?? []).map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label className="flex items-center gap-2 text-sm text-text-secondary">
                    <input
                      type="checkbox"
                      checked={filters.has_won_deal ?? false}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, has_won_deal: e.target.checked || null }))
                      }
                    />
                    Pouze firmy s vyhraným obchodem
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-text-secondary">
                      Bez objednávky déle než (dní)
                    </span>
                    <input
                      className={inputClass}
                      type="number"
                      min={1}
                      value={filters.no_order_since_days ?? ""}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          no_order_since_days: e.target.value ? Number(e.target.value) : null,
                        }))
                      }
                      placeholder="např. 90"
                    />
                  </label>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="space-y-2">
                  {candidates && candidates.length === 0 ? (
                    <p className="py-8 text-center text-sm text-text-tertiary">
                      Žádné firmy neodpovídají filtru.
                    </p>
                  ) : null}
                  {(candidates ?? []).map((c) => {
                    const opts = emailOptions(c);
                    const chosen = selected[c.company_id] ?? [];
                    return (
                      <div
                        key={c.company_id}
                        className={cn(
                          "rounded-md border px-3 py-2",
                          c.emailable
                            ? "border-border bg-surface"
                            : "border-border-subtle bg-surface-overlay opacity-70",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-text-primary">
                              {c.company_name}
                            </p>
                            {c.emailable ? (
                              <p className="text-xs text-text-tertiary">
                                {chosen.length} {chosen.length === 1 ? "adresa" : "adres"} vybráno
                              </p>
                            ) : (
                              <p className="text-xs text-warning">
                                Přeskočeno — {SKIP_LABELS[c.skip_reason ?? ""] ?? c.skip_reason}
                              </p>
                            )}
                          </div>
                          {c.emailable && opts.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => toggleExpand(c.company_id)}
                              className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent-hover"
                            >
                              {expanded.has(c.company_id) ? (
                                <ChevronDown size={14} />
                              ) : (
                                <ChevronRight size={14} />
                              )}
                              Příjemci
                            </button>
                          ) : null}
                        </div>
                        {c.emailable && expanded.has(c.company_id) ? (
                          <div className="mt-2 space-y-1 border-t border-border-subtle pt-2">
                            {opts.map((o) => (
                              <label
                                key={o.email}
                                className="flex items-center gap-2 text-sm text-text-secondary"
                              >
                                <input
                                  type="checkbox"
                                  checked={chosen.includes(o.email)}
                                  onChange={() => toggleEmail(c.company_id, o.email)}
                                />
                                <span className="font-medium text-text-primary">{o.label}</span>
                                <span className="truncate text-text-tertiary">{o.email}</span>
                              </label>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {step === 3 ? (
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-xs font-medium text-text-secondary">Předmět</span>
                    <input
                      className={inputClass}
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Nová nabídka pro {firma}"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-text-secondary">Text e-mailu</span>
                    <textarea
                      className={cn(inputClass, "min-h-[160px] resize-y")}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder={"Dobrý den {kontakt},\n\nrádi bychom Vám představili…"}
                    />
                  </label>
                  <p className="text-xs text-text-tertiary">
                    Použijte zástupné výrazy{" "}
                    <code className="rounded bg-surface-overlay px-1">{"{firma}"}</code>,{" "}
                    <code className="rounded bg-surface-overlay px-1">{"{kontakt}"}</code>,{" "}
                    <code className="rounded bg-surface-overlay px-1">{"{vlastnik}"}</code> — doplní
                    se u každého příjemce.
                  </p>
                  <label className="block">
                    <span className="text-xs font-medium text-text-secondary">
                      Příloha (volitelné)
                    </span>
                    <input
                      type="file"
                      className="mt-1 block w-full text-sm text-text-secondary file:mr-3 file:rounded-md file:border-0 file:bg-surface-overlay file:px-3 file:py-1.5 file:text-sm file:text-text-secondary"
                      onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>
              ) : null}

              {step === 4 ? (
                <div className="space-y-3">
                  <p className="text-sm text-text-secondary">
                    E-mail bude odeslán <strong>{totalSelected}</strong> příjemcům z vaší vlastní
                    schránky.
                  </p>
                  <label className="flex items-center gap-2 text-sm text-text-secondary">
                    <input
                      type="checkbox"
                      checked={createDeals}
                      onChange={(e) => setCreateDeals(e.target.checked)}
                    />
                    Vytvořit obchod v pipeline pro každou oslovenou firmu
                  </label>
                  {createDeals ? (
                    <label className="block">
                      <span className="text-xs font-medium text-text-secondary">Název obchodu</span>
                      <input
                        className={inputClass}
                        value={dealTitle}
                        onChange={(e) => setDealTitle(e.target.value)}
                        placeholder={subject || "Předmět e-mailu"}
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}
            </div>

            <footer className="flex items-center justify-between gap-2 border-t border-border-subtle px-5 py-4">
              <button
                type="button"
                onClick={() => (step === 1 ? onClose() : setStep((s) => s - 1))}
                className="h-9 rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary hover:text-text-primary"
              >
                {step === 1 ? "Zrušit" : "Zpět"}
              </button>

              {step === 1 ? (
                <button
                  type="button"
                  onClick={runResolve}
                  disabled={resolve.isPending}
                  className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-text-on-accent hover:opacity-90 disabled:opacity-60"
                >
                  {resolve.isPending ? "Načítání…" : "Najít firmy"}
                </button>
              ) : step === 2 ? (
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  disabled={totalSelected === 0}
                  className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-text-on-accent hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Další ({totalSelected})
                </button>
              ) : step === 3 ? (
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  disabled={!subject.trim() || !body.trim()}
                  className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-text-on-accent hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Další
                </button>
              ) : (
                <button
                  type="button"
                  onClick={doSend}
                  disabled={send.isPending || totalSelected === 0}
                  className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-text-on-accent hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {send.isPending ? "Odesílání…" : `Odeslat (${totalSelected})`}
                </button>
              )}
            </footer>
            {step === 2 && emailableCount === 0 && candidates ? (
              <p className="px-5 pb-3 text-xs text-text-tertiary">
                Žádná firma nemá použitelnou e-mailovou adresu.
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function SendResult({
  result,
  onClose,
  onHistory,
}: {
  result: CampaignOut;
  onClose: () => void;
  onHistory: () => void;
}) {
  return (
    <div className="px-5 py-6">
      <p className="text-sm font-medium text-text-primary">Hotovo — e-maily byly zpracovány.</p>
      <ul className="mt-3 space-y-1 text-sm">
        <li className="text-success">Odesláno: {result.sent_count}</li>
        <li className="text-danger">Selhalo: {result.failed_count}</li>
        <li className="text-text-tertiary">Přeskočeno: {result.skipped_count}</li>
      </ul>
      <p className="mt-3 text-xs text-text-tertiary">
        „Odesláno" znamená, že váš poštovní server zprávu přijal. Doručení do schránky najdete v
        historii.
      </p>
      <div className="mt-5 flex items-center gap-2">
        <button
          type="button"
          onClick={onHistory}
          className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-text-on-accent hover:opacity-90"
        >
          Zobrazit historii
        </button>
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary hover:text-text-primary"
        >
          Zavřít
        </button>
      </div>
    </div>
  );
}
