import { Compass } from "lucide-react";
import { Link } from "react-router-dom";

import { ThemeToggle } from "@/lib/ThemeToggle";
import { usePageTitle } from "@/lib/usePageTitle";

export function NotFoundPage() {
  usePageTitle("Stránka nenalezena");
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle variant="compact" />
      </div>
      <main className="w-full max-w-md rounded-lg border border-border bg-surface p-6 text-center shadow-md">
        <div
          aria-hidden
          className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-md bg-accent-subtle text-accent"
        >
          <Compass size={24} strokeWidth={1.75} />
        </div>
        <h1 className="text-2xl font-semibold">Stránka nenalezena</h1>
        <p className="mt-3 text-base text-text-secondary">
          Zkontrolujte adresu nebo se vraťte na úvodní stránku.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
        >
          Zpět na úvod
        </Link>
      </main>
    </div>
  );
}
