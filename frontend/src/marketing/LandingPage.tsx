import type { ParseKeys } from "i18next";
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
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";

import { Logo } from "@/components/Logo";
import { formatMoney } from "@/lib/format";
import { LANGUAGE_LABEL, SUPPORTED_LANGUAGES } from "@/lib/i18n/languages";
import { useLocale } from "@/lib/i18n/useLocale";
import { ThemeToggle } from "@/lib/ThemeToggle";
import { usePageTitle } from "@/lib/usePageTitle";

import { HeroPlasma } from "./HeroPlasma";
import { cn } from "@/lib/utils";
import { openCookieSettings } from "@/marketing/cookie-consent-controls";
import { COMGATE_INFO, LEGAL_ENTITY } from "@/marketing/legal-entity";
import { AresDemoSection } from "@/marketing/AresDemoSection";
import { CalendarDemoSection } from "@/marketing/CalendarDemoSection";
import { InteractivePipeline } from "@/marketing/InteractivePipeline";
import { ReportsDemoSection } from "@/marketing/ReportsDemoSection";
import {
  counterpartPath,
  type MarketingKey,
  marketingLangFromPath,
  marketingPath,
} from "@/marketing/slugs";

const SIGNUP_PATH = "/signup";

// Monthly list price; the annual plan (996 CZK/yr) works out to 83 CZK/mo,
// which is what we lead with on the landing page.
const PRICE_PER_USER_CZK = 99;
const PRICE_PER_USER_ANNUAL_MONTHLY_CZK = 83;

type NavLink =
  | { kind: "anchor"; href: string; labelKey: ParseKeys<"marketing"> }
  | { kind: "route"; slug: MarketingKey; labelKey: ParseKeys<"marketing"> };

const NAV_LINKS: NavLink[] = [
  { kind: "anchor", href: "#funkce", labelKey: "nav.features" },
  { kind: "route", slug: "cenik", labelKey: "nav.pricing" },
  { kind: "anchor", href: "#faq", labelKey: "nav.faq" },
  { kind: "route", slug: "kontakt", labelKey: "nav.contact" },
];

/**
 * Language toggle for the marketing site. Each option is a plain `<Link>` to
 * the counterpart URL in that language — navigating there is what flips the
 * running language (via `MarketingLanguageLayout`). Query string is preserved
 * so e.g. `?plan=annual` survives the switch.
 */
export function MarketingLanguageSwitcher({ className }: { className?: string }) {
  const { t } = useTranslation("marketing");
  const { pathname, search } = useLocation();
  const current = marketingLangFromPath(pathname);
  return (
    <div
      role="group"
      aria-label={t("nav.languageAria")}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border bg-surface p-0.5",
        className,
      )}
    >
      {SUPPORTED_LANGUAGES.map((lang) => {
        const active = lang === current;
        const target = active
          ? pathname
          : (counterpartPath(pathname) ?? marketingPath("landing", lang));
        return (
          <Link
            key={lang}
            to={target + search}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-7 items-center rounded-sm px-2 text-xs font-medium transition-colors duration-fast",
              active
                ? "bg-accent-subtle text-accent"
                : "text-text-tertiary hover:bg-surface-overlay hover:text-text-primary",
            )}
          >
            {LANGUAGE_LABEL[lang]}
          </Link>
        );
      })}
    </div>
  );
}

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
  const landingPath = marketingPath("landing", marketingLangFromPath(pathname));
  if (pathname === landingPath) {
    return (
      <a href={href} onClick={onClick} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link to={`${landingPath}${href}`} onClick={onClick} className={className}>
      {children}
    </Link>
  );
}

