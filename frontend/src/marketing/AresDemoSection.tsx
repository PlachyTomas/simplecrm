/**
 * Landing-page interactive demo for the ARES company-ID autofill.
 *
 * Calls the public ARES REST API directly from the browser. ARES sets
 * `access-control-allow-origin: *`, so we don't need a backend proxy.
 * The marketing page can't use our own `/api/v1/companies/lookup-registry`
 * because that endpoint is auth-gated; this is the next-best thing and
 * keeps the demo using *real* data so visitors can paste their own company ID.
 *
 * Parsing mirrors `backend/app/services/business_registry.py::_parse_ares_payload`
 * so the visual fill matches what production renders. The exception is
 * `pravniForma` — ARES returns a numeric code (e.g. "121"); the production
 * modal stores the raw code, but for the marketing demo we look up a
 * human-readable label from a small table of common Czech forms, falling
 * back to a generic "legal form {code}" for codes outside the table.
 */

import type { ParseKeys } from "i18next";
import { Building2, Check, RefreshCcw, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

interface AresRecord {
  ico: string;
  name: string;
  dic: string;
  address_street: string;
  address_city: string;
  address_zip: string;
  legal_form_code: string;
}

const ARES_URL = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty";
const REQUEST_TIMEOUT_MS = 8_000;
const DEBOUNCE_MS = 350;

// Czech business-registry legal-form codes mapped to catalog keys. Covers
// the long tail of small businesses you'd realistically meet on a CRM
// landing page. Anything not listed falls back to `ares.legalFormFallback`.
const LEGAL_FORM_KEY: Record<string, ParseKeys<"marketing">> = {
  "100": "ares.legalForms.f100",
  "101": "ares.legalForms.f101",
  "102": "ares.legalForms.f102",
  "111": "ares.legalForms.f111",
  "112": "ares.legalForms.f112",
  "113": "ares.legalForms.f113",
  "117": "ares.legalForms.f117",
  "118": "ares.legalForms.f118",
  "121": "ares.legalForms.f121",
  "122": "ares.legalForms.f122",
  "141": "ares.legalForms.f141",
  "145": "ares.legalForms.f145",
  "161": "ares.legalForms.f161",
  "201": "ares.legalForms.f201",
  "205": "ares.legalForms.f205",
  "211": "ares.legalForms.f211",
  "301": "ares.legalForms.f301",
  "302": "ares.legalForms.f302",
  "325": "ares.legalForms.f325",
  "331": "ares.legalForms.f331",
  "352": "ares.legalForms.f352",
  "361": "ares.legalForms.f361",
  "421": "ares.legalForms.f421",
  "422": "ares.legalForms.f422",
  "501": "ares.legalForms.f501",
  "601": "ares.legalForms.f601",
  "641": "ares.legalForms.f641",
  "661": "ares.legalForms.f661",
  "706": "ares.legalForms.f706",
  "721": "ares.legalForms.f721",
  "731": "ares.legalForms.f731",
  "736": "ares.legalForms.f736",
  "741": "ares.legalForms.f741",
  "745": "ares.legalForms.f745",
  "751": "ares.legalForms.f751",
  "761": "ares.legalForms.f761",
  "771": "ares.legalForms.f771",
  "801": "ares.legalForms.f801",
  "804": "ares.legalForms.f804",
  "811": "ares.legalForms.f811",
  "907": "ares.legalForms.f907",
};

function legalFormLabel(code: string, t: TFunction<"marketing">): string {
  if (!code) return "";
  const key = LEGAL_FORM_KEY[code];
  return key ? t(key) : t("ares.legalFormFallback", { code });
}

const PRESETS: { ico: string; label?: string; labelKey?: ParseKeys<"marketing"> }[] = [
  { ico: "27082440", label: "Alza.cz" },
  { ico: "26168685", label: "Seznam.cz" },
  { ico: "27604977", labelKey: "ares.presetGoogle" },
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
    legal_form_code: asString(payload.pravniForma),
  };
}

