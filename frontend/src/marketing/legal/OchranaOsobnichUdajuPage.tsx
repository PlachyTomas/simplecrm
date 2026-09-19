import { Link } from "react-router-dom";

import { LEGAL_ENTITY, LEGAL_EFFECTIVE_DATE } from "@/marketing/legal-entity";
import { LegalPageLayout, Section } from "@/marketing/legal/LegalPageLayout";

/** Zásady zpracování osobních údajů — Art 13/14 GDPR + Czech ÚOOÚ metodika. */
export function OchranaOsobnichUdajuPage() {
  return (
    <LegalPageLayout
      title="Zásady ochrany osobních údajů"
      effectiveDate={LEGAL_EFFECTIVE_DATE}
      lead={
        <p>
          Tyto zásady popisují, jakým způsobem zpracováváme osobní údaje uživatelů služby SimpleCRM.
          Splňují požadavky čl. 13 a 14 obecného nařízení o ochraně osobních údajů (GDPR) a metodiky
          Úřadu pro ochranu osobních údajů (ÚOOÚ).
        </p>
      }
    >
      <Section id="spravce" title="1. Správce osobních údajů">
        <address className="not-italic">
          <p className="font-medium text-text-primary">{LEGAL_ENTITY.fullName}</p>
          <p>{LEGAL_ENTITY.address}</p>
          <p>IČO: {LEGAL_ENTITY.ico}</p>
          <p className="mt-1 text-xs text-text-tertiary">{LEGAL_ENTITY.registryClause}</p>
          <p className="mt-2">
            Kontakt:{" "}
            <a href={`mailto:${LEGAL_ENTITY.email}`} className="underline hover:text-text-primary">
              {LEGAL_ENTITY.email}
            </a>
            .
          </p>
        </address>
      </Section>

      <Section id="udaje" title="2. Jaké údaje zpracováváme a na jakém základě">
        <article className="rounded-md border border-border-subtle bg-surface-overlay p-4">
          <h3 className="font-semibold text-text-primary">
            a) Identifikační a kontaktní údaje uživatelské registrace
          </h3>
          <p className="mt-1 text-xs text-text-tertiary">
            jméno, příjmení, e-mail, telefon, firma, IČO, fakturační adresa
          </p>
          <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="text-text-tertiary">Účel:</dt>
            <dd>plnění smlouvy, fakturace</dd>
            <dt className="text-text-tertiary">Právní základ:</dt>
            <dd>čl. 6 odst. 1 písm. b) GDPR (smlouva), čl. 6 odst. 1 písm. c) GDPR (účetnictví)</dd>
            <dt className="text-text-tertiary">Doba uchování:</dt>
            <dd>
              po dobu trvání smlouvy a dále po dobu, po kterou musíme uchovávat účetní a daňové
              doklady (až 10 let)
            </dd>
          </dl>
        </article>

        <article className="rounded-md border border-border-subtle bg-surface-overlay p-4">
          <h3 className="font-semibold text-text-primary">b) Údaje o užívání služby</h3>
          <p className="mt-1 text-xs text-text-tertiary">
            záznamy o přihlášení a o akcích provedených v aplikaci (kdo, co a kdy)
          </p>
          <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="text-text-tertiary">Účel:</dt>
            <dd>zabezpečení, audit, technická podpora</dd>
            <dt className="text-text-tertiary">Právní základ:</dt>
            <dd>
              čl. 6 odst. 1 písm. f) GDPR — oprávněný zájem na zabezpečení účtů, prokazatelnosti
              změn dat a řešení požadavků podpory
            </dd>
            <dt className="text-text-tertiary">Doba uchování:</dt>
            <dd>po dobu trvání smlouvy a dále do smazání organizace</dd>
          </dl>
          <p className="mt-2 text-xs text-text-tertiary">
            IP adresu neukládáme; využíváme ji pouze při zpracování požadavku k omezení jeho
            četnosti.
          </p>
        </article>

        <article className="rounded-md border border-border-subtle bg-surface-overlay p-4">
          <h3 className="font-semibold text-text-primary">
            c) Obchodní sdělení stávajícím zákazníkům
          </h3>
          <p className="mt-1 text-xs text-text-tertiary">kontaktní e-mail zákazníka</p>
          <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="text-text-tertiary">Účel:</dt>
            <dd>případné zasílání informací o našich vlastních obdobných službách</dd>
            <dt className="text-text-tertiary">Právní základ:</dt>
            <dd>
              čl. 6 odst. 1 písm. f) GDPR — oprávněný zájem na informování stávajících zákazníků, §
              7 odst. 3 zákona č. 480/2004 Sb.
            </dd>
            <dt className="text-text-tertiary">Doba uchování:</dt>
            <dd>do odmítnutí, které lze učinit odpovědí na kteroukoli takovou zprávu</dd>
          </dl>
        </article>
      </Section>

      <Section id="prijemci" title="3. Příjemci osobních údajů">
        <p>Vaše údaje předáváme těmto příjemcům:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Hetzner Online GmbH (Německo) — provoz aplikace a databáze,</li>
          <li>Comgate, a.s. (Česká republika) — platební brána,</li>
          <li>
            Zoho Corporation B.V. (datacentrum Amsterdam, Nizozemsko) — odesílání e-mailů z aplikace
            (potvrzení, faktury, upozornění),
          </li>
          <li>
            Google Ireland Limited, resp. Google LLC — přihlášení přes účet Google (e-mail, jméno,
            profilový obrázek, identifikátor účtu), volitelné propojení s Kalendářem Google (obsah
            událostí, e-mail propojeného účtu, přístupové tokeny) a písma Google Fonts načítaná při
            zobrazení našich webových stránek (IP adresa návštěvníka),
          </li>
          <li>
            Cloudflare, Inc. — příjem e-mailů přeposlaných na adresu v doméně in.simplecrm.cz
            (funkce Smart BCC), včetně obsahu zprávy a příloh,
          </li>
          <li>případně účetní, v rozsahu fakturačních údajů.</li>
        </ul>
        <p>
          Zadáte-li IČO, dotazujeme se na veřejný rejstřík ARES vedený Ministerstvem financí ČR.
        </p>
        <p>
          Fakturační agendu vedeme ve vlastní aplikaci — žádný externí fakturační systém k Vašim
          údajům přístup nemá. Aplikaci a databázi provozujeme u společnosti Hetzner Online GmbH v
          Německu. U příjemců Google a Cloudflare může dojít k předání údajů do Spojených států
          amerických; předání se opírá o standardní smluvní doložky podle čl. 46 odst. 2 písm. c)
          GDPR obsažené ve smluvních podmínkách těchto příjemců.
        </p>
        <p>
          Informace získané z rozhraní Google API používáme v souladu s Google API Services User
          Data Policy včetně požadavků Limited Use.
        </p>
      </Section>

      <Section id="prava" title="4. Práva subjektů údajů">
        <p>Máte právo:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>na přístup ke svým údajům (čl. 15 GDPR),</li>
          <li>na opravu (čl. 16),</li>
          <li>na výmaz / „zapomenutí" (čl. 17),</li>
          <li>na omezení zpracování (čl. 18),</li>
          <li>na přenositelnost (čl. 20),</li>
          <li>vznést námitku proti zpracování (čl. 21),</li>
          <li>odvolat souhlas (čl. 7 odst. 3),</li>
          <li>
            podat stížnost u Úřadu pro ochranu osobních údajů (
            <a
              href="https://uoou.gov.cz"
              target="_blank"
              rel="noreferrer noopener"
              className="underline hover:text-text-primary"
            >
              uoou.gov.cz
            </a>
            ).
          </li>
        </ul>
        <p>
          Pro uplatnění práv kontaktujte:{" "}
          <a href={`mailto:${LEGAL_ENTITY.email}`} className="underline hover:text-text-primary">
            {LEGAL_ENTITY.email}
          </a>
          .
        </p>
      </Section>

      <Section id="zabezpeceni" title="5. Zabezpečení">
        <p>
          Osobní údaje chráníme technickými a organizačními opatřeními přiměřenými rizikům
          zpracování (čl. 32 GDPR), zejména šifrovaným přenosem dat, řízením přístupů, oddělením dat
          jednotlivých organizací a evidencí přístupů našich pověřených osob k datům zákazníků.
        </p>
      </Section>

      <Section id="zpracovatel" title="6. Zpracování údajů v CRM (postavení zpracovatele)">
        <p>
          Pokud nahráváte do SimpleCRM osobní údaje svých zákazníků, jsme v postavení zpracovatele
          dle čl. 28 GDPR. Vztah řídí samostatná{" "}
          <Link to="/zpracovatelska-smlouva" className="underline hover:text-text-primary">
            Smlouva o zpracování osobních údajů (DPA)
          </Link>
          , která je přílohou{" "}
          <Link to="/obchodni-podminky" className="underline hover:text-text-primary">
            VOP
          </Link>
          .
        </p>
        <p>
          Je-li v organizaci zákazníka zapnuto sledování e-mailů, zaznamenáváme jako zpracovatel
          otevření zprávy a kliknutí na odkaz ve vazbě na e-mailovou adresu příjemce; podrobnosti
          stanoví čl. 9 DPA.
        </p>
      </Section>

      <Section id="aktualnost" title="7. Aktuálnost">
        <p>
          Tyto zásady jsou účinné od {LEGAL_EFFECTIVE_DATE}. Aktuální verze je vždy zveřejněna na
          simplecrm.cz/ochrana-osobnich-udaju.
        </p>
      </Section>
    </LegalPageLayout>
  );
}
