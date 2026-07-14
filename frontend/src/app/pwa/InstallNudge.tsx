import { useState } from "react";
import { useTranslation } from "react-i18next";

import { IosInstallModal } from "@/app/pwa/IosInstallModal";
import { shouldShowNudge, snoozeNudge, suppressNudge } from "@/lib/pwaInstallPrefs";
import { testIds } from "@/lib/testids";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { usePwaInstall } from "@/lib/usePwaInstall";

/**
 * One-time "install SimpleCRM" hint for mobile browsers, anchored above the
 * tab bar. Shows only when installing is actually possible here (Chromium
 * prompt captured, or iOS where instructions replace the prompt).
 */
export function InstallNudge() {
  const { t } = useTranslation("common");
  const isMobile = useMediaQuery("(max-width: 767px)");
  const { canPrompt, isInstalled, isIos, promptInstall } = usePwaInstall();
  const [visible, setVisible] = useState(() => shouldShowNudge());
  const [iosModalOpen, setIosModalOpen] = useState(false);

  if (!isMobile || isInstalled || (!canPrompt && !isIos)) return null;
  if (!visible && !iosModalOpen) return null;

  const handleInstall = () => {
    // The user made a decision — never nag again on this device.
    suppressNudge();
    setVisible(false);
    if (isIos) {
      setIosModalOpen(true);
      return;
    }
    void promptInstall();
  };

  const handleLater = () => {
    snoozeNudge();
    setVisible(false);
  };

  const handleNever = () => {
    suppressNudge();
    setVisible(false);
  };

  return (
    <>
      {visible ? (
        <div
          data-testid={testIds.pwa.nudge}
          className="fixed inset-x-0 bottom-16 z-40 px-3 md:hidden"
        >
          <div className="rounded-lg border border-border bg-surface-elevated p-3 shadow-lg">
            <p className="text-sm text-text-secondary">{t("pwa.nudge.message")}</p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                data-testid={testIds.pwa.nudgeInstall}
                onClick={handleInstall}
                className="inline-flex h-8 items-center justify-center rounded-md bg-accent px-3 text-xs font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
              >
                {t("pwa.nudge.install")}
              </button>
              <button
                type="button"
                data-testid={testIds.pwa.nudgeLater}
                onClick={handleLater}
                className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-surface-overlay px-3 text-xs font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary"
              >
                {t("pwa.nudge.later")}
              </button>
              <button
                type="button"
                data-testid={testIds.pwa.nudgeNever}
                onClick={handleNever}
                className="ml-auto rounded-md text-xs text-text-tertiary underline-offset-2 transition-colors duration-fast hover:text-text-secondary hover:underline"
              >
                {t("pwa.nudge.never")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <IosInstallModal open={iosModalOpen} onClose={() => setIosModalOpen(false)} />
    </>
  );
}
