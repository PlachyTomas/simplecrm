export type CheckState = "all" | "some" | "none";

export function checkState(selected: number, total: number): CheckState {
  if (total === 0 || selected === 0) return "none";
  return selected >= total ? "all" : "some";
}

/** A checkbox that can also show "some of them": `some` renders as the
 * native indeterminate dash. Clicking anything but "all" selects all. */
export function TriStateCheckbox({
  state,
  onChange,
  ariaLabel,
  testId,
  disabled = false,
}: {
  state: CheckState;
  onChange: (on: boolean) => void;
  ariaLabel: string;
  testId?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="checkbox"
      ref={(el) => {
        if (el) el.indeterminate = state === "some";
      }}
      checked={state === "all"}
      disabled={disabled}
      aria-label={ariaLabel}
      data-testid={testId}
      onChange={() => onChange(state !== "all")}
      onClick={(e) => e.stopPropagation()}
      className="shrink-0"
    />
  );
}
