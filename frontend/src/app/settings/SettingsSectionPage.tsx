import { ArrowLeft } from "lucide-react";
import { type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useParams } from "react-router-dom";

import { BlockedCompaniesSection } from "@/app/settings/BlockedCompaniesSection";
import { InvitationsSection } from "@/app/settings/InvitationsSection";
import { PrivacySection } from "@/app/settings/PrivacySection";
import { AppearanceSection } from "@/app/settings/sections/AppearanceSection";
import { BillingSection } from "@/app/settings/sections/BillingSection";
import { IntegrationsSection } from "@/app/settings/sections/IntegrationsSection";
import { OrganizationSection } from "@/app/settings/sections/OrganizationSection";
import { PermissionsSection } from "@/app/settings/sections/PermissionsSection";
import { PipelineSection } from "@/app/settings/sections/PipelineSection";
import {
  defaultSectionKey,
  isSettingsSectionKey,
  SETTINGS_SECTIONS,
  visibleSectionKeys,
  type SettingsSectionKey,
} from "@/app/settings/settingsNav";
import { TeamsSection } from "@/app/settings/TeamsSection";
import { UsersSection } from "@/app/settings/UsersSection";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { usePageTitle } from "@/lib/usePageTitle";

const SECTION_COMPONENTS: Record<SettingsSectionKey, ComponentType> = {
  pipeline: PipelineSection,
  teams: TeamsSection,
  users: UsersSection,
  invitations: InvitationsSection,
  appearance: AppearanceSection,
  permissions: PermissionsSection,
  "blocked-companies": BlockedCompaniesSection,
  organization: OrganizationSection,
  billing: BillingSection,
  integrations: IntegrationsSection,
  privacy: PrivacySection,
};

export function SettingsSectionPage() {
  const { t } = useTranslation("settings");
  const { section } = useParams();
  const { data: user } = useCurrentUser();
  const meta = isSettingsSectionKey(section)
    ? SETTINGS_SECTIONS.find((s) => s.key === section)
    : undefined;
  const sectionLabel = meta ? t(meta.labelKey) : null;
  usePageTitle(
    sectionLabel
      ? t("sectionPage.pageTitleWithSection", { label: sectionLabel })
      : t("sectionPage.pageTitleDefault"),
  );

  if (!user) {
    return (
      <div className="p-8 text-sm text-text-tertiary" role="status">
        {t("sectionPage.loading")}
      </div>
    );
  }

  const visibleKeys = visibleSectionKeys(user.role, user.can_invite);
  if (!meta || !visibleKeys.includes(meta.key)) {
    return (
      <Navigate to={`/app/settings/${defaultSectionKey(user.role, user.can_invite)}`} replace />
    );
  }

  const Section = SECTION_COMPONENTS[meta.key];

  return (
    <div>
      <Link
        to="/app/settings"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary md:hidden"
      >
        <ArrowLeft size={16} strokeWidth={1.75} aria-hidden />
        {t("sectionPage.backLink")}
      </Link>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">{sectionLabel}</h1>
        <p className="mt-1 text-sm text-text-tertiary">{t(meta.descriptionKey)}</p>
      </header>
      <Section />
    </div>
  );
}
