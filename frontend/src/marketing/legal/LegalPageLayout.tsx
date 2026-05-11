import type { ReactNode } from "react";

import { usePageTitle } from "@/lib/usePageTitle";
import { Footer, Nav } from "@/marketing/LandingPage";

interface LegalPageLayoutProps {
  title: string;
  /** Optional intro / lead paragraph rendered under the title. */
  lead?: ReactNode;
  /** Optional effective date shown to the right of the title (e.g. "Účinnost: 1. 6. 2026"). */
  effectiveDate?: string;
  children: ReactNode;
}

/**
 * Shared chrome for every marketing legal page (Kontakt, VOP, Privacy, DPA,
 * Cookies, Předplatné). Renders the marketing Nav and Footer plus a typographic
 * content container suited for long-form Czech text.
 */
export function LegalPageLayout({ title, lead, effectiveDate, children }: LegalPageLayoutProps) {
  usePageTitle(title);
  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <Nav />
      <main className="mx-auto max-w-3xl px-4 py-12 md:px-8 md:py-16">
        <header className="border-b border-border-subtle pb-6">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
          {effectiveDate ? (
            <p className="mt-2 text-xs text-text-tertiary">Účinnost: {effectiveDate}</p>
          ) : null}
          {lead ? <div className="mt-4 text-base text-text-secondary">{lead}</div> : null}
        </header>
        <div className="mt-8 space-y-6 text-sm leading-relaxed text-text-secondary">
          {children}
        </div>
      </main>
      <Footer />
    </div>
  );
}

interface SectionProps {
  id?: string;
  title: string;
  children: ReactNode;
}

/** Numbered or named section used by the legal pages. */
export function Section({ id, title, children }: SectionProps) {
  return (
    <section id={id} className="space-y-3">
      <h2 className="text-lg font-semibold text-text-primary md:text-xl">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
