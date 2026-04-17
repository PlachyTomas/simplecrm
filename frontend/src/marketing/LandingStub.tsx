import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";

export function LandingStub() {
  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <header className="border-b border-border-subtle">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-4 py-4 md:px-8">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-highlight text-text-on-accent"
            >
              <Sparkles size={18} strokeWidth={1.75} />
            </span>
            <span className="text-lg font-semibold">SimpleCRM</span>
          </div>
          <Link
            to="/login"
            className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
          >
            Přihlásit se
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-20 text-center md:px-8">
        <p className="mb-4 text-sm font-medium uppercase tracking-wider text-text-tertiary">
          Beta verze
        </p>
        <h1 className="text-4xl font-bold leading-tight md:text-5xl">
          CRM pro prodej. <span className="text-accent">Nic víc, nic míň.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-base text-text-secondary md:text-lg">
          Jednoduchý český CRM pro malé prodejní týmy. Funguje s ARES. 30 dní zdarma.
        </p>
        <Link
          to="/login"
          className="mt-8 inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
        >
          Vyzkoušet 30 dní zdarma
        </Link>
      </main>
    </div>
  );
}
