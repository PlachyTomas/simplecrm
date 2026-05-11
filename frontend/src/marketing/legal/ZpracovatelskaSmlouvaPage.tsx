import { Link } from "react-router-dom";

import { LEGAL_ENTITY, LEGAL_EFFECTIVE_DATE } from "@/marketing/legal-entity";
import { LegalPageLayout, Section } from "@/marketing/legal/LegalPageLayout";

/** DPA — Smlouva o zpracování osobních údajů, příloha VOP, čl. 28 GDPR. */
export function ZpracovatelskaSmlouvaPage() {
  return (
    <LegalPageLayout
      title="Smlouva o zpracování osobních údajů (DPA)"
      effectiveDate={LEGAL_EFFECTIVE_DATE}
      lead={
        <>
          <p>
            <strong>Příloha č. 1</strong>{" "}
            <Link to="/obchodni-podminky" className="underline hover:text-text-primary">
              Všeobecných obchodních podmínek
            </Link>{" "}
            služby SimpleCRM.
          </p>
          <p className="mt-2">
            Tato smlouva tvoří nedílnou součást VOP a uzavírá se v souladu s článkem 28 obecného
            nařízení o ochraně osobních údajů (GDPR) mezi:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Správcem</strong> — Uživatelem služby SimpleCRM, specifikovaným při registraci
              a v daňových dokladech.
            </li>
            <li>
              <strong>Zpracovatelem</strong> — {LEGAL_ENTITY.fullName}, IČO {LEGAL_ENTITY.ico}, se
              sídlem {LEGAL_ENTITY.address}.
            </li>
          </ul>
        </>
      }
    >
      <Section id="cl-1" title="1. Předmět a povaha zpracování">
        <p>
          Zpracovatel zpracovává osobní údaje subjektů údajů, které Správce nahrává do Služby
          SimpleCRM (zejména kontakty zákazníků, obchodní korespondence, fakturační údaje), výhradně
          za účelem poskytování Služby po dobu trvání Smlouvy.
        </p>
      </Section>

      <Section id="cl-2" title="2. Kategorie subjektů údajů">
        <p>Zákazníci, obchodní partneři, zaměstnanci a kontaktní osoby Správce.</p>
      </Section>

      <Section id="cl-3" title="3. Kategorie osobních údajů">
        <p>
          Identifikační údaje (jméno, název firmy, IČO), kontaktní údaje (e-mail, telefon, adresa),
          údaje o obchodních vztazích.
        </p>
      </Section>

      <Section id="cl-4" title="4. Povinnosti zpracovatele">
        <p>Zpracovatel:</p>
        <ol className="list-[lower-alpha] space-y-1 pl-5">
          <li>zpracovává údaje pouze na základě pokynů Správce,</li>
          <li>zajišťuje mlčenlivost osob s přístupem k údajům,</li>
          <li>
            přijímá technická a organizační opatření dle čl. 32 GDPR (šifrování přenosů a úložiště,
            autentizace, logování, zálohy),
          </li>
          <li>
            bez zbytečného odkladu informuje Správce o porušení zabezpečení (max. do 48 hodin),
          </li>
          <li>pomáhá Správci s žádostmi subjektů údajů,</li>
          <li>na konci smlouvy údaje vymaže nebo vrátí Správci (dle volby),</li>
          <li>umožňuje audit Správci (předem oznámený, max. 1× ročně).</li>
        </ol>
      </Section>

      <Section id="cl-5" title="5. Subdodavatelé (sub-processors)">
        <p>
          Správce uděluje obecné povolení k zapojení subdodavatelů uvedených níže. O změně
          subdodavatele bude Správce informován s 30denním předstihem a má právo vznést námitku.
        </p>
        <p className="font-medium text-text-primary">Aktuální seznam:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Hetzner Online GmbH (hosting, DE)</li>
          <li>Comgate, a.s. (platby, CZ)</li>
          <li>Fakturační systém (CZ) — bude doplněno</li>
          <li>E-mailingový nástroj (EU) — bude doplněno</li>
        </ul>
      </Section>

      <Section id="cl-6" title="6. Předávání do třetích zemí">
        <p>Veškeré zpracování probíhá v EU/EHP. Předávání mimo EU neprobíhá.</p>
      </Section>

      <Section id="cl-7" title="7. Doba trvání">
        <p>
          Tato DPA je účinná po dobu trvání hlavní Smlouvy a 30 dnů po jejím ukončení (období na
          export dat).
        </p>
      </Section>
    </LegalPageLayout>
  );
}
