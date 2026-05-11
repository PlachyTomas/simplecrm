type PlanCode = "monthly" | "annual";

interface RecurringPaymentConsentProps {
  selected: PlanCode | null;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled: boolean;
}

/**
 * Card-on-File consent block — required at the moment of the first charge
 * by Visa/Mastercard rules + Comgate's opakované-platby docs. The five
 * bullets mirror help.comgate.cz/docs/opakovane-platby item-by-item
 * (amount, frequency, duration, receipt, advance notice).
 *
 * Used both by the in-app ChoosePlanModal in Settings → Předplatné and by
 * the TrialExpiredGate. Both routes ultimately call the same
 * `initial-payment-init` endpoint, so the consent moment must gate both.
 */
export function RecurringPaymentConsent({
  selected,
  checked,
  onChange,
  disabled,
}: RecurringPaymentConsentProps) {
  const periodLabel =
    selected === "annual" ? "ročně" : selected === "monthly" ? "měsíčně" : "ve zvoleném období";
  return (
    <div className="rounded-md border border-border-subtle bg-surface-overlay p-4">
      <p className="text-sm font-medium text-text-primary">Opakované platby (Card-on-File)</p>
      <ul className="mt-2 space-y-1 text-xs text-text-secondary">
        <li>
          • Z vaší platební karty budeme pravidelně strhávat částku odpovídající plánu × počtu
          uživatelských licencí ({periodLabel}).
        </li>
        <li>• Platby trvají do doby, než je zrušíte.</li>
        <li>• Po každém stržení vám e-mailem zašleme daňový doklad.</li>
        <li>• O jakékoli změně ceny vás budeme informovat nejméně 30 dní předem.</li>
        <li>
          • Opakované platby zrušíte v Nastavení → Předplatné nebo e-mailem na podpora — viz{" "}
          <a
            href="/predplatne"
            target="_blank"
            rel="noreferrer noopener"
            className="underline hover:text-text-primary"
          >
            Předplatné a platby
          </a>
          .
        </li>
      </ul>
      <label className="mt-3 flex items-start gap-2 text-sm text-text-primary">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
          aria-required="true"
        />
        <span>
          Souhlasím s opakovanými platbami za výše uvedených podmínek a s{" "}
          <a
            href="/obchodni-podminky#cl-6"
            target="_blank"
            rel="noreferrer noopener"
            className="underline hover:text-text-primary"
          >
            čl. 6 Obchodních podmínek
          </a>
          .
        </span>
      </label>
    </div>
  );
}
