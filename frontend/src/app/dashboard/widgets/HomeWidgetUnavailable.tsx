import { useTranslation } from "react-i18next";

/**
 * Quiet "not available" body for a widget whose data returns 401/403 —
 * e.g. an org toggled off a leaderboard flag after the widget was saved.
 * The widget stays removable in edit mode via its frame.
 */
export function HomeWidgetUnavailable() {
  const { t } = useTranslation("dashboard");
  return (
    <div className="flex h-full items-center justify-center px-2 text-center text-xs text-text-tertiary">
      {t("widgetUnavailable.title")}
    </div>
  );
}