export function AresDemoSection() {
  const { t } = useTranslation("marketing");
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
    legal_form_code: "",
  };

  return (
    <section id="ares-demo" className="bg-surface">
      <div className="mx-auto max-w-[1200px] px-4 py-16 md:px-8 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium uppercase tracking-wider text-text-tertiary">
            {t("ares.eyebrow")}
          </p>
          <h2 className="mt-2 text-3xl font-bold md:text-4xl">{t("ares.title")}</h2>
          <p className="mt-4 text-base text-text-secondary">{t("ares.subtitle")}</p>
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
              {t("ares.icoLabel")}
            </label>
            <div className="mt-2 flex items-center justify-between gap-2">
              <input
                id="ares-demo-ico"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={ico}
                onChange={(e) => setIco(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="12345678"
                className="block h-10 w-full rounded-md border border-border bg-surface px-3 font-mono text-base text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
              />
              {state === "typing" || state === "loading" ? (
                <span className="font-mono text-xs tabular-nums text-text-tertiary">
                  {icoLength}/8
                </span>
              ) : null}
            </div>

            {state === "empty" ? (
              <p className="mt-3 text-xs text-text-tertiary">{t("ares.hintEmpty")}</p>
            ) : null}
            {state === "typing" ? (
              <p className="mt-3 text-xs text-text-tertiary">{t("ares.hintTyping")}</p>
            ) : null}
            {state === "loading" ? (
              <p
                className="mt-3 inline-flex items-center gap-2 text-xs text-text-tertiary"
                role="status"
              >
                <RefreshCcw size={12} strokeWidth={1.75} className="animate-spin" />
                {t("ares.loading")}
              </p>
            ) : null}
            {state === "success" ? (
              <p className="mt-3 inline-flex items-center gap-1 text-xs text-success">
                <Check size={12} strokeWidth={1.75} /> {t("ares.success")}
              </p>
            ) : null}
            {state === "not_found" ? (
              <p className="mt-3 text-xs text-warning" role="alert">
                {t("ares.notFound", { ico })}
              </p>
            ) : null}
            {state === "error" ? (
              <p className="mt-3 text-xs text-danger" role="alert">
                {t("ares.error")}
              </p>
            ) : null}

            <p className="mt-5 text-xs font-medium uppercase tracking-wider text-text-tertiary">
              {t("ares.tryLabel")}
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
                  {preset.labelKey ? t(preset.labelKey) : preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface p-6 md:col-span-3">
            <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
              {t("ares.cardPreview")}
            </p>
            <div className="mt-4 space-y-4">
              <FilledField
                label={t("ares.fieldName")}
                value={filled.name}
                placeholder={t("ares.fieldNamePlaceholder")}
              />
              <div className="grid grid-cols-2 gap-3">
                <FilledField label={t("ares.fieldDic")} value={filled.dic} placeholder="—" mono />
                <FilledField
                  label={t("ares.fieldLegalForm")}
                  value={legalFormLabel(filled.legal_form_code, t)}
                  placeholder="—"
                />
              </div>
              <FilledField
                label={t("ares.fieldStreet")}
                value={filled.address_street}
                placeholder="—"
              />
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <FilledField
                  label={t("ares.fieldCity")}
                  value={filled.address_city}
                  placeholder="—"
                />
                <FilledField
                  label={t("ares.fieldZip")}
                  value={filled.address_zip}
                  placeholder="—"
                  mono
                />
              </div>
            </div>
            <p className="mt-5 text-xs text-text-tertiary">
              {t("ares.dataNotePre")}
              <a
                href="https://ares.gov.cz"
                target="_blank"
                rel="noreferrer noopener"
                className="underline hover:text-text-secondary"
              >
                ares.gov.cz
              </a>
              {t("ares.dataNotePost")}
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
