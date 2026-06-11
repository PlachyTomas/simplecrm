import { Link } from "react-router-dom";

import {
  COMGATE_INFO,
  COMMERCE_TERMS_EFFECTIVE_DATE,
  LEGAL_ENTITY,
} from "@/marketing/legal-entity";
import { LegalPageLayout, Section } from "@/marketing/legal/LegalPageLayout";

/**
 * Dodací a platební podmínky — required by Comgate's full-access review.
 * For a SaaS, "delivery" is account activation; the page spells out the
 * timing plus every accepted payment method.
 */
export function DodaciPlatebniPodminkyPage() {
  return (
    <LegalPageLayout
      title="Dodací a platební podmínky"
      effectiveDate={COMMERCE_TERMS_EFFECTIVE_DATE}
      lead={
        <p>
          Tyto podmínky vydává{" "}
          <span className="font-medium text-text-primary">{LEGAL_ENTITY.fullName}</span>, IČO{" "}
          {LEGAL_ENTITY.ico}, se sídlem {LEGAL_ENTITY.address}. {LEGAL_ENTITY.registryClause}{" "}
          Popisují, jak je služba SimpleCRM dodávána (zpřístupněna) a jakými způsoby ji lze uhradit.
        </p>
      }
    >
      <Section id="dodani" title="1. Dodací podmínky">
        <p>
          1.1 SimpleCRM je cloudová digitální služba (SaaS). Nedodáváme žádné fyzické zboží —
          „dodáním" se rozumí zpřístupnění Služby ve webové aplikaci. Neúčtujeme proto žádné
          dopravné ani balné.
        </p>
        <p>
          1.2 <strong>Zkušební období:</strong> účet je aktivován okamžitě po dokončení registrace,
          bez platební karty, na 30 dní zdarma.
        </p>
        <p>
          1.3 <strong>Placený plán:</strong> Služba (resp. její prodloužení) je aktivována ihned po
          potvrzení platby platební bránou — zpravidla do několika minut od zaplacení. O aktivaci
          Uživatele informujeme e-mailem.
        </p>
        <p>
          1.4 Po každé přijaté platbě zašleme na kontaktní e-mail potvrzení spolu s daňovým dokladem
          (fakturou).
        </p>
        <p>
          1.5 Pokud by Služba nebyla zpřístupněna do 24 hodin od potvrzení platby, kontaktujte nás
          na{" "}
          <a href={`mailto:${LEGAL_ENTITY.email}`} className="underline hover:text-text-primary">
            {LEGAL_ENTITY.email}
          </a>{" "}
          — situaci neprodleně vyřešíme, případně platbu vrátíme dle{" "}
          <Link to="/reklamacni-podminky" className="underline hover:text-text-primary">
            Reklamačních podmínek
          </Link>
          .
        </p>
      </Section>

      <Section id="platba" title="2. Platební podmínky">
        <p>
          2.1 Ceny Služby jsou uvedeny v{" "}
          <Link to="/cenik" className="underline hover:text-text-primary">
            Ceníku
          </Link>{" "}
          v Kč za jednoho uživatele a zúčtovací období (měsíční nebo roční). Poskytovatel není
          plátcem DPH.
        </p>
        <p>2.2 Cena se hradí předem na začátku každého zúčtovacího období.</p>
        <p>
          2.3 Přijímáme tyto způsoby platby, vše prostřednictvím platební brány{" "}
          <a
            href={COMGATE_INFO.gatewayUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="underline hover:text-text-primary"
          >
            Comgate
          </a>
          :
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>platební karty Visa a Mastercard,</li>
          <li>Apple Pay a Google Pay,</li>
          <li>online bankovní převod (platební tlačítka českých bank).</li>
        </ul>
        <p>
          2.4 Za žádný způsob platby neúčtujeme příplatek — cena dle Ceníku je konečná. Platby
          probíhají v českých korunách (CZK).
        </p>
      </Section>

      <Section id="prubeh-platby" title="3. Jak platba probíhá">
        <p>
          3.1 Po výběru platby budete přesměrováni z naší aplikace na zabezpečenou platební bránu
          Comgate, kde celou platbu dokončíte. Po jejím provedení (nebo zrušení) vás brána
          automaticky vrátí zpět do SimpleCRM a o výsledku vás vyrozumíme.
        </p>
        <p>
          3.2 <strong>Platba kartou:</strong> na bráně zadáte číslo karty, datum platnosti a CVC
          kód; banka může vyžádat ověření 3-D Secure (např. potvrzení v mobilní aplikaci). Po
          schválení je platba provedena okamžitě. Podrobnosti popisuje{" "}
          <a
            href={COMGATE_INFO.cardHelpUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="underline hover:text-text-primary"
          >
            nápověda Comgate k platbám kartou
          </a>
          .
        </p>
        <p>
          3.3 <strong>Platební tlačítka bank (online převod):</strong> zvolíte svou banku,
          přihlásíte se do jejího internetového bankovnictví a potvrdíte předvyplněný platební
          příkaz. Platba je díky tomu spárována ihned. Podrobnosti popisuje{" "}
          <a
            href={COMGATE_INFO.bankHelpUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="underline hover:text-text-primary"
          >
            nápověda Comgate k bankovním převodům
          </a>
          .
        </p>
      </Section>

      <Section id="opakovane-platby" title="4. Opakované platby">
        <p>
          Zvolí-li si Uživatel automatické obnovování předplatného, jsou platby pravidelně strhávány
          z platební karty. Úplné podmínky opakovaných plateb — výše a frekvence strhávané částky,
          potvrzení o platbě a způsob zrušení — popisuje stránka{" "}
          <Link to="/predplatne" className="underline hover:text-text-primary">
            Předplatné a platby
          </Link>{" "}
          a{" "}
          <Link to="/obchodni-podminky#cl-6" className="underline hover:text-text-primary">
            čl. 6 Obchodních podmínek
          </Link>
          . Opakované platby lze kdykoli zrušit v administraci účtu.
        </p>
      </Section>

      <Section id="zabezpeceni" title="5. Zabezpečení plateb">
        <p>{COMGATE_INFO.legalText}</p>
        <p>
          Platební údaje zpracovává výhradně Comgate, a.s. dle bezpečnostního standardu PCI DSS.
          SimpleCRM nemá nikdy přístup k číslu vaší platební karty. Další informace o platební bráně
          najdete na{" "}
          <a
            href={COMGATE_INFO.gatewayUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="underline hover:text-text-primary"
          >
            comgate.eu
          </a>
          .
        </p>
      </Section>

      <Section id="kontakt-platby" title="6. Kontakt pro dotazy k platbám">
        <p>
          S dotazy k objednávce, fakturaci či aktivaci Služby se obracejte na Poskytovatele:{" "}
          <a href={`mailto:${LEGAL_ENTITY.email}`} className="underline hover:text-text-primary">
            {LEGAL_ENTITY.email}
          </a>
          , tel.{" "}
          <a
            href={`tel:${LEGAL_ENTITY.phone.replace(/\s+/g, "")}`}
            className="underline hover:text-text-primary"
          >
            {LEGAL_ENTITY.phone}
          </a>
          .
        </p>
        <p>Dotazy a reklamace k průběhu platby vyřizuje provozovatel platební brány:</p>
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
      </Section>

      <Section id="zaver" title="7. Závěrečná ustanovení">
        <p>
          7.1 Tyto podmínky tvoří součást smluvní dokumentace spolu s{" "}
          <Link to="/obchodni-podminky" className="underline hover:text-text-primary">
            Všeobecnými obchodními podmínkami
          </Link>{" "}
          a{" "}
          <Link to="/reklamacni-podminky" className="underline hover:text-text-primary">
            Reklamačními podmínkami
          </Link>
          . V případě rozporu mají přednost VOP.
        </p>
        <p>7.2 Tyto podmínky nabývají účinnosti dne {COMMERCE_TERMS_EFFECTIVE_DATE}.</p>
      </Section>
    </LegalPageLayout>
  );
}
