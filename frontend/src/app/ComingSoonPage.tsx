import { Wrench } from "lucide-react";

interface ComingSoonPageProps {
  title: string;
  description: string;
}

export function ComingSoonPage({ title, description }: ComingSoonPageProps) {
  return (
    <section className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <div
        aria-hidden
        className="inline-flex h-12 w-12 items-center justify-center rounded-md bg-accent-subtle text-accent"
      >
        <Wrench size={24} strokeWidth={1.75} />
      </div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="max-w-md text-sm text-text-secondary">{description}</p>
    </section>
  );
}
