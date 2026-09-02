import { EVENT_LABEL_PALETTE } from "@/app/events/useEventLabels";
import { cn } from "@/lib/utils";

interface LabelColorSwatchesProps {
  value: string;
  onChange: (hex: string) => void;
  ariaLabel: string;
  /** Localized accessible name for one swatch. */
  swatchLabel: (hex: string) => string;
  /** Optional per-swatch testid factory. */
  testId?: (hex: string) => string;
  size?: "sm" | "md";
  disabled?: boolean;
}

/** The 8-swatch palette row used wherever a label color is chosen —
 * settings and both inline label-create flows. Swatches never steal focus
 * (mouseDown is prevented) so combobox dropdowns stay open. */
export function LabelColorSwatches({
  value,
  onChange,
  ariaLabel,
  swatchLabel,
  testId,
  size = "md",
  disabled = false,
}: LabelColorSwatchesProps) {
  return (
    // mouseDown is prevented on the whole row (gaps included) so a
    // near-miss between swatches never blurs a host combobox shut.
    <div
      className="flex items-center gap-1"
      role="group"
      aria-label={ariaLabel}
      onMouseDown={(e) => e.preventDefault()}
    >
      {EVENT_LABEL_PALETTE.map((hex) => (
        <button
          key={hex}
          type="button"
          aria-label={swatchLabel(hex)}
          aria-pressed={hex === value}
          disabled={disabled}
          data-testid={testId?.(hex)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange(hex)}
          className={cn(
            "shrink-0 rounded-full border-2 transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-50",
            size === "md" ? "h-5 w-5" : "h-4 w-4",
            hex === value ? "border-text-primary" : "border-transparent hover:border-border-strong",
          )}
          style={{ backgroundColor: hex }}
        />
      ))}
    </div>
  );
}
