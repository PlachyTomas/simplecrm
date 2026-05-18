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
            <dd>po dobu trvání smlouvy + 10 let (zákon č. 563/1991 Sb.)</dd>
          </dl>
        </article>

        <article className="rounded-md border border-border-subtle bg-surface-overlay p-4">
          <h3 className="font-semibold text-text-primary">b) Údaje o užívání služby</h3>
          <p className="mt-1 text-xs text-text-tertiary">IP adresa, log-in, akce v aplikaci</p>
          <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="text-text-tertiary">Účel:</dt>
            <dd>zabezpečení, audit, technická podpora</dd>
            <dt className="text-text-tertiary">Právní základ:</dt>
            <dd>čl. 6 odst. 1 písm. f) GDPR (oprávněný zájem)</dd>
            <dt className="text-text-tertiary">Doba uchování:</dt>
            <dd>12 měsíců</dd>
          </dl>
        </article>

        <article className="rounded-md border border-border-subtle bg-surface-overlay p-4">
          <h3 className="font-semibold text-text-primary">c) Marketingové údaje</h3>
          <p className="mt-1 text-xs text-text-tertiary">e-mail pro newsletter</p>
          <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="text-text-tertiary">Účel:</dt>
            <dd>zasílání obchodních sdělení o našich službách</dd>
            <dt className="text-text-tertiary">Právní základ:</dt>
            <dd>
              čl. 6 odst. 1 písm. f) GDPR (oprávněný zájem u stávajících zákazníků dle § 7 zák. č.
              480/2004 Sb.); souhlas u ostatních
            </dd>
            <dt className="text-text-tertiary">Doba uchování:</dt>
            <dd>do odvolání souhlasu / odhlášení</dd>
          </dl>
        </article>
      </Section>

      <Section id="prijemci" title="3. Příjemci osobních údajů">
        <p>Vaše údaje předáváme pouze:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>poskytovateli hostingu a denních záloh — Hetzner Online GmbH, Německo, EU,</li>
          <li>platební bráně Comgate, a.s., Česká republika,</li>
          <li>
            poskytovateli transakční a marketingové e-mailové komunikace — Zoho Corporation B.V.,
            datacentrum Amsterdam, Nizozemsko,
          </li>
          <li>účetní po dohodě.</li>
        </ul>
        <p>
          Fakturační agendu vedeme in-house ve vlastní aplikaci — žádný externí fakturační systém k
          Vašim údajům přístup nemá. Všichni dodavatelé sídlí nebo zpracovávají údaje v EU/EHP; mimo
          EU údaje nepředáváme.
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
          Údaje jsou chráněny šifrovaným přenosem (HTTPS/TLS), denními zálohami uchovávanými mimo
          produkční prostředí, logováním administrátorských přístupů a izolací mezi organizacemi na
          úrovni aplikační vrstvy. Šifrování databáze v klidu (at rest) plánujeme nasadit v rámci
          přechodu na šifrovaný diskový svazek.
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
