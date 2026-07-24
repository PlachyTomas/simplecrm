import { useTranslation } from "react-i18next";

import { InviteTeammatesCard, useInviteTeammatesGate } from "@/app/dashboard/InviteTeammatesCard";
import { HomeWidgetUnavailable } from "@/app/dashboard/widgets/HomeWidgetUnavailable";
import { WidgetFrame } from "@/components/widget-dashboard/WidgetFrame";

interface HomeInviteWidgetProps {
  isEditMode: boolean;
  onRemove: () => void;
}

/**
 * Home wrapper around `InviteTeammatesCard`, framed to match the other
 * widgets. The card self-gates (`admin`/`can_invite`, hides once the org is
 * full). In view mode an ineligible user gets nothing — no empty frame; in
 * edit mode the frame always renders so a stale saved widget stays removable,
 * with the "not available" body when the gate is closed.
 */
export function HomeInviteWidget({ isEditMode, onRemove }: HomeInviteWidgetProps) {
  const { t } = useTranslation("dashboard");
  const gate = useInviteTeammatesGate();
  const label = t("widgetLabels.invite_teammates");

  if (!isEditMode && !gate.visible) return null;

  return (
    <WidgetFrame label={label} isEditMode={isEditMode} onRemove={onRemove}>
      {gate.visible ? (
        // Scrolls inside the grid cell when the pending-invite list outgrows
        // the widget's saved height instead of overflowing the frame.
        <div className="h-full overflow-y-auto">
          <InviteTeammatesCard variant="embedded" />
        </div>
      ) : (
        <HomeWidgetUnavailable />
      )}
    </WidgetFrame>
  );
}
