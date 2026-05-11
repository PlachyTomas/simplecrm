import { Check } from "lucide-react";
import { Link } from "react-router-dom";

import { COMGATE_INFO, LEGAL_ENTITY } from "@/marketing/legal-entity";
import { LegalPageLayout, Section } from "@/marketing/legal/LegalPageLayout";

/**
 * Informace o předplatném a opakovaných platbách — povinná dle pravidel
 * Visa/Mastercard a Comgate (help.comgate.cz/docs/opakovane-platby).
 * Musí být dostupná před první (iniciační) platbou.
 */
export function PredplatnePage() {
  return (
    <LegalPageLayout
      title="Předplatné a platby"
      lead={
        <p>
          Tato stránka shrnuje, jak funguje předplatné a opakované platby v SimpleCRM. Plné
          podmínky najdete v{" "}
          <Link to="/obchodni-podminky#cl-6" className="underline hover:text-text-primary">
            čl. 6 Obchodních podmínek
          </Link>
          .
        </p>
      }
    >
      <Section id="trial" title="Bezplatné 30denní vyzkoušení">
        <p>
          Po skončení 30denního zkušebního období můžete pokračovat zaplacením předplatného.
          <strong> Předplatné se neaktivuje automaticky</strong> — bez výslovného potvrzení
          žádné prostředky nestrhneme.
        </p>
      </Section>

      <Section
        id="opakovane"
        title="Opakované platby (automatické obnovení)"
      >
        <p>Pokud zvolíte automatické obnovení, platí toto:</p>
        <ul className="space-y-2">
          <SubscribeBullet>
            Z vaší platební karty pravidelně strhneme částku odpovídající vašemu plánu (99 Kč
            × počet uživatelů × měsíc).
          </SubscribeBullet>
          <SubscribeBullet>
            Stržení probíhá vždy první den nového zúčtovacího období.
          </SubscribeBullet>
          <SubscribeBullet>Platby trvají do doby, než je zrušíte.</SubscribeBullet>
          <SubscribeBullet>
            O každé platbě dostanete e-mail s daňovým dokladem.
          </SubscribeBullet>
          <SubscribeBullet>
            O jakékoli změně ceny vás informujeme e-mailem alespoň 30 dní předem.
          </SubscribeBullet>
        </ul>
      </Section>

      <Section id="zruseni" title="Zrušení automatických plateb">
        <p>Můžete je zrušit kdykoli:</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            V administraci → <em>Nastavení → Předplatné</em> → tlačítko „Zrušit automatické
            obnovení".
          </li>
          <li>
            Nebo e-mailem na{" "}
            <a
              href={`mailto:${LEGAL_ENTITY.email}`}
              className="underline hover:text-text-primary"
            >
              {LEGAL_ENTITY.email}
            </a>
            , nejpozději 1 pracovní den před stržením další platby.
          </li>
        </ol>
        <p>
          Zrušení automatických plateb neukončí vaše předplatné — služba pojede do konce
          zaplaceného období. Pro úplné ukončení smlouvy zrušte účet v administraci.
        </p>
      </Section>

      <Section id="zabezpeceni" title="Zabezpečení plateb">
        <p>
          Platební údaje zpracovává <strong>Comgate, a.s.</strong> dle standardu PCI-DSS Level
          1. Comgate je přímým členem karetních asociací Visa a Mastercard (Principal member).
          SimpleCRM nikdy nemá přístup k číslu vaší karty.
        </p>
        <p className="text-xs text-text-tertiary">{COMGATE_INFO.legalText}</p>
        <div className="rounded-md border border-border-subtle bg-surface-overlay p-4 text-xs">
          <p className="font-medium text-text-primary">Kontakt na Comgate (reklamace plateb)</p>
          <p>{COMGATE_INFO.contact.name}</p>
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
          <p>Telefon: {COMGATE_INFO.contact.phone}</p>
        </div>
      </Section>
    </LegalPageLayout>
  );
}

function SubscribeBullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check size={16} strokeWidth={2} className="mt-0.5 text-accent" />
      <span>{children}</span>
    </li>
  );
}
