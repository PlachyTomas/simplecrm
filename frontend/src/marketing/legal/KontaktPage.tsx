import { Mail, MapPin, Phone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { LEGAL_ENTITY } from "@/marketing/legal-entity";
import { LegalPageLayout, Section } from "@/marketing/legal/LegalPageLayout";
import { useMarketingLang } from "@/marketing/useMarketingLang";

/**
 * Required by Comgate (item #2 of náležitosti e-shopu) and § 435 OZ.
 *
 * Unlike the other legal pages this one is mounted in BOTH marketing trees
 * (/kontakt and /en/contact), so all copy comes from the catalogs. The legal
 * documents it links to stay Czech-only — the /en variant says so.
 */
export function KontaktPage() {
  const { t } = useTranslation("marketing");
  const lang = useMarketingLang();
  return (
    <LegalPageLayout title={t("kontakt.title")} lead={t("kontakt.lead")}>
      <Section title={t("kontakt.operatorHeading")}>
        <address className="not-italic">
          <p className="font-medium text-text-primary">{LEGAL_ENTITY.fullName}</p>
          <p>{LEGAL_ENTITY.address}</p>
          <p>IČO: {LEGAL_ENTITY.ico}</p>
          <p className="mt-1 text-xs text-text-tertiary">{LEGAL_ENTITY.registryClause}</p>
        </address>
        <p className="text-xs text-text-tertiary">{t("kontakt.vatNote")}</p>
      </Section>

      <Section title={t("kontakt.contactHeading")}>
        <ul className="space-y-3">
          <li className="flex items-start gap-3">
            <Mail size={18} strokeWidth={1.75} className="mt-0.5 text-text-tertiary" />
            <div>
              <p className="font-medium text-text-primary">{t("kontakt.emailLabel")}</p>
              <a
                href={`mailto:${LEGAL_ENTITY.email}`}
                className="text-text-secondary underline hover:text-text-primary"
              >
                {LEGAL_ENTITY.email}
              </a>
              <p className="mt-1 text-xs text-text-tertiary">{t("kontakt.emailNote")}</p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <Phone size={18} strokeWidth={1.75} className="mt-0.5 text-text-tertiary" />
            <div>
              <p className="font-medium text-text-primary">{t("kontakt.phoneLabel")}</p>
              <a
                href={`tel:${LEGAL_ENTITY.phone.replace(/\s+/g, "")}`}
                className="text-text-secondary underline hover:text-text-primary"
              >
                {LEGAL_ENTITY.phone}
              </a>
              <p className="mt-1 text-xs text-text-tertiary">{t("kontakt.phoneNote")}</p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <MapPin size={18} strokeWidth={1.75} className="mt-0.5 text-text-tertiary" />
            <div>
              <p className="font-medium text-text-primary">{t("kontakt.addressLabel")}</p>
              <p>{LEGAL_ENTITY.address}</p>
            </div>
          </li>
        </ul>
      </Section>

      <Section title={t("kontakt.supportHeading")}>
        <p>
          {t("kontakt.supportPre")}{" "}
          <a href={`mailto:${LEGAL_ENTITY.email}`} className="underline hover:text-text-primary">
            {LEGAL_ENTITY.email}
          </a>
          {t("kontakt.supportMid")}{" "}
          <Link to="/reklamacni-podminky" className="underline hover:text-text-primary">
            {t("kontakt.supportComplaintsLink")}
          </Link>{" "}
          {t("kontakt.supportAnd")}{" "}
          <Link to="/obchodni-podminky#cl-10" className="underline hover:text-text-primary">
            {t("kontakt.supportTermsLink")}
          </Link>
          .
        </p>
      </Section>

      <Section title={t("kontakt.legalHeading")}>
        <ul className="grid gap-2 sm:grid-cols-2">
          <li>
            <Link to="/obchodni-podminky" className="underline hover:text-text-primary">
              {t("kontakt.legalTerms")}
            </Link>
          </li>
          <li>
            <Link to="/reklamacni-podminky" className="underline hover:text-text-primary">
              {t("kontakt.legalComplaints")}
            </Link>
          </li>
          <li>
            <Link to="/dodaci-a-platebni-podminky" className="underline hover:text-text-primary">
              {t("kontakt.legalDelivery")}
            </Link>
          </li>
          <li>
            <Link to="/ochrana-osobnich-udaju" className="underline hover:text-text-primary">
              {t("kontakt.legalPrivacy")}
            </Link>
          </li>
          <li>
            <Link to="/zpracovatelska-smlouva" className="underline hover:text-text-primary">
              {t("kontakt.legalDpa")}
            </Link>
          </li>
          <li>
            <Link to="/cookies" className="underline hover:text-text-primary">
              {t("kontakt.legalCookies")}
            </Link>
          </li>
          <li>
            <Link to="/predplatne" className="underline hover:text-text-primary">
              {t("kontakt.legalSubscription")}
            </Link>
          </li>
        </ul>
        {lang !== "cs" ? (
          <p className="mt-2 text-xs text-text-tertiary">{t("kontakt.legalLangNote")}</p>
        ) : null}
      </Section>
    </LegalPageLayout>
  );
}
