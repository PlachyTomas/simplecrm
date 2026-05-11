/**
 * Landing-page interactive demo for the ARES IČO autofill.
 *
 * Calls the public ARES REST API directly from the browser. ARES sets
 * `access-control-allow-origin: *`, so we don't need a backend proxy.
 * The marketing page can't use our own `/api/v1/companies/lookup-registry`
 * because that endpoint is auth-gated; this is the next-best thing and
 * keeps the demo using *real* data so visitors can paste their own IČO.
 *
 * Parsing mirrors `backend/app/services/business_registry.py::_parse_ares_payload`
 * so the visual fill matches what production renders. The exception is
 * `pravniForma` — ARES returns a numeric code (e.g. "121"); the production
 * modal stores the raw code, but for the marketing demo we look up a
 * human-readable label from a small table of common Czech forms, falling
 * back to "Právní forma {code}" for codes outside the table.
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

const ARES_URL = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty";
const REQUEST_TIMEOUT_MS = 8_000;
const DEBOUNCE_MS = 350;

// Czech business-registry legal-form codes. Covers the long tail of small
// businesses you'd realistically meet on a CRM landing page. Anything not
// listed falls back to "Právní forma {code}" so users still see *something*.
const LEGAL_FORM_LABELS: Record<string, string> = {
  "100": "Podnikající fyzická osoba",
  "101": "Samostatně hospodařící rolník",
  "102": "Podnikající fyzická osoba",
  "111": "Veřejná obchodní společnost",
  "112": "Společnost s ručením omezeným",
  "113": "Komanditní společnost",
  "117": "Nadace",
  "118": "Nadační fond",
  "121": "Akciová společnost",
  "122": "Obecně prospěšná společnost",
  "141": "Obecně prospěšná společnost",
  "145": "Společenství vlastníků jednotek",
  "161": "Ústav",
  "201": "Zemědělské družstvo",
  "205": "Družstvo",
  "211": "Družstevní podnik zemědělský",
  "301": "Státní podnik",
  "302": "Národní podnik",
  "325": "Organizační složka státu",
  "331": "Příspěvková organizace",
  "352": "Správa železniční dopravní cesty",
  "361": "Veřejnoprávní instituce",
  "421": "Zahraniční osoba",
  "422": "Organizační složka zahraniční osoby",
  "501": "Odštěpný závod",
  "601": "Vysoká škola",
  "641": "Školská právnická osoba",
  "661": "Veřejná výzkumná instituce",
  "706": "Spolek",
  "721": "Církevní organizace",
  "731": "Organizační jednotka sdružení",
  "736": "Pobočný spolek",
  "741": "Stavovská organizace",
  "745": "Nadace",
  "751": "Nadační fond",
  "761": "Honební společenstvo",
  "771": "Zájmové sdružení právnických osob",
  "801": "Obec",
  "804": "Kraj",
  "811": "Městská část",
  "907": "Zahraniční politická strana",
};

function labelLegalForm(code: string | undefined): string {
  if (!code) return "";
  return LEGAL_FORM_LABELS[code] ?? `Právní forma ${code}`;
}

const PRESETS: { ico: string; label: string }[] = [
  { ico: "27082440", label: "Alza.cz" },
  { ico: "26168685", label: "Seznam.cz" },
  { ico: "27604977", label: "Google ČR" },
];

type LookupState = "empty" | "typing" | "loading" | "success" | "not_found" | "error";

interface AresApiResponse {
  ico?: unknown;
  obchodniJmeno?: unknown;
  dic?: unknown;
  pravniForma?: unknown;
  sidlo?: unknown;
}

interface AresSidlo {
  nazevUlice?: unknown;
  cisloDomovni?: unknown;
  cisloOrientacni?: unknown;
  nazevObce?: unknown;
  psc?: unknown;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function formatStreet(sidlo: AresSidlo): string {
  const ulice = asString(sidlo.nazevUlice);
  const dom = sidlo.cisloDomovni;
  const ori = sidlo.cisloOrientacni;
  const parts: string[] = [];
  if (ulice) parts.push(ulice);
  if (typeof dom === "number") {
    parts.push(typeof ori === "number" ? `${dom}/${ori}` : String(dom));
  }
  return parts.join(" ");
}

function formatPsc(psc: unknown): string {
  if (typeof psc === "number") {
    const padded = psc.toString().padStart(5, "0");
    return `${padded.slice(0, 3)} ${padded.slice(3)}`;
  }
  if (typeof psc === "string" && /^\d{5}$/.test(psc)) {
    return `${psc.slice(0, 3)} ${psc.slice(3)}`;
  }
  return "";
}

function parseAres(payload: AresApiResponse): AresRecord | null {
  const ico = asString(payload.ico);
  const name = asString(payload.obchodniJmeno);
  if (!ico || !name) return null;
  const sidlo: AresSidlo =
    payload.sidlo && typeof payload.sidlo === "object" ? (payload.sidlo as AresSidlo) : {};
  return {
    ico,
    name,
    dic: asString(payload.dic),
    address_street: formatStreet(sidlo),
    address_city: asString(sidlo.nazevObce),
    address_zip: formatPsc(sidlo.psc),
    legal_form: labelLegalForm(asString(payload.pravniForma)),
  };
}

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
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const debounce = window.setTimeout(() => {
      fetch(`${ARES_URL}/${ico}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      })
        .then(async (res) => {
          if (queryId !== latestQueryRef.current) return;
          if (res.status === 404) {
            setResult(null);
            setState("not_found");
            return;
          }
          if (!res.ok) throw new Error(`ARES HTTP ${res.status}`);
          const payload = (await res.json()) as AresApiResponse;
          const parsed = parseAres(payload);
          if (!parsed) {
            setResult(null);
            setState("error");
            return;
          }
          setResult(parsed);
          setState("success");
        })
        .catch((err: unknown) => {
          if (queryId !== latestQueryRef.current) return;
          if (err instanceof DOMException && err.name === "AbortError") return;
          setResult(null);
          setState("error");
        })
        .finally(() => window.clearTimeout(timeout));
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(debounce);
      window.clearTimeout(timeout);
      controller.abort();
    };
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
                IČO {ico} jsme v ARES nenašli. Zkontrolujte zadání.
              </p>
            ) : null}
            {state === "error" ? (
              <p className="mt-3 text-xs text-danger" role="alert">
                ARES momentálně neodpovídá. Zkuste to za chvíli znovu.
              </p>
            ) : null}

            <p className="mt-5 text-xs font-medium uppercase tracking-wider text-text-tertiary">
              Vyzkoušet
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
              Data jdou živě z veřejného rejstříku ARES (
              <a
                href="https://ares.gov.cz"
                target="_blank"
                rel="noreferrer noopener"
                className="underline hover:text-text-secondary"
              >
                ares.gov.cz
              </a>
              ). V aplikaci to funguje stejně — jen rovnou přidáte firmu do CRM.
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
