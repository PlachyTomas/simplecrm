/**
 * Landing-page interactive demo for the ARES IČO autofill.
 *
 * The real lookup endpoint sits behind auth (see
 * `app/api/v1/companies.py::lookup_registry`), so this demo can't call it
 * from the public marketing page. Instead it ships a curated fixture and
 * simulates the request/response timing so a visitor can feel the actual
 * UX: paste an 8-digit IČO, watch the form fields fill in.
 *
 * The dataset is illustrative — it mirrors what the production modal
 * (`AddCompanyModal`) renders on a real ARES hit. Three preset chips let
 * a visitor try the flow without typing.
 */

import { Building2, Check, RefreshCcw, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface AresRecord {
  ico: string;
  name: string;
  dic: string;
  address_street: string;
  address_city: string;
  address_zip: string;
  legal_form: string;
}

// Curated, well-known Czech companies. Data is illustrative for the demo.
const FIXTURE: Record<string, AresRecord> = {
  "27082440": {
    ico: "27082440",
    name: "Alza.cz a.s.",
    dic: "CZ27082440",
    address_street: "Jankovcova 1522/53",
    address_city: "Praha 7",
    address_zip: "170 00",
    legal_form: "Akciová společnost",
  },
  "25892533": {
    ico: "25892533",
    name: "Notino, s.r.o.",
    dic: "CZ25892533",
    address_street: "Londýnské náměstí 881/6",
    address_city: "Brno",
    address_zip: "639 00",
    legal_form: "Společnost s ručením omezeným",
  },
  "26168685": {
    ico: "26168685",
    name: "Heureka Group a.s.",
    dic: "CZ26168685",
    address_street: "Karolinská 706/3",
    address_city: "Praha 8",
    address_zip: "186 00",
    legal_form: "Akciová společnost",
  },
};

const PRESETS: { ico: string; label: string }[] = [
  { ico: "27082440", label: "Alza.cz" },
  { ico: "25892533", label: "Notino" },
  { ico: "26168685", label: "Heureka" },
];

type LookupState = "empty" | "typing" | "loading" | "success" | "not_found";

const DEBOUNCE_MS = 250;
const FAKE_LATENCY_MS = 600;

export function AresDemoSection() {
  const [ico, setIco] = useState("");
  const [result, setResult] = useState<AresRecord | null>(null);
  const [state, setState] = useState<LookupState>("empty");
  const latestQueryRef = useRef(0);

  useEffect(() => {
    if (!ico) {
      setResult(null);
      setState("empty");
      return;
    }
    if (!/^\d{8}$/.test(ico)) {
      setResult(null);
      setState("typing");
      return;
    }

    const queryId = ++latestQueryRef.current;
    setState("loading");

    const debounce = window.setTimeout(() => {
      const latency = window.setTimeout(() => {
        if (queryId !== latestQueryRef.current) return;
        const hit = FIXTURE[ico];
        if (hit && hit.ico) {
          setResult(hit);
          setState("success");
        } else {
          setResult(null);
          setState("not_found");
        }
      }, FAKE_LATENCY_MS);

      // Cancellation token for the latency timer.
      latestQueryRef.current = queryId;
      return () => window.clearTimeout(latency);
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(debounce);
  }, [ico]);

  const icoLength = ico.length;
  const filled = result ?? {
    ico: "",
    name: "",
    dic: "",
    address_street: "",
    address_city: "",
    address_zip: "",
    legal_form: "",
  };

  return (
    <section id="ares-demo" className="bg-surface">
      <div className="mx-auto max-w-[1200px] px-4 py-16 md:px-8 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium uppercase tracking-wider text-text-tertiary">
            ARES na jedno kliknutí
          </p>
          <h2 className="mt-2 text-3xl font-bold md:text-4xl">
            Zadejte IČO. Firma se doplní sama.
          </h2>
          <p className="mt-4 text-base text-text-secondary">
            Vyzkoušejte si přímo tady, jak rychle naplníme údaje z veřejného rejstříku ARES. Žádné
            přepisování z webu, žádné překlepy.
          </p>
        </div>

        <div className="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-5">
          <div className="rounded-lg border border-border bg-surface-overlay p-6 md:col-span-2">
            <div
              aria-hidden
              className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-md bg-accent-subtle text-accent"
            >
              <Sparkles size={20} strokeWidth={1.75} />
            </div>
            <label
              htmlFor="ares-demo-ico"
              className="block text-xs font-medium text-text-secondary"
            >
              IČO
            </label>
            <div className="mt-2 flex items-center justify-between gap-2">
              <input
                id="ares-demo-ico"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={ico}
                onChange={(e) => setIco(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="27082440"
                className="block h-10 w-full rounded-md border border-border bg-surface px-3 font-mono text-base text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
              />
              {state === "typing" || state === "loading" ? (
                <span className="font-mono text-xs tabular-nums text-text-tertiary">
                  {icoLength}/8
                </span>
              ) : null}
            </div>

            {state === "empty" ? (
              <p className="mt-3 text-xs text-text-tertiary">
                Zadejte 8 číslic — nebo vyzkoušejte jednu z firem níže.
              </p>
            ) : null}
            {state === "typing" ? (
              <p className="mt-3 text-xs text-text-tertiary">
                Pokračujte ve psaní — po 8 číslicích spustíme vyhledávání.
              </p>
            ) : null}
            {state === "loading" ? (
              <p
                className="mt-3 inline-flex items-center gap-2 text-xs text-text-tertiary"
                role="status"
              >
                <RefreshCcw size={12} strokeWidth={1.75} className="animate-spin" />
                Hledám v ARES…
              </p>
            ) : null}
            {state === "success" ? (
              <p className="mt-3 inline-flex items-center gap-1 text-xs text-success">
                <Check size={12} strokeWidth={1.75} /> Údaje doplněny z ARES
              </p>
            ) : null}
            {state === "not_found" ? (
              <p className="mt-3 text-xs text-warning" role="alert">
                IČO {ico} v ukázce není. Zkuste jedno z přednastavených.
              </p>
            ) : null}

            <p className="mt-5 text-xs font-medium uppercase tracking-wider text-text-tertiary">
              Vyzkoušet ukázku
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.ico}
                  type="button"
                  onClick={() => setIco(preset.ico)}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text-secondary transition-colors duration-fast hover:border-accent-border hover:text-text-primary"
                >
                  <Building2 size={12} strokeWidth={1.75} aria-hidden />
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface p-6 md:col-span-3">
            <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
              Náhled karty firmy
            </p>
            <div className="mt-4 space-y-4">
              <FilledField label="Název firmy" value={filled.name} placeholder="Doplní se z ARES" />
              <div className="grid grid-cols-2 gap-3">
                <FilledField label="DIČ" value={filled.dic} placeholder="—" mono />
                <FilledField label="Právní forma" value={filled.legal_form} placeholder="—" />
              </div>
              <FilledField label="Ulice" value={filled.address_street} placeholder="—" />
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <FilledField label="Město" value={filled.address_city} placeholder="—" />
                <FilledField label="PSČ" value={filled.address_zip} placeholder="—" mono />
              </div>
            </div>
            <p className="mt-5 text-xs text-text-tertiary">
              Skutečná aplikace volá veřejný rejstřík ARES živě. Tahle ukázka pracuje s pevnou sadou
              dat, ať to funguje i bez přihlášení.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function FilledField({
  label,
  value,
  placeholder,
  mono = false,
}: {
  label: string;
  value: string;
  placeholder: string;
  mono?: boolean;
}) {
  const filled = !!value;
  return (
    <div>
      <p className="text-xs font-medium text-text-secondary">{label}</p>
      <p
        className={
          "mt-1 min-h-10 rounded-md border border-border bg-surface-overlay px-3 py-2 text-sm transition-colors duration-fast " +
          (mono ? "font-mono" : "") +
          (filled ? "text-text-primary" : "text-text-tertiary")
        }
      >
        {filled ? value : placeholder}
      </p>
    </div>
  );
}
