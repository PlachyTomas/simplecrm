import { openCookieSettings } from "@/marketing/cookie-consent-controls";
import { LEGAL_EFFECTIVE_DATE } from "@/marketing/legal-entity";
import { LegalPageLayout, Section } from "@/marketing/legal/LegalPageLayout";

/** Cookies — § 89 odst. 3 zák. č. 127/2005 Sb. (opt-in režim od 1. 1. 2022). */
export function CookiesPage() {
  return (
    <LegalPageLayout
      title="Zásady používání cookies"
      effectiveDate={LEGAL_EFFECTIVE_DATE}
      lead={
        <p>
          Tato stránka vysvětluje, jaké cookies a podobné technologie SimpleCRM používá a jak můžete
          spravovat svůj souhlas. Od 1. 1. 2022 platí v ČR opt-in režim podle § 89 odst. 3 zákona č.
          127/2005 Sb., o elektronických komunikacích.
        </p>
      }
    >
      <Section id="co-jsou" title="1. Co jsou cookies">
        <p>
          Cookies jsou malé textové soubory, které se ukládají do vašeho zařízení při návštěvě
          webové stránky. Slouží k zapamatování si vašeho stavu (např. přihlášení) nebo k měření
          návštěvnosti.
        </p>
      </Section>

      <Section id="ktere" title="2. Které cookies používáme">
        <article>
          <h3 className="font-semibold text-text-primary">a) Nezbytné cookies (bez souhlasu)</h3>
          <p className="text-xs text-text-tertiary">
            § 89 odst. 3 zák. č. 127/2005 Sb. — výjimka z opt-in pro technické cookies.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <code className="rounded bg-surface-overlay px-1 py-0.5 text-xs">session</code> —
              udržení přihlášení, doba: 1 hodina
            </li>
            <li>
              <code className="rounded bg-surface-overlay px-1 py-0.5 text-xs">
                simplecrm.cookie-consent.v1
              </code>{" "}
              — záznam vaší volby cookies, doba: 12 měsíců
            </li>
          </ul>
        </article>

        <article>
          <h3 className="font-semibold text-text-primary">b) Analytické cookies (souhlas)</h3>
          <p>
            V tuto chvíli žádné analytické cookies nenasazujeme. Pokud v budoucnu zavedeme
            analytiku, půjde primárně o nástroje bez sledovacích cookies (např. Plausible
            Analytics).
          </p>
        </article>

        <article>
          <h3 className="font-semibold text-text-primary">c) Preferenční cookies (souhlas)</h3>
          <p>
            Slouží k zapamatování si vašich preferencí (zvolené téma vzhledu). Bez souhlasu nejsou
            uloženy.
          </p>
        </article>

        <article>
          <h3 className="font-semibold text-text-primary">d) Marketingové cookies</h3>
          <p>Nepoužíváme.</p>
        </article>
      </Section>

      <Section id="sprava" title="3. Jak souhlas spravovat">
        <p>
          Své preference můžete kdykoli změnit kliknutím na tlačítko níže nebo na odkaz „Nastavení
          cookies" v patičce webu. Předzaškrtnuté checkboxy nepoužíváme; tlačítka „Přijmout vše" a
          „Odmítnout vše" jsou v souladu se stanovisky ÚOOÚ rovnocenná.
        </p>
        <p>
          <button
            type="button"
            onClick={() => openCookieSettings()}
            className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent hover:bg-accent-hover"
          >
            Otevřít nastavení cookies
          </button>
        </p>
      </Section>

      <Section id="doba" title="4. Doba uchování a další informace">
        <p>
          Konkrétní doby uchování jsou uvedeny u jednotlivých cookies výše. Pro otázky se obraťte na
          podporu — viz{" "}
          <a href="/kontakt" className="underline hover:text-text-primary">
            Kontakt
          </a>
          .
        </p>
      </Section>
    </LegalPageLayout>
  );
}
