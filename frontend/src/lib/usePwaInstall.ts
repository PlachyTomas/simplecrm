import { useCallback, useEffect, useState } from "react";

/** Chrome's non-standard install event — not in lib.dom. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const subscribers = new Set<() => void>();

function notify(): void {
  for (const subscriber of subscribers) subscriber();
}

// Module-level capture: Chrome fires `beforeinstallprompt` once, early —
// often before React mounts — so the listener can't live inside the hook.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

/** Running as an installed app (Android/desktop standalone or iOS A2HS). */
export function isStandalone(): boolean {
  return (
    (window.matchMedia("(display-mode: standalone)")?.matches ?? false) ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPadOS 13+ reports as Macintosh; it's the only "Mac" with multi-touch. */
export function isIos(): boolean {
  const ua = window.navigator.userAgent;
  return (
    /iPhone|iPad|iPod/.test(ua) ||
    (ua.includes("Macintosh") && window.navigator.maxTouchPoints > 1)
  );
}

/**
 * Single source of truth for every install surface. A surface should render
 * when `!isInstalled && (canPrompt || isIos)` — Chromium exposes a prompt,
 * iOS gets manual Add-to-Home-Screen instructions instead.
 */
export function usePwaInstall() {
  const [canPrompt, setCanPrompt] = useState(() => deferredPrompt !== null);
  const [isInstalled, setIsInstalled] = useState(() => isStandalone());

  useEffect(() => {
    const update = () => setCanPrompt(deferredPrompt !== null);
    subscribers.add(update);
    update();
    const mql = window.matchMedia("(display-mode: standalone)");
    const onChange = () => setIsInstalled(isStandalone());
    mql?.addEventListener?.("change", onChange);
    return () => {
      subscribers.delete(update);
      mql?.removeEventListener?.("change", onChange);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    const event = deferredPrompt;
    if (!event) return "unavailable";
    // One-shot: Chrome forbids reusing a spent prompt event.
    deferredPrompt = null;
    notify();
    await event.prompt();
    const choice = await event.userChoice;
    return choice.outcome;
  }, []);

  return { canPrompt, isInstalled, isIos: isIos(), promptInstall };
}
