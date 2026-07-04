import {
  Building2,
  Check,
  ChevronDown,
  Database,
  Mail,
  Menu,
  MousePointerClick,
  Phone,
  RefreshCw,
  Scissors,
  Sparkles,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";

import { ThemeToggle } from "@/lib/ThemeToggle";
import { cn } from "@/lib/utils";
import { openCookieSettings } from "@/marketing/cookie-consent-controls";
import { COMGATE_INFO, LEGAL_ENTITY } from "@/marketing/legal-entity";
import { AresDemoSection } from "@/marketing/AresDemoSection";
import { CalendarDemoSection } from "@/marketing/CalendarDemoSection";
import { InteractivePipeline } from "@/marketing/InteractivePipeline";
import { ReportsDemoSection } from "@/marketing/ReportsDemoSection";

const SIGNUP_PATH = "/signup";
// Monthly list price; the annual plan (996 Kč/yr) works out to 83 Kč/mo, which
// is what we lead with on the landing page.
const PRICE_PER_USER_CZK = 99;
const PRICE_PER_USER_ANNUAL_MONTHLY_CZK = 83;

type NavLink =
  | { kind: "anchor"; href: string; label: string }
  | { kind: "route"; to: string; label: string };

const NAV_LINKS: NavLink[] = [
  { kind: "anchor", href: "#funkce", label: "Funkce" },
  { kind: "route", to: "/cenik", label: "Ceník" },
  { kind: "anchor", href: "#faq", label: "FAQ" },
  { kind: "route", to: "/kontakt", label: "Kontakt" },
];

/**
 * On `/`, anchor hrefs let the browser smooth-scroll to the section
 * natively. On any other route the same anchors point at sections that
 * aren't mounted, so we navigate back to `/` with the hash and let
 * LandingPage's hash-scroll effect handle the scroll after mount.
 */
function HashNavLink({
  href,
  className,
  onClick,
  children,
}: {
  href: string;
  className: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const { pathname } = useLocation();
  if (pathname === "/") {
    return (
      <a href={href} onClick={onClick} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link to={`/${href}`} onClick={onClick} className={className}>
      {children}
    </Link>
  );
}

export function Nav() {
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
    <header className="sticky top-0 z-30 border-b border-border-subtle bg-bg/70 backdrop-blur">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-2 px-4 py-4 md:gap-8 md:px-8">
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
          {NAV_LINKS.map((link) =>
            link.kind === "route" ? (
              <Link
                key={link.to}
                to={link.to}
                className="text-sm text-text-secondary hover:text-text-primary"
              >
                {link.label}
              </Link>
            ) : (
              <HashNavLink
                key={link.href}
                href={link.href}
                className="text-sm text-text-secondary hover:text-text-primary"
              >
                {link.label}
              </HashNavLink>
            ),
          )}
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle variant="compact" className="hidden md:inline-flex" />
          <Link
            to="/login"
            className="hidden h-10 items-center justify-center rounded-md px-4 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-overlay hover:text-text-primary md:inline-flex"
          >
            Přihlásit se
          </Link>
          <Link
            to={SIGNUP_PATH}
            className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-3 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover sm:px-5"
          >
            Vyzkoušet zdarma
          </Link>
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
      // length > 0 guard above guarantees both ends exist; non-null
      // assertions satisfy noUncheckedIndexedAccess.
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
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
        <p
          id="landing-mobile-drawer-title"
          className="text-sm font-semibold uppercase tracking-wider text-text-tertiary"
        >
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
        {NAV_LINKS.map((link) =>
          link.kind === "route" ? (
            <Link
              key={link.to}
              to={link.to}
              onClick={onClose}
              className="rounded-md px-3 py-3 text-base font-medium text-text-primary transition-colors duration-fast hover:bg-surface-overlay"
            >
              {link.label}
            </Link>
          ) : (
            <HashNavLink
              key={link.href}
              href={link.href}
              onClick={onClose}
              className="rounded-md px-3 py-3 text-base font-medium text-text-primary transition-colors duration-fast hover:bg-surface-overlay"
            >
              {link.label}
            </HashNavLink>
          ),
        )}
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
        <Link
          to={SIGNUP_PATH}
          onClick={onClose}
          className="inline-flex h-10 flex-1 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
        >
          Vyzkoušet zdarma
        </Link>
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
          combo per brief §2 anti-patterns.

          The container carries a vertical mask so each glow fades to
          transparent before reaching the section's clipped edges,
          replacing the hard arc that `overflow-hidden` would otherwise
          carve at the section boundary. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          maskImage:
            "linear-gradient(to bottom, transparent 0, black 12%, black 78%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0, black 12%, black 78%, transparent 100%)",
        }}
      >
        <div className="absolute -bottom-32 -left-32 h-[28rem] w-[28rem] rounded-full bg-accent/30 blur-3xl" />
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-accent/20 blur-3xl" />
      </div>
      <div className="relative mx-auto max-w-[1200px] px-4 pb-20 pt-16 text-center md:px-8 md:pb-24 md:pt-24">
        <p className="mb-4 text-sm font-medium uppercase tracking-wider text-text-tertiary">
          Český CRM pro malé týmy
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight md:text-6xl">
          <span className="block">
            CRM pro{" "}
            <span className="bg-[linear-gradient(transparent_82%,var(--color-brand-accent)_82%,var(--color-brand-accent)_94%,transparent_94%)] bg-no-repeat">
              prodej
            </span>
            .
          </span>
          <span className="block">Nic víc, nic míň.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base text-text-secondary md:text-lg">
          Jednoduchý český CRM pro malé prodejní týmy. Funguje s ARES, automaticky vrací neaktivní
          firmy zpět do sdíleného pool. 30 dní zdarma, bez kreditky.
        </p>

        <div className="mt-8 flex flex-col items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-accent">
            <Sparkles size={13} strokeWidth={2} aria-hidden />
            Nejlevnější CRM na trhu
          </span>
          <p className="flex items-baseline justify-center gap-2">
            <span className="text-5xl font-extrabold leading-none tracking-tight text-brand-accent md:text-6xl">
              {PRICE_PER_USER_ANNUAL_MONTHLY_CZK}&nbsp;Kč
            </span>
            <span className="text-base font-medium text-text-secondary md:text-lg">
              / uživatel / měsíc
            </span>
          </p>
          <p className="text-sm text-text-tertiary">
            při roční platbě · {PRICE_PER_USER_CZK} Kč při měsíční platbě
          </p>
        </div>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to={SIGNUP_PATH}
            className="inline-flex h-12 items-center justify-center rounded-md bg-accent px-6 text-base font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
          >
            Vyzkoušet 30 dní zdarma
          </Link>
          <a
            href="#funkce"
            className="inline-flex h-12 items-center justify-center rounded-md border border-border bg-surface-overlay px-6 text-base font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary"
          >
            Prohlédnout funkce
          </a>
        </div>

        <p className="mt-4 text-xs text-text-tertiary">
          Žádná kreditní karta při registraci. Registrace přes Google nebo e-mail.
        </p>

        <div className="mx-auto mt-16 max-w-5xl">
          <InteractivePipeline />
        </div>
      </div>
    </section>
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
    icon: Mail,
    title: "Hromadné nabídky e-mailem",
    body: "Pošlete novou nabídku všem svým klientům najednou. Vyfiltrujte firmy podle oboru i aktivity a odešlete e-mail ze své vlastní adresy.",
    tone: "accent",
  },
  {
    icon: Scissors,
    title: "Bez zbytečností",
    body: "Žádné složité workflow ani marketingová automatizace. Jen nástroje, které obchodník opravdu denně potřebuje.",
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
        <h2 className="mt-2 text-3xl font-bold md:text-4xl">Co u nás najdete (a jinde ne)</h2>
      </div>
      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-4">
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
      title: "Zaregistrujte se přes Google nebo e-mail",
      body: "Jedno kliknutí přes Google, nebo klasicky e-mailem. Za 30 sekund máte účet, svůj tým a 30 dní zdarma.",
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
        <div className="mx-auto max-w-3xl text-center md:max-w-4xl">
          <p className="text-sm font-medium uppercase tracking-wider text-text-tertiary">
            Jak to funguje
          </p>
          <h2 className="mt-2 text-3xl font-bold md:whitespace-nowrap md:text-4xl">
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
          <Link
            to={SIGNUP_PATH}
            className="mt-8 inline-flex h-11 w-full items-center justify-center rounded-md border border-border bg-surface-overlay px-5 text-sm font-medium text-text-primary transition-colors duration-fast hover:bg-surface-elevated"
          >
            Vyzkoušet 30 dní zdarma
          </Link>
        </article>

        <article className="rounded-xl border-2 border-accent bg-surface p-8 shadow-md">
          <p className="text-sm font-medium uppercase tracking-wider text-accent">
            Po zkušební době
          </p>
          <p className="mt-3 text-4xl font-bold tabular-nums">
            {PRICE_PER_USER_ANNUAL_MONTHLY_CZK} Kč{" "}
            <span className="text-base font-normal text-text-tertiary">/ uživatel / měsíc</span>
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Při roční platbě. {PRICE_PER_USER_CZK} Kč při měsíční platbě. Zrušení kdykoliv, data v EU.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-text-primary">
            {[
              "Všechno ze zkušební verze",
              "Neomezený počet uživatelů",
              "Export dat kdykoliv",
              "Podpora v češtině",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <Check size={16} strokeWidth={1.75} className="mt-0.5 text-accent" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <Link
            to={SIGNUP_PATH}
            className="mt-8 inline-flex h-11 w-full items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
          >
            Vyzkoušet 30 dní zdarma
          </Link>
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

export function Footer() {
  return (
    <footer className="border-t border-border-subtle">
      <div className="mx-auto max-w-[1200px] px-4 py-10 md:px-8">
        <div className="grid gap-8 md:grid-cols-4">
          <div className="md:col-span-1">
            <Link to="/" className="flex items-center gap-2" aria-label="SimpleCRM">
              <span
                aria-hidden
                className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-highlight text-text-on-accent"
              >
                <Sparkles size={18} strokeWidth={1.75} />
              </span>
              <span className="text-sm font-semibold">SimpleCRM</span>
            </Link>
            <p className="mt-3 text-xs text-text-tertiary">
              Jednoduché české CRM pro firmy do 30 obchodníků.
            </p>
          </div>

          <div className="md:col-span-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              Provozovatel
            </h3>
            <address className="mt-3 text-xs not-italic leading-relaxed text-text-secondary">
              {LEGAL_ENTITY.fullName}
              <br />
              {LEGAL_ENTITY.address}
              <br />
              IČO: {LEGAL_ENTITY.ico}
              <br />
              <span className="text-text-tertiary">{LEGAL_ENTITY.registryClause}</span>
            </address>
            <a
              href={`mailto:${LEGAL_ENTITY.email}`}
              className="mt-3 inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
            >
              <Mail size={12} strokeWidth={1.75} /> {LEGAL_ENTITY.email}
            </a>
            <a
              href={`tel:${LEGAL_ENTITY.phone.replace(/\s+/g, "")}`}
              className="mt-1 inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
            >
              <Phone size={12} strokeWidth={1.75} /> {LEGAL_ENTITY.phone}
            </a>
          </div>

          <div className="md:col-span-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              Produkt
            </h3>
            <nav aria-label="Patička – produkt" className="mt-3 flex flex-col gap-2 text-xs">
              <Link to="/" className="text-text-secondary hover:text-text-primary">
                Úvod
              </Link>
              <Link to="/cenik" className="text-text-secondary hover:text-text-primary">
                Ceník
              </Link>
              <Link to="/predplatne" className="text-text-secondary hover:text-text-primary">
                Předplatné a platby
              </Link>
              <Link to="/kontakt" className="text-text-secondary hover:text-text-primary">
                Kontakt
              </Link>
            </nav>
          </div>

          <div className="md:col-span-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              Právní informace
            </h3>
            <nav
              aria-label="Patička – právní informace"
              className="mt-3 flex flex-col gap-2 text-xs"
            >
              <Link to="/obchodni-podminky" className="text-text-secondary hover:text-text-primary">
                Obchodní podmínky
              </Link>
              <Link
                to="/reklamacni-podminky"
                className="text-text-secondary hover:text-text-primary"
              >
                Reklamační podmínky
              </Link>
              <Link
                to="/dodaci-a-platebni-podminky"
                className="text-text-secondary hover:text-text-primary"
              >
                Dodací a platební podmínky
              </Link>
              <Link
                to="/ochrana-osobnich-udaju"
                className="text-text-secondary hover:text-text-primary"
              >
                Ochrana osobních údajů
              </Link>
              <Link
                to="/zpracovatelska-smlouva"
                className="text-text-secondary hover:text-text-primary"
              >
                Zpracovatelská smlouva (DPA)
              </Link>
              <Link to="/cookies" className="text-text-secondary hover:text-text-primary">
                Cookies
              </Link>
              <button
                type="button"
                onClick={() => openCookieSettings()}
                className="text-left text-text-secondary hover:text-text-primary"
              >
                Nastavení cookies
              </button>
            </nav>
          </div>
        </div>

        <div className="mt-8 border-t border-border-subtle pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              Platební metody
            </span>
            {/* Oficiální logo strip Comgate (Comgate + Visa + Mastercard) dle
                help.comgate.cz/docs/cs/loga-a-udaje-na-webu. Web je light-only, takže
                používáme variantu pro světlé pozadí; tmavá varianta (…-dark-bg.png) leží
                vedle pro případné budoucí tmavé téma. */}
            <a
              href={COMGATE_INFO.gatewayUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex"
              aria-label="Platební brána Comgate – platby kartou Visa a Mastercard"
            >
              <img
                src="/payment/comgate-logos-light-bg.png"
                alt="Comgate, Visa, Mastercard"
                className="h-8 w-auto"
                loading="lazy"
              />
            </a>
          </div>
          <p className="mt-4 max-w-3xl text-xs leading-relaxed text-text-tertiary">
            {COMGATE_INFO.legalText}
          </p>
        </div>

        <p className="mt-6 text-xs text-text-tertiary">© {new Date().getFullYear()} SimpleCRM</p>
      </div>
    </footer>
  );
}

export function LandingPage() {
  const { hash } = useLocation();

  // SPA navigation that lands here with a hash (e.g. /kontakt → /#funkce)
  // doesn't fire the browser's native anchor scroll. Do it manually after
  // mount. Two rAFs because heavy children (InteractivePipeline,
  // ReportsDemoSection) finish layout on the second frame, and a final
  // 60ms retry covers slower paints.
  useEffect(() => {
    if (!hash) return;
    const id = hash.slice(1);
    const scroll = () => document.getElementById(id)?.scrollIntoView({ block: "start" });
    requestAnimationFrame(() => requestAnimationFrame(scroll));
    const fallback = window.setTimeout(scroll, 60);
    return () => window.clearTimeout(fallback);
  }, [hash]);

  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <Nav />
      <main>
        <Hero />
        <Differentiators />
        <AresDemoSection />
        <HowItWorks />
        <ReportsDemoSection />
        <CalendarDemoSection />
        <Pricing />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
