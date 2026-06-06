import { Link } from "react-router-dom";

import {
  COMGATE_INFO,
  COMMERCE_TERMS_EFFECTIVE_DATE,
  LEGAL_ENTITY,
} from "@/marketing/legal-entity";
import { LegalPageLayout, Section } from "@/marketing/legal/LegalPageLayout";

/**
 * Reklamační podmínky — required by Comgate's full-access review
 * (vrácení zboží, vrácení peněz, storno služby). Standalone page; the
 * substance mirrors and expands čl. 10 VOP.
 */
export function ReklamacniPodminkyPage() {
  return (
    <LegalPageLayout
      title="Reklamační podmínky"
      effectiveDate={COMMERCE_TERMS_EFFECTIVE_DATE}
      lead={
        <p>
          Tyto reklamační podmínky vydává{" "}
          <span className="font-medium text-text-primary">{LEGAL_ENTITY.fullName}</span>, IČO{" "}
          {LEGAL_ENTITY.ico}, se sídlem {LEGAL_ENTITY.address}. {LEGAL_ENTITY.registryClause} (dále
          jen „Poskytovatel"). Upravují postup při reklamaci cloudové služby SimpleCRM, vrácení
          peněz a storno služby a doplňují{" "}
          <Link to="/obchodni-podminky#cl-10" className="underline hover:text-text-primary">
            čl. 10 Všeobecných obchodních podmínek
          </Link>
          .
        </p>
      }
    >
      <Section id="predmet" title="1. Na co se reklamační podmínky vztahují">
        <p>
          1.1 SimpleCRM je digitální služba (SaaS) poskytovaná výhradně podnikatelům (B2B).
          Reklamovat lze vady Služby — zejména významnou nedostupnost přesahující garantovanou
          úroveň dle čl. 8 VOP (99,5 % měsíční dostupnosti), ztrátu dat zaviněnou Poskytovatelem
          nebo dlouhodobou nefunkčnost zásadní funkce Služby.
        </p>
        <p>
          1.2 Vadou není krátkodobý výpadek v rámci garantované dostupnosti, plánovaná odstávka
          oznámená alespoň 48 hodin předem, ani nedostupnost způsobená na straně Uživatele
          (internetové připojení, nevhodné zařízení) či vyšší mocí.
        </p>
      </Section>

      <Section id="vraceni-zbozi" title="2. Vrácení zboží">
        <p>
          2.1 Poskytovatel nedodává žádné fyzické zboží. Předmětem prodeje je výhradně přístup k
          digitální službě — proto se ustanovení o vracení fyzického zboží nepoužijí a Uživatel nic
          fyzicky nevrací.
        </p>
        <p>
          2.2 Pro vrácení peněz za již uhrazenou Službu platí čl. 4 těchto podmínek; pro ukončení
          (storno) Služby platí čl. 5.
        </p>
      </Section>

      <Section id="postup" title="3. Jak reklamaci uplatnit">
        <p>
          3.1 Reklamaci Uživatel uplatňuje písemně e-mailem na{" "}
          <a href={`mailto:${LEGAL_ENTITY.email}`} className="underline hover:text-text-primary">
            {LEGAL_ENTITY.email}
          </a>
          . V reklamaci uveďte:
        </p>
        <ol className="list-[lower-alpha] space-y-1 pl-5">
          <li>identifikaci Uživatele (název firmy, IČO, e-mail administrátora účtu),</li>
          <li>popis vady a její projevy (kdy nastala, kterých funkcí se týká),</li>
          <li>čeho se reklamací domáháte (oprava, sleva z ceny, odstoupení od Smlouvy).</li>
        </ol>
        <p>
          3.2 Přijetí reklamace potvrdíme e-mailem do 2 pracovních dnů. Reklamaci vyřídíme
          nejpozději do 30 dnů od jejího doručení; o výsledku Uživatele informujeme e-mailem.
        </p>
        <p>
          3.3 Práva z vadného plnění: odstranění vady (oprava), přiměřená sleva z ceny, nebo — při
          podstatném porušení Smlouvy — odstoupení od Smlouvy.
        </p>
      </Section>

      <Section id="vraceni-penez" title="4. Vrácení peněz">
        <p>
          4.1 Je-li reklamace oprávněná a Uživateli vznikne nárok na slevu z ceny nebo vrácení
          platby (např. při odstoupení od Smlouvy), vrátí Poskytovatel příslušnou částku do 14 dnů
          od vyřízení reklamace.
        </p>
        <p>
          4.2 Peníze vracíme stejnou cestou, jakou byla platba provedena — zpravidla na platební
          kartu či bankovní účet prostřednictvím platební brány Comgate. O provedeném vrácení
          Uživatele informujeme e-mailem včetně opravného daňového dokladu.
        </p>
      </Section>

      <Section id="storno" title="5. Storno služby">
        <p>
          5.1 Uživatel může Službu kdykoli a bez udání důvodu vypovědět zrušením účtu v administraci
          (Nastavení → Předplatné). Výpověď je účinná ke konci aktuálního zaplaceného zúčtovacího
          období; do té doby zůstává Služba plně dostupná.
        </p>
        <p>
          5.2 Zrušení automatického obnovování předplatného (opakovaných plateb) je možné kdykoli v
          administraci účtu nebo e-mailem na{" "}
          <a href={`mailto:${LEGAL_ENTITY.email}`} className="underline hover:text-text-primary">
            {LEGAL_ENTITY.email}
          </a>{" "}
          — podrobnosti na stránce{" "}
          <Link to="/predplatne" className="underline hover:text-text-primary">
            Předplatné a platby
          </Link>
          .
        </p>
        <p>
          5.3 Zkušební období (30 dní zdarma) nevyžaduje platební kartu a není třeba je stornovat —
          po jeho uplynutí nedojde k žádnému stržení platby.
        </p>
      </Section>

      <Section id="reklamace-plateb" title="6. Reklamace plateb (platební brána)">
        <p>
          Reklamace či dotazy týkající se samotného průběhu platby kartou nebo převodem vyřizuje
          provozovatel platební brány:
        </p>
        <address className="not-italic">
          <p className="font-medium text-text-primary">{COMGATE_INFO.contact.name}</p>
          <p>{COMGATE_INFO.contact.address}</p>
          <p>
            E-mail:{" "}
            <a
              href={`mailto:${COMGATE_INFO.contact.email}`}
              className="underline hover:text-text-primary"
            >
              {COMGATE_INFO.contact.email}
            </a>
          </p>
          <p>
            Tel.:{" "}
            <a
              href={`tel:${COMGATE_INFO.contact.phone.replace(/\s+/g, "")}`}
              className="underline hover:text-text-primary"
            >
              {COMGATE_INFO.contact.phone}
            </a>
          </p>
        </address>
        <p>
          Reklamace samotné Služby SimpleCRM (čl. 3) směřujte vždy na Poskytovatele, nikoli na
          Comgate.
        </p>
      </Section>

      <Section id="zaver" title="7. Závěrečná ustanovení">
        <p>
          7.1 Tyto reklamační podmínky tvoří součást smluvní dokumentace spolu s{" "}
          <Link to="/obchodni-podminky" className="underline hover:text-text-primary">
            Všeobecnými obchodními podmínkami
          </Link>{" "}
          a{" "}
          <Link to="/dodaci-a-platebni-podminky" className="underline hover:text-text-primary">
            Dodacími a platebními podmínkami
          </Link>
          . V případě rozporu mají přednost VOP.
        </p>
        <p>7.2 Tyto podmínky nabývají účinnosti dne {COMMERCE_TERMS_EFFECTIVE_DATE}.</p>
      </Section>
    </LegalPageLayout>
  );
}
