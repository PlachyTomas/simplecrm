const STORAGE_KEY = "simplecrm-pwa-nudge";
const DAY_MS = 24 * 60 * 60 * 1000;
const REMIND_LATER_DAYS = 14;

/**
 * Install-nudge dismissal state. Deliberately device-scoped (localStorage,
 * not a server-side user pref): installing is per-device, so dismissing the
 * nudge on a phone must not silence it on a tablet.
 */
interface NudgeState {
  never?: boolean;
  remindAfter?: number;
}

function readState(): NudgeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as NudgeState) : {};
  } catch {
    return {};
  }
}

function writeState(state: NudgeState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — the nudge simply reappears next visit */
  }
}

export function shouldShowNudge(now: number = Date.now()): boolean {
  const state = readState();
  if (state.never) return false;
  if (typeof state.remindAfter === "number" && now < state.remindAfter) return false;
  return true;
}

export function snoozeNudge(now: number = Date.now()): void {
  writeState({ remindAfter: now + REMIND_LATER_DAYS * DAY_MS });
}

export function suppressNudge(): void {
  writeState({ never: true });
}
