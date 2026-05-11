import { Mail, MapPin } from "lucide-react";
import { Link } from "react-router-dom";

import { LEGAL_ENTITY } from "@/marketing/legal-entity";
import { LegalPageLayout, Section } from "@/marketing/legal/LegalPageLayout";

/** Required by Comgate (item #2 of náležitosti e-shopu) and § 435 OZ. */
export function KontaktPage() {
  return (
    <LegalPageLayout
      title="Kontakt"
      lead="Rádi vám pomůžeme. Tým SimpleCRM odpovídá v pracovní dny do několika hodin."
    >
      <Section title="Provozovatel služby">
        <address className="not-italic">
          <p className="font-medium text-text-primary">{LEGAL_ENTITY.fullName}</p>
          <p>{LEGAL_ENTITY.address}</p>
          <p>IČO: {LEGAL_ENTITY.ico}</p>
          <p className="mt-1 text-xs text-text-tertiary">{LEGAL_ENTITY.registryClause}</p>
        </address>
        <p className="text-xs text-text-tertiary">
          Nejsme plátci DPH. Faktury vystavujeme v souladu se zákonem o účetnictví.
        </p>
      </Section>

      <Section title="Spojte se s námi">
        <ul className="space-y-3">
          <li className="flex items-start gap-3">
            <Mail size={18} strokeWidth={1.75} className="mt-0.5 text-text-tertiary" />
            <div>
              <p className="font-medium text-text-primary">E-mail</p>
              <a
                href={`mailto:${LEGAL_ENTITY.email}`}
                className="text-text-secondary underline hover:text-text-primary"
              >
                {LEGAL_ENTITY.email}
              </a>
              <p className="mt-1 text-xs text-text-tertiary">
                Pro obchodní dotazy, technickou podporu i reklamace. Odpovídáme zpravidla
                v pracovní dny do několika hodin.
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <MapPin size={18} strokeWidth={1.75} className="mt-0.5 text-text-tertiary" />
            <div>
              <p className="font-medium text-text-primary">Korespondenční adresa</p>
              <p>{LEGAL_ENTITY.address}</p>
            </div>
          </li>
        </ul>
      </Section>

      <Section title="Reklamace a podpora">
        <p>
          Reklamace přijímáme výhradně písemně na{" "}
          <a
            href={`mailto:${LEGAL_ENTITY.email}`}
            className="underline hover:text-text-primary"
          >
            {LEGAL_ENTITY.email}
          </a>
          . Vyřízení proběhne do 30 dnů od doručení reklamace. Postup, definice
          vad služby a práva z vadného plnění upravuje{" "}
          <Link to="/obchodni-podminky#cl-10" className="underline hover:text-text-primary">
            čl. 10 Obchodních podmínek
          </Link>
          .
        </p>
      </Section>

      <Section title="Právní stránky">
        <ul className="grid gap-2 sm:grid-cols-2">
          <li>
            <Link
              to="/obchodni-podminky"
              className="underline hover:text-text-primary"
            >
              Obchodní podmínky
            </Link>
          </li>
          <li>
            <Link
              to="/ochrana-osobnich-udaju"
              className="underline hover:text-text-primary"
            >
              Ochrana osobních údajů
            </Link>
          </li>
          <li>
            <Link
              to="/zpracovatelska-smlouva"
              className="underline hover:text-text-primary"
            >
              Zpracovatelská smlouva (DPA)
            </Link>
          </li>
          <li>
            <Link to="/cookies" className="underline hover:text-text-primary">
              Cookies
            </Link>
          </li>
          <li>
            <Link to="/predplatne" className="underline hover:text-text-primary">
              Předplatné a platby
            </Link>
          </li>
        </ul>
      </Section>
    </LegalPageLayout>
  );
}
