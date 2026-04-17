import { Moon, Sparkles, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { applyTheme, resolveInitialTheme, type Theme } from "@/theme/theme";

export function App() {
  const [theme, setTheme] = useState<Theme>(() => resolveInitialTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return (
    <div className="min-h-full bg-bg text-text-primary">
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
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Přepnout na světlý režim" : "Přepnout na tmavý režim"}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface-overlay text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary"
          >
            {theme === "dark" ? (
              <Sun size={18} strokeWidth={1.75} />
            ) : (
              <Moon size={18} strokeWidth={1.75} />
            )}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 py-12 md:px-8">
        <section className="mx-auto max-w-3xl text-center">
          <p className="mb-4 text-sm font-medium uppercase tracking-wider text-text-tertiary">
            Brzy v provozu
          </p>
          <h1 className="text-4xl font-bold leading-tight md:text-5xl">
            CRM pro prodej. <span className="text-accent">Nic víc,</span>{" "}
            <span className="text-accent">nic míň.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base text-text-secondary md:text-lg">
            Jednoduchý český CRM pro malé prodejní týmy. Funguje s ARES. 30 dní zdarma.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover active:bg-accent-active"
            >
              Vyzkoušet 30 dní zdarma
            </button>
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface-overlay px-5 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary"
            >
              Prohlédnout funkce
            </button>
          </div>
        </section>

        <section className="mx-auto mt-16 grid max-w-5xl gap-4 md:grid-cols-3">
          {TOKEN_DEMO_CARDS.map((card) => (
            <article
              key={card.title}
              className="rounded-lg border border-border bg-surface p-6 shadow-sm transition-all duration-fast hover:-translate-y-px hover:bg-surface-elevated hover:shadow-md"
            >
              <div
                className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-md ${card.iconBg} ${card.iconText}`}
              >
                <card.icon size={20} strokeWidth={1.75} />
              </div>
              <h2 className="text-base font-semibold">{card.title}</h2>
              <p className="mt-2 text-sm text-text-secondary">{card.description}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}

const TOKEN_DEMO_CARDS = [
  {
    title: "ARES integrace",
    description:
      "Zadáte IČO a vyplní se název, adresa, DIČ i právní forma. Bez přepisování z webu.",
    icon: Sparkles,
    iconBg: "bg-accent-subtle",
    iconText: "text-accent",
  },
  {
    title: "Automatické uvolňování firem",
    description:
      "Firma přiřazená obchodníkovi bez obchodu 365 dní se sama vrátí do pool společného využití.",
    icon: Sun,
    iconBg: "bg-warning-subtle",
    iconText: "text-warning",
  },
  {
    title: "Bez zbytečností",
    description:
      "Žádné kalendáře, žádné e-mailové sekvence, žádná marketingová automatizace. Jen prodej.",
    icon: Moon,
    iconBg: "bg-highlight-subtle",
    iconText: "text-text-primary",
  },
] as const;
