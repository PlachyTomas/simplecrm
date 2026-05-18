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
            přijímá technická a organizační opatření dle čl. 32 GDPR (šifrovaný přenos
            HTTPS/TLS, autentizace, logování přístupů, denní zálohy mimo produkční prostředí),
          </li>
          <li>
            bez zbytečného odkladu informuje Správce o porušení zabezpečení (max. do 72 hodin v
            souladu s čl. 33 GDPR),
          </li>
          <li>pomáhá Správci s žádostmi subjektů údajů,</li>
          <li>na konci smlouvy údaje vymaže nebo vrátí Správci (dle volby),</li>
          <li>umožňuje audit Správci (předem oznámený, max. 1× ročně),</li>
          <li>
            informuje Správce o všech provozních přístupech svých pověřených osob k jeho datům
            (viz čl. 5 níže).
          </li>
        </ol>
      </Section>

      <Section id="cl-5" title="5. Provozní přístup pověřených osob Zpracovatele">
        <p>
          5.1 Pro účely zákaznické podpory, řešení incidentů, údržbu a kontrolu integrity
          dat má omezený okruh pověřených osob Zpracovatele (tzv. „super-administrátor")
          technickou možnost:
        </p>
        <ol className="list-[lower-alpha] space-y-1 pl-5">
          <li>
            zobrazit metadata organizace Správce (název, plán, počet uživatelů, datum poslední
            aktivity, billing údaje),
          </li>
          <li>zobrazit seznam uživatelských účtů (jméno, e-mail, role),</li>
          <li>zobrazit fakturační historii a aktivitu předplatného,</li>
          <li>
            přihlásit se jménem konkrétního uživatele Správce („impersonace") pro účely
            replikace nahlášeného problému; v takovém režimu má pověřená osoba stejné
            oprávnění jako daný uživatel.
          </li>
        </ol>
        <p>
          5.2 Tento přístup je výslovným pokynem Správce ve smyslu čl. 28 odst. 3 písm. a) GDPR
          a uděluje se jím obecné povolení k uvedeným úkonům po dobu trvání Smlouvy. Pověřené
          osoby jsou vázány mlčenlivostí dle čl. 4 písm. b).
        </p>
        <p>
          5.3 Každý jednotlivý přístup je auditně zaznamenán a Správci dostupný v reálném čase
          v administraci pod{" "}
          <em>Nastavení → Přístup operátora</em>. Záznam obsahuje datum, typ úkonu, identitu
          pověřené osoby a — v případě impersonace — identitu uživatele, jehož jménem byl
          přístup proveden.
        </p>
        <p>
          5.4 Správce může kdykoli vznést námitku proti konkrétnímu přístupu na{" "}
          <a href={`mailto:${LEGAL_ENTITY.email}`} className="underline hover:text-text-primary">
            {LEGAL_ENTITY.email}
          </a>
          .
        </p>
      </Section>

      <Section id="cl-6" title="6. Subdodavatelé (sub-processors)">
        <p>
          Správce uděluje obecné povolení k zapojení subdodavatelů uvedených níže. O změně
          subdodavatele bude Správce informován s 30denním předstihem a má právo vznést námitku.
        </p>
        <p className="font-medium text-text-primary">Aktuální seznam:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Hetzner Online GmbH (hosting a denní zálohy, DE)</li>
          <li>Comgate, a.s. (platební brána, CZ)</li>
          <li>
            Zoho Corporation B.V. (transakční a marketingová e-mailová komunikace,
            datacentrum Amsterdam, NL)
          </li>
        </ul>
        <p className="text-xs text-text-tertiary">
          Fakturační agendu vede Zpracovatel in-house ve vlastní aplikaci — žádný externí
          fakturační systém k osobním údajům Subjektů nemá přístup.
        </p>
      </Section>

      <Section id="cl-7" title="7. Předávání do třetích zemí">
        <p>Veškeré zpracování probíhá v EU/EHP. Předávání mimo EU neprobíhá.</p>
      </Section>

      <Section id="cl-8" title="8. Doba trvání">
        <p>
          Tato DPA je účinná po dobu trvání hlavní Smlouvy a 30 dnů po jejím ukončení (období na
          export dat).
        </p>
      </Section>
    </LegalPageLayout>
  );
}
