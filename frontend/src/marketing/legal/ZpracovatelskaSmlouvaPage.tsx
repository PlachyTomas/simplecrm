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
              a na fakturách.
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
          SimpleCRM nebo které do ní přicházejí jeho jednáním (zejména kontakty zákazníků, obchodní
          korespondence včetně e-mailů přeposlaných funkcí Smart BCC, hromadné e-mailové kampaně
          odesílané ze schránky Správce, fakturační údaje), výhradně za účelem poskytování Služby po
          dobu trvání Smlouvy a dále podle článku 8.
        </p>
      </Section>

      <Section id="cl-2" title="2. Kategorie subjektů údajů">
        <p>Zákazníci, obchodní partneři, zaměstnanci a kontaktní osoby Správce.</p>
      </Section>

      <Section id="cl-3" title="3. Kategorie osobních údajů">
        <p>
          Identifikační údaje (jméno, název firmy, IČO), kontaktní údaje (e-mail, telefon, adresa),
          údaje o obchodních vztazích, obsah e-mailové komunikace včetně příloh, kterou Správce do
          Služby přepošle nebo z ní odešle, záznamy o otevření a prokliku odeslaných e-mailů a
          přihlašovací údaje k e-mailové schránce Správce, které Správce do Služby uloží pro
          odesílání zpráv.
        </p>
      </Section>

      <Section id="cl-4" title="4. Povinnosti zpracovatele">
        <p>Zpracovatel:</p>
        <p>
          4.1 zpracovává osobní údaje pouze na základě doložených pokynů Správce, včetně pokynů k
          předání do třetí země; pokynem jsou VOP, tato smlouva a nastavení Služby provedená
          Správcem. Ukládá-li Zpracovateli právo Evropské unie nebo členského státu jiné zpracování,
          informuje o tom Správce před zpracováním, ledaže to tyto předpisy zakazují,
        </p>
        <p>
          4.2 zajišťuje, že osoby oprávněné zpracovávat osobní údaje jsou zavázány mlčenlivostí,
        </p>
        <p>
          4.3 přijímá technická a organizační opatření přiměřená rizikům zpracování podle čl. 32
          GDPR, zejména šifrovaný přenos dat, řízení přístupů, oddělení dat jednotlivých organizací
          a evidenci přístupů podle článku 5,
        </p>
        <p>4.4 zapojuje další zpracovatele pouze za podmínek článku 6,</p>
        <p>
          4.5 je Správci s ohledem na povahu zpracování nápomocen při plnění povinnosti reagovat na
          žádosti subjektů údajů podle kapitoly III GDPR; žádost, kterou obdrží přímo od subjektu
          údajů, postoupí Správci bez zbytečného odkladu a sám na ni věcně neodpovídá,
        </p>
        <p>
          4.6 je Správci nápomocen při zajišťování souladu s čl. 32 až 36 GDPR, zejména poskytnutím
          informací potřebných pro ohlášení porušení zabezpečení, pro posouzení vlivu na ochranu
          osobních údajů a pro předchozí konzultaci s dozorovým úřadem, a to s ohledem na povahu
          zpracování a informace, které má k dispozici,
        </p>
        <p>
          4.7 informuje Správce o porušení zabezpečení osobních údajů bez zbytečného odkladu poté,
          co se o něm dozví, a sdělí mu povahu porušení, dotčené kategorie a přibližný počet
          subjektů údajů a přijatá opatření; lhůta 72 hodin podle čl. 33 odst. 1 GDPR běží Správci
          vůči dozorovému úřadu,
        </p>
        <p>
          4.8 po ukončení Smlouvy údaje podle volby Správce vymaže, nebo mu je v rozsahu údajů
          vedených ve Službě předá ve strojově čitelném formátu (CSV) a poté vymaže; volbu Správce
          sdělí do 30 dnů od ukončení Smlouvy; do udělení pokynu Zpracovatel údaje uchovává a
          Správce může výmaz kdykoli provést sám podle článku 8. Údaje, které je Zpracovatel povinen
          uchovávat podle právních předpisů (zejména fakturační), uchovává po zákonem stanovenou
          dobu,
        </p>
        <p>
          4.9 poskytne Správci informace potřebné k doložení splnění povinností podle čl. 28 GDPR a
          umožní mu audit oznámený alespoň 14 dnů předem, zpravidla nejvýše jednou ročně; bez
          zbytečného odkladu upozorní Správce, považuje-li jeho pokyn za rozporný s GDPR nebo jinými
          předpisy o ochraně osobních údajů,
        </p>
        <p>
          4.10 informuje Správce o provozních přístupech svých pověřených osob k jeho datům podle
          článku 5.
        </p>
      </Section>

      <Section id="cl-5" title="5. Provozní přístup pověřených osob Zpracovatele">
        <p>
          5.1 Pro účely zákaznické podpory, řešení incidentů, údržbu a kontrolu integrity dat má
          omezený okruh pověřených osob Zpracovatele (tzv. „super-administrátor") technickou
          možnost:
        </p>
        <ol className="list-[lower-alpha] space-y-1 pl-5">
          <li>
            zobrazit metadata organizace Správce (název, plán, počet uživatelů, datum poslední
            aktivity, billing údaje),
          </li>
          <li>zobrazit seznam uživatelských účtů (jméno, e-mail, role),</li>
          <li>zobrazit fakturační historii a aktivitu předplatného,</li>
          <li>
            přihlásit se jménem konkrétního uživatele Správce („impersonace") pro účely replikace
            nahlášeného problému; v takovém režimu má pověřená osoba stejné oprávnění jako daný
            uživatel.
          </li>
        </ol>
        <p>
          5.2 Tento přístup je výslovným pokynem Správce ve smyslu čl. 28 odst. 3 písm. a) GDPR a
          uděluje se jím obecné povolení k uvedeným úkonům po dobu trvání Smlouvy. Pověřené osoby
          jsou vázány mlčenlivostí dle čl. 4.2.
        </p>
        <p>
          5.3 Každý jednotlivý přístup je auditně zaznamenán a Správci dostupný v reálném čase v
          administraci pod <em>Nastavení → Přístup operátora</em>. Záznam obsahuje datum, typ úkonu,
          identitu pověřené osoby a — v případě impersonace — identitu uživatele, jehož jménem byl
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
        <p>6.1 Správce uděluje obecné povolení k zapojení těchto dalších zpracovatelů:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Hetzner Online GmbH (provoz aplikace a databáze, Německo)</li>
          <li>Comgate, a.s. (platební brána, Česká republika)</li>
          <li>
            Zoho Corporation B.V. (odesílání e-mailů z aplikace, datacentrum Amsterdam, Nizozemsko)
          </li>
          <li>
            Cloudflare, Inc. (příjem e-mailů na adresu v doméně in.simplecrm.cz — funkce Smart BCC;
            Spojené státy americké, zpracování na základě standardních smluvních doložek)
          </li>
        </ul>
        <p>
          6.2 Zpracovatel ukládá každému dalšímu zpracovateli smlouvou stejné povinnosti ochrany
          osobních údajů, jaké jsou sjednány v této smlouvě, a odpovídá Správci za plnění jeho
          povinností (čl. 28 odst. 4 GDPR).
        </p>
        <p>
          6.3 O zamýšlené změně dalšího zpracovatele informuje Zpracovatel Správce nejméně 30 dnů
          předem. Vznese-li Správce v této lhůtě námitku, sdělí mu Zpracovatel bez zbytečného
          odkladu, nejpozději do 10 dnů, zda změnu neprovede, nebo zda ji provede; v druhém případě
          je Správce oprávněn Smlouvu vypovědět ke dni zapojení dalšího zpracovatele a Zpracovatel
          mu vrátí poměrnou část ceny uhrazené za nevyčerpanou část Zúčtovacího období.
        </p>
        <p>
          6.4 Přihlásí-li se uživatel Správce prostřednictvím účtu Google nebo propojí-li svůj
          kalendář s Kalendářem Google, poskytuje mu tuto službu společnost Google jako samostatný
          správce na základě vlastních podmínek; Zpracovatel ji nezapojuje jako dalšího
          zpracovatele.
        </p>
        <p className="text-xs text-text-tertiary">
          Fakturační agendu vede Zpracovatel ve vlastní aplikaci — žádný externí fakturační systém k
          osobním údajům Subjektů nemá přístup.
        </p>
      </Section>

      <Section id="cl-7" title="7. Předávání do třetích zemí">
        <p>
          Aplikaci a databázi provozuje Zpracovatel u společnosti Hetzner Online GmbH v Německu. K
          předání do třetí země dochází pouze u dalšího zpracovatele Cloudflare, Inc. (článek 6), a
          to na základě standardních smluvních doložek podle čl. 46 odst. 2 písm. c) GDPR.
        </p>
      </Section>

      <Section id="cl-8" title="8. Doba trvání">
        <p>
          8.1 Tato smlouva je účinná po dobu trvání hlavní Smlouvy a dále až do výmazu nebo předání
          údajů podle čl. 4.8.
        </p>
        <p>
          8.2 Po ukončení hlavní Smlouvy zůstávají data Správci přístupná k exportu v rozsahu podle
          čl. 4.8.
        </p>
        <p>
          8.3 Výmaz může Správce kdykoli provést sám v administraci v sekci{" "}
          <em>Nastavení → Soukromí</em> (Trvale smazat organizaci) nebo o něj požádat na{" "}
          <a href={`mailto:${LEGAL_ENTITY.email}`} className="underline hover:text-text-primary">
            {LEGAL_ENTITY.email}
          </a>
          ; Zpracovatel jej provede bez zbytečného odkladu.
        </p>
      </Section>
      <Section id="cl-9" title="9. Sledování odeslaných e-mailů">
        <p>
          9.1 Je-li v organizaci Správce sledování zapnuto, vkládá Služba do HTML části odesílaných
          zpráv obrazový prvek načítaný ze serveru Zpracovatele a nahrazuje odkazy odkazy vedoucími
          přes přesměrovací bod Zpracovatele. Zaznamenává se, zda a kdy byla zpráva otevřena a na
          který odkaz bylo kliknuto.
        </p>
        <p>
          9.2 Právní základ pro toto sledování vůči příjemcům, včetně případného souhlasu podle § 89
          odst. 3 zákona č. 127/2005 Sb., zajišťuje Správce.
        </p>
        <p>
          9.3 Sledování může Správce kdykoli vypnout pro celou organizaci v administraci v sekci{" "}
          <em>Nastavení → Oprávnění</em>.
        </p>
      </Section>
      <Section id="cl-10" title="10. Hromadná e-mailová komunikace">
        <p>
          10.1 Hromadné zprávy odesílá Správce ze své vlastní e-mailové schránky; odesílatelem ve
          smyslu § 7 zákona č. 480/2004 Sb. je Správce.
        </p>
        <p>
          10.2 Správce odpovídá za to, že má pro zaslání obchodního sdělení souhlas adresáta nebo že
          využívá výjimku podle § 7 odst. 3 zákona č. 480/2004 Sb., že je zpráva zřetelně označena
          jako obchodní sdělení a že adresát má možnost další zprávy odmítnout.
        </p>
      </Section>
      <Section id="cl-11" title="11. Uzavření smlouvy">
        <p>
          11.1 Tato smlouva se uzavírá v elektronické podobě podle čl. 28 odst. 9 GDPR potvrzením
          podle čl. 3.1 VOP při založení organizace.
        </p>
        <p>
          11.2 Dokladem o uzavření je záznam o potvrzení, který obsahuje datum a čas potvrzení,
          uživatele, který je učinil, a verzi Všeobecných obchodních podmínek a této smlouvy; záznam
          je Správci dostupný v administraci v sekci <em>Nastavení → Soukromí</em>.
        </p>
      </Section>
    </LegalPageLayout>
  );
}
