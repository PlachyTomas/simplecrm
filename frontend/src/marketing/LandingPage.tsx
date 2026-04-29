import {
  Building2,
  Check,
  ChevronDown,
  Database,
  Mail,
  Menu,
  MousePointerClick,
  RefreshCw,
  Scissors,
  Sparkles,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

import { API_BASE_URL } from "@/lib/api";
import { ThemeToggle } from "@/lib/ThemeToggle";
import { cn } from "@/lib/utils";

const GOOGLE_LOGIN_URL = `${API_BASE_URL}/api/v1/auth/google/login`;
const PRICE_PER_USER_CZK = 99;

const NAV_LINKS: { href: string; label: string }[] = [
  { href: "#funkce", label: "Funkce" },
  { href: "#cenik", label: "Ceník" },
  { href: "#faq", label: "FAQ" },
];

function Nav() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close on Escape; lock body scroll while open.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

  return (
    <header className="bg-bg/90 sticky top-0 z-30 border-b border-border-subtle backdrop-blur">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-4 py-4 md:gap-8 md:px-8">
        <Link to="/" className="flex items-center gap-2" aria-label="SimpleCRM">
          <span
            aria-hidden
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-highlight text-text-on-accent"
          >
            <Sparkles size={18} strokeWidth={1.75} />
          </span>
          <span className="text-lg font-semibold">SimpleCRM</span>
        </Link>
        <nav aria-label="Hlavní" className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-text-secondary hover:text-text-primary"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <ThemeToggle variant="compact" className="hidden md:inline-flex" />
          <Link
            to="/login"
            className="hidden h-10 items-center justify-center rounded-md px-4 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-overlay hover:text-text-primary md:inline-flex"
          >
            Přihlásit se
          </Link>
          <a
            href={GOOGLE_LOGIN_URL}
            className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover sm:px-5"
          >
            Vyzkoušet zdarma
          </a>
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Otevřít menu"
            aria-expanded={drawerOpen}
            aria-controls="landing-mobile-drawer"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface text-text-secondary transition-colors duration-fast hover:text-text-primary md:hidden"
          >
            <Menu size={20} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {drawerOpen ? (
        <MobileDrawer onClose={() => setDrawerOpen(false)} triggerRef={triggerRef} />
      ) : null}
    </header>
  );
}

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function MobileDrawer({
  onClose,
  triggerRef,
}: {
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Move focus into the drawer on open; restore to the trigger on close.
  useEffect(() => {
    closeButtonRef.current?.focus();
    const trigger = triggerRef.current;
    return () => {
      // Only restore if the trigger is still in the document and focusable.
      // Link/anchor clicks inside the drawer navigate away — focus restore
      // is a no-op there, which is fine.
      trigger?.focus();
    };
  }, [triggerRef]);

  // Trap Tab/Shift+Tab inside the dialog.
  useEffect(() => {
    const node = dialogRef.current;
    if (!node) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusables = node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !node.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    node.addEventListener("keydown", onKey);
    return () => node.removeEventListener("keydown", onKey);
  }, []);

  // Portaled to body so the drawer escapes the sticky header's
  // backdrop-filter stacking context (which would otherwise clip
  // `position: fixed` children to the header's bounds, not the viewport).
  return createPortal(
    <div
      ref={dialogRef}
      id="landing-mobile-drawer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="landing-mobile-drawer-title"
      className="fixed inset-0 z-50 flex flex-col bg-bg md:hidden"
    >
      <div className="flex items-center justify-between gap-4 border-b border-border-subtle px-4 py-4">
        <p id="landing-mobile-drawer-title" className="text-sm font-semibold uppercase tracking-wider text-text-tertiary">
          Menu
        </p>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Zavřít menu"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-text-secondary transition-colors duration-fast hover:bg-surface-overlay hover:text-text-primary"
        >
          <X size={20} strokeWidth={1.75} />
        </button>
      </div>
      <nav aria-label="Hlavní mobilní" className="flex flex-1 flex-col gap-1 p-4">
        {NAV_LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            onClick={onClose}
            className="rounded-md px-3 py-3 text-base font-medium text-text-primary transition-colors duration-fast hover:bg-surface-overlay"
          >
            {link.label}
          </a>
        ))}
        <Link
          to="/login"
          onClick={onClose}
          className="mt-2 rounded-md px-3 py-3 text-base font-medium text-text-primary transition-colors duration-fast hover:bg-surface-overlay"
        >
          Přihlásit se
        </Link>
      </nav>
      <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-4 py-4">
        <ThemeToggle variant="compact" />
        <a
          href={GOOGLE_LOGIN_URL}
          className="inline-flex h-10 flex-1 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
        >
          Vyzkoušet zdarma
        </a>
      </div>
    </div>,
    document.body,
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Dual radial glow behind the hero — indigo bottom-left, magenta
          top-right — only the marketing hero is allowed this gradient
          combo per brief §2 anti-patterns. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="bg-accent/30 absolute -bottom-32 -left-32 h-96 w-96 rounded-full blur-3xl" />
        <div className="bg-brand-accent/20 absolute -right-32 -top-32 h-96 w-96 rounded-full blur-3xl" />
      </div>
      <div className="relative mx-auto max-w-[1200px] px-4 pb-20 pt-16 text-center md:px-8 md:pb-24 md:pt-24">
        <p className="mb-4 text-sm font-medium uppercase tracking-wider text-text-tertiary">
          Český CRM pro malé týmy
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight md:text-6xl">
          CRM pro{" "}
          <span
            className="bg-[linear-gradient(transparent_82%,var(--color-brand-accent)_82%,var(--color-brand-accent)_94%,transparent_94%)] bg-no-repeat"
          >
            prodej
          </span>
          . Nic víc, nic míň.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base text-text-secondary md:text-lg">
          Jednoduchý český CRM pro malé prodejní týmy. Funguje s ARES, automaticky vrací neaktivní
          firmy zpět do sdíleného pool. 30 dní zdarma, bez kreditky.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href={GOOGLE_LOGIN_URL}
            className="inline-flex h-12 items-center justify-center rounded-md bg-accent px-6 text-base font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
          >
            Vyzkoušet 30 dní zdarma
          </a>
          <a
            href="#funkce"
            className="inline-flex h-12 items-center justify-center rounded-md border border-border bg-surface-overlay px-6 text-base font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary"
          >
            Prohlédnout funkce
          </a>
        </div>

        <p className="mt-4 text-xs text-text-tertiary">
          Žádná kreditní karta při registraci. Přihlášení přes Google.
        </p>

        <div className="mx-auto mt-16 max-w-4xl">
          <MockBoard />
        </div>
      </div>
    </section>
  );
}

