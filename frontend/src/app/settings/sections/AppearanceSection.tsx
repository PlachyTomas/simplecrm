import { ThemeToggle } from "@/lib/ThemeToggle";

export function AppearanceSection() {
  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold">Vzhled</h2>
      <p className="mt-1 text-sm text-text-tertiary">
        Vyberte světlý nebo tmavý motiv. Volba se ukládá lokálně v prohlížeči.
      </p>
      <div className="mt-4">
        <ThemeToggle />
      </div>
    </section>
  );
}