export function Nav() {
  const { t } = useTranslation("marketing");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const lang = marketingLangFromPath(useLocation().pathname);

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
        <Link
          to={marketingPath("landing", lang)}
          className="flex items-center gap-2"
          aria-label="SimpleCRM"
        >
          <Logo />
        </Link>
        <nav aria-label={t("nav.mainNavAria")} className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) =>
            link.kind === "route" ? (
              <Link
                key={link.slug}
                to={marketingPath(link.slug, lang)}
                className="text-sm text-text-secondary hover:text-text-primary"
              >
                {t(link.labelKey)}
              </Link>
            ) : (
              <HashNavLink
                key={link.href}
                href={link.href}
                className="text-sm text-text-secondary hover:text-text-primary"
              >
                {t(link.labelKey)}
              </HashNavLink>
            ),
          )}
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <MarketingLanguageSwitcher className="hidden md:inline-flex" />
          <ThemeToggle variant="compact" className="hidden md:inline-flex" />
          <Link
            to="/login"
            className="hidden h-10 items-center justify-center rounded-md px-4 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-overlay hover:text-text-primary md:inline-flex"
          >
            {t("nav.login")}
          </Link>
          <Link
            to={SIGNUP_PATH}
            className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-3 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover sm:px-5"
          >
            {t("nav.tryFree")}
          </Link>
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label={t("nav.openMenu")}
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
  const { t } = useTranslation("marketing");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const lang = marketingLangFromPath(useLocation().pathname);

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
          {t("nav.menu")}
        </p>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label={t("nav.closeMenu")}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-text-secondary transition-colors duration-fast hover:bg-surface-overlay hover:text-text-primary"
        >
          <X size={20} strokeWidth={1.75} />
        </button>
      </div>
      <nav aria-label={t("nav.mainNavMobileAria")} className="flex flex-1 flex-col gap-1 p-4">
        {NAV_LINKS.map((link) =>
          link.kind === "route" ? (
            <Link
              key={link.slug}
              to={marketingPath(link.slug, lang)}
              onClick={onClose}
              className="rounded-md px-3 py-3 text-base font-medium text-text-primary transition-colors duration-fast hover:bg-surface-overlay"
            >
              {t(link.labelKey)}
            </Link>
          ) : (
            <HashNavLink
              key={link.href}
              href={link.href}
              onClick={onClose}
              className="rounded-md px-3 py-3 text-base font-medium text-text-primary transition-colors duration-fast hover:bg-surface-overlay"
            >
              {t(link.labelKey)}
            </HashNavLink>
          ),
        )}
        <Link
          to="/login"
          onClick={onClose}
          className="mt-2 rounded-md px-3 py-3 text-base font-medium text-text-primary transition-colors duration-fast hover:bg-surface-overlay"
        >
          {t("nav.login")}
        </Link>
      </nav>
      <div className="flex flex-col gap-3 border-t border-border-subtle px-4 py-4">
        <div className="flex items-center gap-3">
          <MarketingLanguageSwitcher />
          <ThemeToggle variant="compact" />
        </div>
        <Link
          to={SIGNUP_PATH}
          onClick={onClose}
          className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
        >
          {t("nav.tryFree")}
        </Link>
      </div>
    </div>,
    document.body,
  );
}

function Hero() {
  const { t } = useTranslation("marketing");
  const locale = useLocale();
  return (
    <section className="relative overflow-hidden">
      {/* Living blobs behind the hero — only the marketing hero is allowed
          this gradient combo per brief §2 anti-patterns. The container's
          vertical mask fades them out before the section's clipped edges,
          avoiding the hard arc `overflow-hidden` would carve. */}
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
        <HeroPlasma />
      </div>
      <div className="relative mx-auto max-w-[1200px] px-4 pb-20 pt-16 text-center md:px-8 md:pb-24 md:pt-24">
        <p className="mb-4 text-sm font-medium uppercase tracking-wider text-text-tertiary">
          {t("hero.eyebrow")}
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight md:text-6xl">
          <span className="block">
            {t("hero.titleLead")}{" "}
            <span className="bg-[linear-gradient(transparent_82%,var(--color-brand-accent)_82%,var(--color-brand-accent)_94%,transparent_94%)] bg-no-repeat">
              {t("hero.titleAccent")}
            </span>
            .
          </span>
          <span className="block">{t("hero.titleLine2")}</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base text-text-secondary md:text-lg">
          {t("hero.subtitle")}
        </p>

        <div className="mt-8 flex flex-col items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-accent">
            <Sparkles size={13} strokeWidth={2} aria-hidden />
            {t("hero.cheapestBadge")}
          </span>
          <p className="flex items-baseline justify-center gap-2">
            <span className="text-5xl font-extrabold leading-none tracking-tight text-brand-accent md:text-6xl">
              {formatMoney(PRICE_PER_USER_ANNUAL_MONTHLY_CZK, "CZK", locale)}
            </span>
            <span className="text-base font-medium text-text-secondary md:text-lg">
              {t("hero.pricePerUserMonth")}
            </span>
          </p>
          <p className="text-sm text-text-tertiary">
            {t("hero.priceNote", { monthly: formatMoney(PRICE_PER_USER_CZK, "CZK", locale) })}
          </p>
        </div>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to={SIGNUP_PATH}
            className="inline-flex h-12 items-center justify-center rounded-md bg-accent px-6 text-base font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
          >
            {t("hero.ctaTrial")}
          </Link>
          <a
            href="#funkce"
            className="inline-flex h-12 items-center justify-center rounded-md border border-border bg-surface-overlay px-6 text-base font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary"
          >
            {t("hero.ctaFeatures")}
          </a>
        </div>

        <p className="mt-4 text-xs text-text-tertiary">{t("hero.noCard")}</p>

        <div className="mx-auto mt-16 max-w-5xl">
          <InteractivePipeline />
        </div>
      </div>
    </section>
  );
}