function MockBoard() {
  const stages: { name: string; color: string; deals: { name: string; amount: string }[] }[] = [
    {
      name: "Nový lead",
      color: "#3D5AFE",
      deals: [
        { name: "Obchod s Alza.cz", amount: "42 500 Kč" },
        { name: "Rohlík — nabídka", amount: "28 000 Kč" },
      ],
    },
    {
      name: "Schůzka",
      color: "#F59E0B",
      deals: [{ name: "Notino – konzultace", amount: "60 000 Kč" }],
    },
    {
      name: "Nabídka",
      color: "#10B981",
      deals: [{ name: "Mattoni — servis", amount: "125 000 Kč" }],
    },
    {
      name: "Vyhráno",
      // Brand magenta — the celebration hue. The mockup is the only place on
      // the marketing page allowed two magenta moments (this dot + the hero
      // word underline added in B1).
      color: "#EC4899",
      deals: [{ name: "O2 — školení", amount: "90 000 Kč" }],
    },
  ];
  return (
    <div aria-hidden className="rounded-xl border border-border bg-surface p-4 shadow-lg md:p-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stages.map((stage) => (
          <div
            key={stage.name}
            className="rounded-md border border-border-subtle bg-surface-overlay p-3"
          >
            <div className="flex items-center gap-2 border-b border-border-subtle pb-2">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: stage.color }}
              />
              <span className="text-xs font-semibold">{stage.name}</span>
            </div>
            <div className="mt-3 space-y-2">
              {stage.deals.map((deal) => (
                <div
                  key={deal.name}
                  className="rounded border border-border bg-surface p-2 text-left shadow-sm"
                >
                  <p className="truncate text-xs font-medium">{deal.name}</p>
                  <p className="mt-1 font-mono text-xs tabular-nums text-text-secondary">
                    {deal.amount}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface Differentiator {
  icon: LucideIcon;
  title: string;
  body: string;
  tone: "accent" | "warning" | "lime";
}

const DIFFS: Differentiator[] = [
  {
    icon: Database,
    title: "ARES integrace",
    body: "Zadejte IČO a firma se sama doplní — název, adresa, DIČ, právní forma. Žádné přepisování z webu.",
    tone: "accent",
  },
  {
    icon: RefreshCw,
    title: "Automatické uvolňování firem",
    body: "Firma přiřazená obchodníkovi bez obchodu 365 dní se vrátí do sdíleného poolu. Nikdo si nesedí na leadu věčnost.",
    tone: "warning",
  },
  {
    icon: Scissors,
    title: "Bez zbytečností",
    body: "Žádné kalendáře, žádné e-mailové sekvence, žádná marketingová automatizace. Na to máte jiné nástroje.",
    tone: "lime",
  },
];

function Differentiators() {
  const toneClass = (tone: Differentiator["tone"]): string =>
    tone === "accent"
      ? "bg-accent-subtle text-accent"
      : tone === "warning"
        ? "bg-warning-subtle text-warning"
        : "bg-highlight-subtle text-text-primary";

  return (
    <section id="funkce" className="mx-auto max-w-[1200px] px-4 py-16 md:px-8 md:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-text-tertiary">
          Proč SimpleCRM
        </p>
        <h2 className="mt-2 text-3xl font-bold md:text-4xl">Tři věci, které jinde nenajdete</h2>
      </div>
      <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
        {DIFFS.map(({ icon: Icon, title, body, tone }) => (
          <article
            key={title}
            className="rounded-lg border border-border bg-surface p-6 shadow-sm transition-shadow duration-fast hover:shadow-md"
          >
            <div
              aria-hidden
              className={cn(
                "mb-4 inline-flex h-10 w-10 items-center justify-center rounded-md",
                toneClass(tone),
              )}
            >
              <Icon size={20} strokeWidth={1.75} />
            </div>
            <h3 className="text-lg font-semibold">{title}</h3>
            <p className="mt-2 text-sm text-text-secondary">{body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      icon: MousePointerClick,
      title: "Zaregistrujte se přes Google",
      body: "Jedno kliknutí. Během 30 sekund máte účet, svůj tým a 30 dní zdarma.",
    },
    {
      icon: Building2,
      title: "Přidejte první firmu",
      body: "Zadejte IČO a ARES doplní zbytek. Nebo tabulku s firmami nahrajte jedním tahem (brzy).",
    },
    {
      icon: Check,
      title: "Spravujte obchody v pipeline",
      body: "Kanban přehled s drag-and-drop. Vyhrané obchody resetují 365denní hodiny vlastnictví firmy.",
    },
  ];
  return (
    <section className="bg-surface">
      <div className="mx-auto max-w-[1200px] px-4 py-16 md:px-8 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium uppercase tracking-wider text-text-tertiary">
            Jak to funguje
          </p>
          <h2 className="mt-2 text-3xl font-bold md:text-4xl">
            Od registrace k prvnímu obchodu za 5 minut
          </h2>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
          {steps.map((step, i) => (
            <div key={step.title} className="relative">
              <div
                aria-hidden
                className="absolute -top-3 left-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-semibold text-text-on-accent"
              >
                {i + 1}
              </div>
              <div className="rounded-lg border border-border bg-surface-overlay p-6 pl-6 pt-10">
                <step.icon
                  aria-hidden
                  size={24}
                  strokeWidth={1.75}
                  className="text-text-secondary"
                />
                <h3 className="mt-3 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-text-secondary">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="cenik" className="mx-auto max-w-[1200px] px-4 py-16 md:px-8 md:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-text-tertiary">Ceník</p>
        <h2 className="mt-2 text-3xl font-bold md:text-4xl">Jedna cena, žádné hry</h2>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
        <article className="rounded-xl border border-border bg-surface p-8 shadow-sm">
          <p className="text-sm font-medium uppercase tracking-wider text-text-tertiary">
            Zkušební verze
          </p>
          <p className="mt-3 text-4xl font-bold">Zdarma</p>
          <p className="mt-1 text-sm text-text-secondary">Plná funkcionalita na 30 dní.</p>
          <ul className="mt-6 space-y-3 text-sm text-text-primary">
            {[
              "Neomezený počet firem, kontaktů a obchodů",
              "ARES integrace",
              "Automatické uvolňování firem",
              "Bez zadání platební karty",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <Check size={16} strokeWidth={1.75} className="mt-0.5 text-success" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <a
            href={GOOGLE_LOGIN_URL}
            className="mt-8 inline-flex h-11 w-full items-center justify-center rounded-md border border-border bg-surface-overlay px-5 text-sm font-medium text-text-primary transition-colors duration-fast hover:bg-surface-elevated"
          >
            Začít zdarma
          </a>
        </article>

        <article className="rounded-xl border-2 border-accent bg-surface p-8 shadow-md">
          <p className="text-sm font-medium uppercase tracking-wider text-accent">
            Po zkušební době
          </p>
          <p className="mt-3 text-4xl font-bold tabular-nums">
            {PRICE_PER_USER_CZK} Kč{" "}
            <span className="text-base font-normal text-text-tertiary">/ uživatel / měsíc</span>
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Bez závazků. Zrušení kdykoliv. Data v EU.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-text-primary">
            {[
              "Všechno ze zkušební verze",
              "Neomezený počet uživatelů",
              "Export dat kdykoliv",
              "Podpora v češtině, do 24 hodin",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <Check size={16} strokeWidth={1.75} className="mt-0.5 text-accent" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <a
            href={GOOGLE_LOGIN_URL}
            className="mt-8 inline-flex h-11 w-full items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
          >
            Vyzkoušet 30 dní zdarma
          </a>
        </article>
      </div>
    </section>
  );
}

interface FaqItem {
  q: string;
  a: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    q: "Kde jsou uložena data?",
    a: "Všechna data ukládáme v datacentrech v EU (Hetzner, Frankfurt / Nuremberg). Splňujeme GDPR a smlouvu o zpracování dat podepíšeme na požádání.",
  },
  {
    q: "Jak funguje ARES integrace?",
    a: "Při založení firmy zadáte IČO a my se ptáme na veřejný rejstřík ARES. Zpět dostanete název, adresu, DIČ a právní formu. Zdarma, součástí aplikace.",
  },
  {
    q: "Čím se lišíte od Raynet nebo Pipedrive?",
    a: "Jsme levnější, jednodušší, česky a máme dvě funkce, které jinde nenajdete: ARES na jedno kliknutí a automatické uvolňování firem po roce bez obchodu.",
  },
  {
    q: "Co když má firma víc než 25 uživatelů?",
    a: "Žádný problém — cena je stejná. Enterprise tarif jsme zatím neuvedli, ale napište nám a dohodneme se.",
  },
  {
    q: "Můžu si data kdykoli exportovat?",
    a: "Ano. Export do CSV je součástí aplikace, i po skončení předplatného. Vaše data zůstávají vaše.",
  },
  {
    q: "Jak se účtuje a dá se zrušit?",
    a: "Měsíčně dopředu, zrušíte jedním klikem v nastavení. Po zrušení zachováme data ještě 30 dní, pak je natvrdo smažeme.",
  },
];

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="bg-surface">
      <div className="mx-auto max-w-3xl px-4 py-16 md:px-8 md:py-24">
        <div className="text-center">
          <p className="text-sm font-medium uppercase tracking-wider text-text-tertiary">FAQ</p>
          <h2 className="mt-2 text-3xl font-bold md:text-4xl">Časté otázky</h2>
        </div>
        <ul className="mt-10 divide-y divide-border-subtle rounded-lg border border-border bg-surface">
          {FAQ_ITEMS.map((item, i) => {
            const isOpen = open === i;
            return (
              <li key={item.q}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors duration-fast hover:bg-surface-overlay"
                >
                  <span className="text-base font-medium text-text-primary">{item.q}</span>
                  <ChevronDown
                    size={18}
                    strokeWidth={1.75}
                    aria-hidden
                    className={cn(
                      "shrink-0 text-text-tertiary transition-transform duration-fast",
                      isOpen && "rotate-180",
                    )}
                  />
                </button>
                {isOpen ? (
                  <div className="px-5 pb-5 text-sm text-text-secondary">{item.a}</div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border-subtle">
      <div className="mx-auto max-w-[1200px] px-4 py-10 md:px-8">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-highlight text-text-on-accent"
            >
              <Sparkles size={18} strokeWidth={1.75} />
            </span>
            <span className="text-sm font-semibold">SimpleCRM</span>
          </div>
          <nav aria-label="Patička" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <a href="#funkce" className="text-text-secondary hover:text-text-primary">
              Funkce
            </a>
            <a href="#cenik" className="text-text-secondary hover:text-text-primary">
              Ceník
            </a>
            <a href="#faq" className="text-text-secondary hover:text-text-primary">
              FAQ
            </a>
            <a
              href="mailto:podpora@simplecrm.cz"
              className="inline-flex items-center gap-1 text-text-secondary hover:text-text-primary"
            >
              <Mail size={14} strokeWidth={1.75} /> podpora@simplecrm.cz
            </a>
          </nav>
        </div>
        <p className="mt-6 text-xs text-text-tertiary">
          © {new Date().getFullYear()} SimpleCRM · Ochrana osobních údajů · Obchodní podmínky
        </p>
      </div>
    </footer>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <Nav />
      <main>
        <Hero />
        <Differentiators />
        <HowItWorks />
        <Pricing />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
