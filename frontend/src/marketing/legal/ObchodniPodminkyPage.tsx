import { Link } from "react-router-dom";

import { LEGAL_ENTITY, LEGAL_EFFECTIVE_DATE } from "@/marketing/legal-entity";
import { LegalPageLayout, Section } from "@/marketing/legal/LegalPageLayout";

/** VOP — Všeobecné obchodní podmínky služby SimpleCRM (B2B SaaS, ČR). */
export function ObchodniPodminkyPage() {
  return (
    <LegalPageLayout
      title="Všeobecné obchodní podmínky"
      effectiveDate={LEGAL_EFFECTIVE_DATE}
      lead={
        <>
          <p>
            <span className="font-medium text-text-primary">{LEGAL_ENTITY.fullName}</span>, IČO{" "}
            {LEGAL_ENTITY.ico}, se sídlem {LEGAL_ENTITY.address}. {LEGAL_ENTITY.registryClause}{" "}
            (dále jen „Poskytovatel") vydává tyto všeobecné obchodní podmínky (dále jen „VOP").
          </p>
        </>
      }
    >
      <Section id="cl-1" title="1. Úvodní ustanovení">
        <p>
          1.1 Tyto VOP upravují v souladu s § 1751 odst. 1 zákona č. 89/2012 Sb., občanský zákoník
          (dále jen „OZ"), vzájemná práva a povinnosti Poskytovatele a zákazníka (dále jen
          „Uživatel") vzniklé v souvislosti s poskytováním cloudové služby SimpleCRM (dále jen
          „Služba") prostřednictvím webové aplikace dostupné na simplecrm.cz.
        </p>
        <p>
          1.2 Smlouva o poskytování Služby (dále jen „Smlouva") se uzavírá distančním způsobem v
          souladu s § 2389a a násl. OZ jako smlouva o poskytování digitální služby.
        </p>
        <p>
          1.3 Tyto VOP se vztahují <strong>výhradně na vztahy mezi podnikateli (B2B)</strong>.
          Uživatel uzavřením Smlouvy prohlašuje, že je podnikatelem ve smyslu § 420 OZ a jedná v
          rámci své podnikatelské činnosti. Služba není určena spotřebitelům ve smyslu § 419 OZ.
        </p>
      </Section>

      <Section id="cl-2" title="2. Definice pojmů">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Služba</strong> — cloudová aplikace SimpleCRM pro řízení vztahů se zákazníky a
            obchodními příležitostmi, poskytovaná formou software jako služby (SaaS).
          </li>
          <li>
            <strong>Uživatelský účet</strong> — administrátorský účet a uživatelské licence v rámci
            tarifu.
          </li>
          <li>
            <strong>Uživatelská licence</strong> — oprávnění jednoho fyzického uživatele přistupovat
            ke Službě.
          </li>
          <li>
            <strong>Plán / Tarif</strong> — placená varianta Služby dle Ceníku.
          </li>
          <li>
            <strong>Zúčtovací období</strong> — měsíční nebo roční období dle volby Uživatele.
          </li>
        </ul>
      </Section>

      <Section id="cl-3" title="3. Uzavření smlouvy a registrace">
        <p>
          3.1 Uživatel se registruje vyplněním formuláře na simplecrm.cz, kde uvádí zejména název
          firmy, fakturační údaje, jméno administrátora a kontaktní e-mail. Uzavřením Smlouvy
          Uživatel potvrzuje, že je podnikatelem ve smyslu § 420 OZ a jedná v rámci své
          podnikatelské činnosti (viz též čl. 1.3).
        </p>
        <p>
          3.2 Smlouva je uzavřena okamžikem odeslání potvrzujícího e-mailu Poskytovatelem na
          e-mailovou adresu Uživatele.
        </p>
        <p>3.3 Smlouva se uzavírá na dobu neurčitou s možností výpovědi dle čl. 9.</p>
      </Section>

      <Section id="cl-4" title="4. Zkušební období (free trial)">
        <p>
          4.1 Uživatel má nárok na bezplatné zkušební užívání Služby po dobu 30 dnů od založení
          účtu, a to bez nutnosti zadání platební karty.
        </p>
        <p>
          4.2 Po skončení zkušebního období nedojde k automatickému strhávání platby. Pro
          pokračování ve Službě musí Uživatel aktivně zvolit Plán a zadat platební metodu.
        </p>
      </Section>

      <Section id="cl-5" title="5. Cena a platební podmínky">
        <p>
          5.1 Cena za Službu je stanovena Ceníkem zveřejněným na simplecrm.cz a je uvedena v Kč za
          jednoho uživatele za jeden kalendářní měsíc. Poskytovatel není plátcem DPH.
        </p>
        <p>
          5.2 Cena je hrazena předem na začátku každého Zúčtovacího období prostřednictvím platební
          brány Comgate. Daňový doklad bude Uživateli vystaven elektronicky a zaslán na kontaktní
          e-mail.
        </p>
        <p>
          5.3 Pokud se Uživatel rozhodne pro automatické obnovování předplatného (viz čl. 6), platí
          podmínky opakovaných plateb.
        </p>
        <p>
          5.4 Poskytovatel je oprávněn jednostranně změnit cenu Služby. Změnu oznámí Uživateli
          e-mailem nejméně 30 dnů předem. Uživatel má právo Smlouvu vypovědět ke dni účinnosti nové
          ceny.
        </p>
      </Section>

      <Section id="cl-6" title="6. Automatické obnovování předplatného (opakované platby)">
        <p>
          6.1 Uživatel si může zvolit režim automatického obnovování předplatného, v rámci kterého
          jsou platby pravidelně strhávány z jeho platební karty prostřednictvím funkce opakovaných
          plateb platební brány Comgate (Card-on-File).
        </p>
        <p>
          6.2 Před aktivací automatického obnovení Uživatel výslovně potvrdí, že souhlasí s tím, že:
        </p>
        <ol className="list-[lower-alpha] space-y-1 pl-5">
          <li>
            z jeho karty bude pravidelně strhávána částka odpovídající jeho Plánu a počtu
            uživatelských licencí,
          </li>
          <li>frekvence stržení odpovídá zvolenému Zúčtovacímu období (měsíčně nebo ročně),</li>
          <li>opakované platby budou trvat do doby, než je Uživatel zruší,</li>
          <li>o každé stržené platbě obdrží potvrzení (daňový doklad) na svůj e-mail,</li>
          <li>
            o jakékoliv změně výše stržené částky nebo frekvence bude předem informován e-mailem.
          </li>
        </ol>
        <p>6.3 Uživatel může automatické obnovování kdykoli zrušit:</p>
        <ol className="list-[lower-alpha] space-y-1 pl-5">
          <li>v administraci svého účtu (záložka „Předplatné"),</li>
          <li>
            e-mailem na adresu{" "}
            <a href={`mailto:${LEGAL_ENTITY.email}`} className="underline hover:text-text-primary">
              {LEGAL_ENTITY.email}
            </a>
            , nejpozději 1 pracovní den před stržením další platby.
          </li>
        </ol>
        <p>
          6.4 Zrušením opakovaných plateb nedochází k automatickému ukončení Smlouvy — Smlouva trvá
          do konce zaplaceného Zúčtovacího období, po jeho uplynutí dojde k pozastavení účtu, pokud
          Uživatel neprovede úhradu jinou cestou.
        </p>
      </Section>

      <Section id="cl-7" title="7. Práva a povinnosti uživatele">
        <p>7.1 Uživatel se zavazuje:</p>
        <ol className="list-[lower-alpha] space-y-1 pl-5">
          <li>chránit přihlašovací údaje před zneužitím,</li>
          <li>užívat Službu v souladu s právními předpisy a dobrými mravy,</li>
          <li>nezasahovat do Služby, neprovádět reverzní inženýrství,</li>
          <li>neporušovat autorská práva Poskytovatele.</li>
        </ol>
        <p>
          7.2 Uživatel odpovídá za obsah, který do Služby nahrává (zejména osobní údaje svých
          zákazníků a kontaktů).
        </p>
      </Section>

      <Section id="cl-8" title="8. Práva a povinnosti poskytovatele, SLA">
        <p>
          8.1 Poskytovatel se zavazuje zajistit dostupnost Služby v rozsahu 99,5 % měsíční
          dostupnosti, mimo plánované odstávky oznámené alespoň 48 hodin předem.
        </p>
        <p>
          8.2 Poskytovatel je oprávněn dočasně pozastavit Službu z důvodů údržby, technické poruchy,
          vyšší moci nebo zásahu třetí strany.
        </p>
        <p>
          8.3 Poskytovatel zajistí dostupnost aktualizací Služby nezbytných pro udržení její
          funkčnosti.
        </p>
        <p>
          8.4 Poskytovatel je oprávněn jednostranně měnit funkce Služby. O zásadních změnách
          (omezení funkcí) informuje Uživatele e-mailem alespoň 30 dnů předem.
        </p>
      </Section>

      <Section id="cl-9" title="9. Ukončení smlouvy">
        <p>
          9.1 Uživatel může Smlouvu kdykoli vypovědět bez udání důvodu zrušením účtu v administraci.
          Výpověď je účinná ke konci aktuálního Zúčtovacího období.
        </p>
        <p>
          9.2 Poskytovatel může Smlouvu vypovědět s 30denní výpovědní lhůtou nebo odstoupit při
          porušení Smlouvy ze strany Uživatele.
        </p>
      </Section>

      <Section id="cl-10" title="10. Odpovědnost za vady, reklamace a náhrada škody">
        <p>
          10.1 Vadou Služby se rozumí významná nedostupnost (delší než SLA), ztráta dat zaviněná
          Poskytovatelem, případně dlouhodobá nefunkčnost zásadní funkce.
        </p>
        <p>
          10.2 Reklamaci Uživatel uplatňuje písemně na{" "}
          <a href={`mailto:${LEGAL_ENTITY.email}`} className="underline hover:text-text-primary">
            {LEGAL_ENTITY.email}
          </a>
          , Poskytovatel ji vyřídí do 30 dnů.
        </p>
        <p>
          10.3 Práva z vadného plnění: oprava, sleva z ceny, případně odstoupení od Smlouvy při
          podstatném porušení.
        </p>
        <p>
          10.4 Celková výše náhrady škody vůči Uživateli je omezena částkou rovnající se ceně Služby
          zaplacené Uživatelem za posledních 12 měsíců předcházejících vzniku škody. Vyloučena je
          odpovědnost za ušlý zisk a následné/nepřímé škody. Uživatel s tímto omezením výslovně
          souhlasí.
        </p>
        <p>
          10.5 Podrobný postup reklamace, vrácení peněz a storna Služby upravují samostatné{" "}
          <Link to="/reklamacni-podminky" className="underline hover:text-text-primary">
            Reklamační podmínky
          </Link>
          ; podmínky zpřístupnění Služby a způsoby platby pak{" "}
          <Link to="/dodaci-a-platebni-podminky" className="underline hover:text-text-primary">
            Dodací a platební podmínky
          </Link>
          .
        </p>
      </Section>

      <Section id="cl-11" title="11. Ochrana osobních údajů">
        <p>
          11.1 Při poskytování Služby zpracovává Poskytovatel osobní údaje zaměstnanců a kontaktních
          osob Uživatele jako správce — podrobnosti v dokumentu{" "}
          <Link to="/ochrana-osobnich-udaju" className="underline hover:text-text-primary">
            Zásady zpracování osobních údajů
          </Link>
          .
        </p>
        <p>
          11.2 Pokud Uživatel nahraje do Služby osobní údaje třetích osob (svých zákazníků,
          kontaktů), je Poskytovatel v postavení zpracovatele podle čl. 28 GDPR. Vztah upravuje
          samostatná{" "}
          <Link to="/zpracovatelska-smlouva" className="underline hover:text-text-primary">
            Smlouva o zpracování osobních údajů (DPA)
          </Link>
          , která tvoří Přílohu č. 1 těchto VOP.
        </p>
      </Section>

      <Section id="cl-12" title="12. Autorská práva a licence">
        <p>
          12.1 Služba a její součásti jsou autorským dílem Poskytovatele. Uživatel získává
          nevýhradní, časově omezenou (po dobu trvání Smlouvy) licenci k užívání Služby výhradně pro
          účely svého podnikání.
        </p>
        <p>
          12.2 Uživatel není oprávněn Službu kopírovat, dále poskytovat třetím stranám,
          zpřístupňovat ve formě veřejné nabídky či používat ke školení AI systémů.
        </p>
      </Section>

      <Section id="cl-13" title="13. Závěrečná ustanovení">
        <p>
          13.1 Tyto VOP a Smlouva se řídí právním řádem České republiky. K řešení sporů jsou
          příslušné obecné soudy České republiky.
        </p>
        <p>
          13.2 Poskytovatel je oprávněn tyto VOP jednostranně měnit. O změně bude Uživatel
          informován e-mailem alespoň 30 dnů před účinností. Uživatel je oprávněn Smlouvu z důvodu
          nesouhlasu se změnou vypovědět ke dni účinnosti změny.
        </p>
        <p>13.3 Tyto VOP nabývají účinnosti dne {LEGAL_EFFECTIVE_DATE}.</p>
      </Section>
    </LegalPageLayout>
  );
}
