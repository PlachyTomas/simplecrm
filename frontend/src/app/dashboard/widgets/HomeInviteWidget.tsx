import { useTranslation } from "react-i18next";

import { InviteTeammatesCard } from "@/app/dashboard/InviteTeammatesCard";
import type { HomeWidgetEntry } from "@/app/dashboard/useHomeDashboard";
import { HomeEditChrome } from "@/app/dashboard/widgets/HomeEditChrome";
import { useCurrentUser } from "@/auth/useCurrentUser";

interface HomeInviteWidgetProps {
  entry: HomeWidgetEntry;
  isEditMode: boolean;
  onRemove: () => void;
}

/**
 * Home wrapper around `InviteTeammatesCard`. The card self-gates
 * (`admin`/`can_invite`, hides once the org is full). For ineligible users
 * it renders nothing in view mode; in edit mode we still show a removable
 * "not available" placeholder so a stale saved widget can be dropped.
 */
export function HomeInviteWidget({ entry, isEditMode, onRemove }: HomeInviteWidgetProps) {
  const { t } = useTranslation("dashboard");
  const { data: user } = useCurrentUser();
  const canManage = !!(user && (user.role === "admin" || user.can_invite));
  const label = t("widgetLabels.invite_teammates");

  if (!canManage) {
    if (!isEditMode) return null;
    return (
      <HomeEditChrome isEditMode widgetId={entry.id} label={label} onRemove={onRemove}>
        <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border bg-surface p-6 text-center text-xs text-text-tertiary">
          {t("widgetUnavailable.title")}
        </div>
      </HomeEditChrome>
    );
  }

  return (
    <HomeEditChrome isEditMode={isEditMode} widgetId={entry.id} label={label} onRemove={onRemove}>
      <div className="h-full">
        <InviteTeammatesCard />
      </div>
    </HomeEditChrome>
  );
}
