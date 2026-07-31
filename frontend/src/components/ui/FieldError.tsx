/**
 * THE app-wide field-validation contract (UI/UX research,
 * docs/research/2026-07-31-ui-ux-best-practices.md §forms):
 *
 * - validate when the user LEAVES a field (onBlur), never on every
 *   keystroke, and always on submit;
 * - the message lives directly under the field — never only in a toast
 *   or a top-of-page banner;
 * - state the REQUIREMENT, not just the violation ("Hodnota musí být
 *   číslo, např. 25 000" beats "Neplatná hodnota");
 * - clear the message the moment the input becomes valid;
 * - mark the input with `aria-invalid` and the danger border.
 *
 * New forms use these primitives; existing forms migrate as they're
 * touched.
 */

export function FieldError({ id, children }: { id?: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-xs text-danger">
      {children}
    </p>
  );
}

/** Merge onto an input's className while its value is invalid. */
export const INVALID_INPUT_CLASS = "border-danger focus:border-danger";
