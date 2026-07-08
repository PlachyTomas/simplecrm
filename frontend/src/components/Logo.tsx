import { cn } from "@/lib/utils";

interface LogoProps {
  /**
   * `"full"` renders the "SimpleCRM" wordmark; `"mark"` renders just the
   * compact "S" glyph for tight spots (e.g. a collapsed bar). Both carry the
   * trailing accent dot.
   */
  variant?: "full" | "mark";
  className?: string;
}

/**
 * SimpleCRM wordmark. Deliberately minimal and typographic ("Nic víc, nic
 * míň") with a single trailing accent dot as the brand mark. Presentational
 * only — wrap it in a `Link`/`NavLink` at the call site and give that link an
 * accessible label. The dot is decorative and hidden from assistive tech, so
 * the accessible name comes from the "SimpleCRM"/"S" text itself.
 */
export function Logo({ variant = "full", className }: LogoProps) {
  return (
    <span
      className={cn(
        "select-none font-semibold leading-none tracking-tight text-text-primary",
        className,
      )}
    >
      {variant === "mark" ? "S" : "SimpleCRM"}
      <span aria-hidden className="text-accent">
        .
      </span>
    </span>
  );
}