interface Differentiator {
  icon: LucideIcon;
  titleKey: ParseKeys<"marketing">;
  bodyKey: ParseKeys<"marketing">;
  tone: "accent" | "warning" | "lime";
}

const DIFFS: Differentiator[] = [
  {
    icon: Database,
    titleKey: "diffs.aresTitle",
    bodyKey: "diffs.aresBody",
    tone: "accent",
  },
  {
    icon: RefreshCw,
    titleKey: "diffs.autoReleaseTitle",
    bodyKey: "diffs.autoReleaseBody",
    tone: "warning",
  },
  {
    icon: Mail,
    titleKey: "diffs.bulkEmailTitle",
    bodyKey: "diffs.bulkEmailBody",
    tone: "accent",
  },
  {
    icon: Scissors,
    titleKey: "diffs.noBloatTitle",
    bodyKey: "diffs.noBloatBody",
    tone: "lime",
  },
];

function Differentiators() {
  const { t } = useTranslation("marketing");
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
          {t("diffs.eyebrow")}
        </p>
        <h2 className="mt-2 text-3xl font-bold md:text-4xl">{t("diffs.title")}</h2>
      </div>
      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-4">
        {DIFFS.map(({ icon: Icon, titleKey, bodyKey, tone }) => (
          <article
            key={titleKey}
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
            <h3 className="text-lg font-semibold">{t(titleKey)}</h3>
            <p className="mt-2 text-sm text-text-secondary">{t(bodyKey)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const { t } = useTranslation("marketing");
  const steps: {
    icon: LucideIcon;
    titleKey: ParseKeys<"marketing">;
    bodyKey: ParseKeys<"marketing">;
  }[] = [
    {
      icon: MousePointerClick,
      titleKey: "howItWorks.signupTitle",
      bodyKey: "howItWorks.signupBody",
    },
    {
      icon: Building2,
      titleKey: "howItWorks.firstCompanyTitle",
      bodyKey: "howItWorks.firstCompanyBody",
    },
    {
      icon: Check,
      titleKey: "howItWorks.pipelineTitle",
      bodyKey: "howItWorks.pipelineBody",
    },
  ];
  return (
    <section className="bg-surface">
      <div className="mx-auto max-w-[1200px] px-4 py-16 md:px-8 md:py-24">
        <div className="mx-auto max-w-3xl text-center md:max-w-4xl">
          <p className="text-sm font-medium uppercase tracking-wider text-text-tertiary">
            {t("howItWorks.eyebrow")}
          </p>
          <h2 className="mt-2 text-3xl font-bold md:whitespace-nowrap md:text-4xl">
            {t("howItWorks.title")}
          </h2>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
          {steps.map((step, i) => (
            <div key={step.titleKey} className="relative">
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
                <h3 className="mt-3 text-lg font-semibold">{t(step.titleKey)}</h3>
                <p className="mt-2 text-sm text-text-secondary">{t(step.bodyKey)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const { t } = useTranslation("marketing");
  const locale = useLocale();
  const trialBullets = [
    t("landingPricing.trialBullet1"),
    t("landingPricing.trialBullet2"),
    t("landingPricing.trialBullet3"),
    t("landingPricing.trialBullet4"),
  ];
  const paidBullets = [
    t("landingPricing.paidBullet1"),
    t("landingPricing.paidBullet2"),
    t("landingPricing.paidBullet3"),
    t("landingPricing.paidBullet4"),
  ];
  return (
    <section id="cenik" className="mx-auto max-w-[1200px] px-4 py-16 md:px-8 md:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-text-tertiary">
          {t("landingPricing.eyebrow")}
        </p>
        <h2 className="mt-2 text-3xl font-bold md:text-4xl">{t("landingPricing.title")}</h2>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
        <article className="rounded-xl border border-border bg-surface p-8 shadow-sm">
          <p className="text-sm font-medium uppercase tracking-wider text-text-tertiary">
            {t("landingPricing.trialEyebrow")}
          </p>
          <p className="mt-3 text-4xl font-bold">{t("landingPricing.trialPrice")}</p>
          <p className="mt-1 text-sm text-text-secondary">{t("landingPricing.trialSub")}</p>
          <ul className="mt-6 space-y-3 text-sm text-text-primary">
            {trialBullets.map((item) => (
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
            {t("landingPricing.trialCta")}
          </Link>
        </article>

        <article className="rounded-xl border-2 border-accent bg-surface p-8 shadow-md">
          <p className="text-sm font-medium uppercase tracking-wider text-accent">
            {t("landingPricing.paidEyebrow")}
          </p>
          <p className="mt-3 text-4xl font-bold tabular-nums">
            {formatMoney(PRICE_PER_USER_ANNUAL_MONTHLY_CZK, "CZK", locale)}{" "}
            <span className="text-base font-normal text-text-tertiary">
              {t("landingPricing.paidPriceSuffix")}
            </span>
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            {t("landingPricing.paidSub", {
              monthly: formatMoney(PRICE_PER_USER_CZK, "CZK", locale),
            })}
          </p>
          <ul className="mt-6 space-y-3 text-sm text-text-primary">
            {paidBullets.map((item) => (
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
            {t("landingPricing.paidCta")}
          </Link>
        </article>
      </div>
    </section>
  );
}

interface FaqItem {
  qKey: ParseKeys<"marketing">;
  aKey: ParseKeys<"marketing">;
}

const FAQ_ITEMS: FaqItem[] = [
  { qKey: "faq.q1", aKey: "faq.a1" },
  { qKey: "faq.q2", aKey: "faq.a2" },
  { qKey: "faq.q3", aKey: "faq.a3" },
  { qKey: "faq.q4", aKey: "faq.a4" },
  { qKey: "faq.q5", aKey: "faq.a5" },
  { qKey: "faq.q6", aKey: "faq.a6" },
];

function Faq() {
  const { t } = useTranslation("marketing");
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="bg-surface">
      <div className="mx-auto max-w-3xl px-4 py-16 md:px-8 md:py-24">
        <div className="text-center">
          <p className="text-sm font-medium uppercase tracking-wider text-text-tertiary">
            {t("faq.eyebrow")}
          </p>
          <h2 className="mt-2 text-3xl font-bold md:text-4xl">{t("faq.title")}</h2>
        </div>
        <ul className="mt-10 divide-y divide-border-subtle rounded-lg border border-border bg-surface">
          {FAQ_ITEMS.map((item, i) => {
            const isOpen = open === i;
            return (
              <li key={item.qKey}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors duration-fast hover:bg-surface-overlay"
                >
                  <span className="text-base font-medium text-text-primary">{t(item.qKey)}</span>
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
                  <div className="px-5 pb-5 text-sm text-text-secondary">{t(item.aKey)}</div>
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
  const { t } = useTranslation("marketing");
  const lang = marketingLangFromPath(useLocation().pathname);
  // Legal pages (and the subscription page) are Czech-only; on the English
  // site we flag that with a quiet "(in Czech)" note.
  const csNote =
    lang === "en" ? <span className="text-text-tertiary">{t("footer.csNote")}</span> : null;
  return (
    <footer className="border-t border-border-subtle">
      <div className="mx-auto max-w-[1200px] px-4 py-10 md:px-8">
        <div className="grid gap-8 md:grid-cols-4">
          <div className="md:col-span-1">
            <Link
              to={marketingPath("landing", lang)}
              className="flex items-center gap-2"
              aria-label="SimpleCRM"
            >
              <Logo size="sm" />
            </Link>
            <p className="mt-3 text-xs text-text-tertiary">{t("footer.tagline")}</p>
          </div>

          <div className="md:col-span-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              {t("footer.operatorHeading")}
            </h3>
            <address className="mt-3 text-xs not-italic leading-relaxed text-text-secondary">
              {LEGAL_ENTITY.fullName}
              <br />
              {LEGAL_ENTITY.address}
              <br />
              {t("footer.icoLabel")}: {LEGAL_ENTITY.ico}
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
              {t("footer.productHeading")}
            </h3>
            <nav
              aria-label={t("footer.productNavAria")}
              className="mt-3 flex flex-col gap-2 text-xs"
            >
              <Link
                to={marketingPath("landing", lang)}
                className="text-text-secondary hover:text-text-primary"
              >
                {t("footer.introLink")}
              </Link>
              <Link
                to={marketingPath("cenik", lang)}
                className="text-text-secondary hover:text-text-primary"
              >
                {t("footer.pricingLink")}
              </Link>
              <Link to="/predplatne" className="text-text-secondary hover:text-text-primary">
                {t("footer.subscriptionLink")}
                {csNote}
              </Link>
              <Link
                to={marketingPath("kontakt", lang)}
                className="text-text-secondary hover:text-text-primary"
              >
                {t("footer.contactLink")}
              </Link>
            </nav>
          </div>

          <div className="md:col-span-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              {t("footer.legalHeading")}
            </h3>
            <nav aria-label={t("footer.legalNavAria")} className="mt-3 flex flex-col gap-2 text-xs">
              <Link to="/obchodni-podminky" className="text-text-secondary hover:text-text-primary">
                {t("footer.terms")}
                {csNote}
              </Link>
              <Link
                to="/reklamacni-podminky"
                className="text-text-secondary hover:text-text-primary"
              >
                {t("footer.complaints")}
                {csNote}
              </Link>
              <Link
                to="/dodaci-a-platebni-podminky"
                className="text-text-secondary hover:text-text-primary"
              >
                {t("footer.delivery")}
                {csNote}
              </Link>
              <Link
                to="/ochrana-osobnich-udaju"
                className="text-text-secondary hover:text-text-primary"
              >
                {t("footer.privacy")}
                {csNote}
              </Link>
              <Link
                to="/zpracovatelska-smlouva"
                className="text-text-secondary hover:text-text-primary"
              >
                {t("footer.dpa")}
                {csNote}
              </Link>
              <Link to="/cookies" className="text-text-secondary hover:text-text-primary">
                {t("footer.cookies")}
                {csNote}
              </Link>
              <button
                type="button"
                onClick={() => openCookieSettings()}
                className="text-left text-text-secondary hover:text-text-primary"
              >
                {t("footer.cookieSettings")}
              </button>
            </nav>
          </div>
        </div>

        <div className="mt-8 border-t border-border-subtle pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              {t("footer.paymentMethods")}
            </span>
            {/* Official Comgate logo strip (Comgate + Visa + Mastercard) per
                help.comgate.cz/docs/cs/loga-a-udaje-na-webu. The site is
                light-only, so we use the light-background variant; the dark
                variant (…-dark-bg.png) sits alongside for a future dark theme. */}
            <a
              href={COMGATE_INFO.gatewayUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex"
              aria-label={t("footer.comgateAria")}
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

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-text-tertiary">© {new Date().getFullYear()} SimpleCRM</p>
          <MarketingLanguageSwitcher />
        </div>
      </div>
    </footer>
  );
}

export function LandingPage() {
  const { t } = useTranslation("marketing");
  usePageTitle(t("meta.landingTitle"));
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
