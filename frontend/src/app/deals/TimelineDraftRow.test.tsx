import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TimelineDraftRow } from "@/app/deals/TimelineDraftRow";
import { testIds } from "@/lib/testids";

// `vi.mock` factories are hoisted above the imports, so the spies they close
// over have to be hoisted too.
const { mutateAsync, toastError } = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/app/activities/useActivityEdit", () => ({
  useCreateDealAction: () => ({ mutateAsync, isPending: false }),
}));

vi.mock("@/lib/toast", () => ({
  useToast: () => ({ error: toastError, success: vi.fn(), toast: vi.fn() }),
}));

// The real picker fetches the org's label vocabulary; the draft's own
// behavior is what is under test, so stand in a button that hands back one
// fixed kind.
vi.mock("@/app/activities/ActivityKindPicker", () => ({
  ActivityKindPicker: ({
    value,
    onChange,
    testId,
  }: {
    value: { id: string; name: string } | null;
    onChange: (label: { id: string; name: string; color: string }) => void;
    testId: string;
  }) => (
    <button
      type="button"
      data-testid={testId}
      onClick={() => onChange({ id: "label-1", name: "Hovor", color: "#6366F1" })}
    >
      {value?.name ?? "—"}
    </button>
  ),
}));

const ids = testIds.deals.detail;

/** The payload the draft POSTed, without tripping `noUncheckedIndexedAccess`. */
function posted(): Record<string, unknown> {
  return (mutateAsync.mock.calls[0]?.[0] ?? {}) as Record<string, unknown>;
}

function draft() {
  return screen.getByTestId(ids.timelineDraft);
}

function body() {
  return screen.getByTestId(ids.timelineDraftBody) as HTMLInputElement;
}

function time() {
  return screen.getByTestId(ids.timelineDraftTime) as HTMLInputElement;
}

function submit() {
  return screen.getByTestId(ids.timelineDraftSubmit) as HTMLButtonElement;
}

describe("TimelineDraftRow", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue({ id: "a1" });
    toastError.mockReset();
  });

  it("keeps the add button disabled while the draft is empty", () => {
    render(<TimelineDraftRow dealId="d1" />);
    expect(submit()).toBeDisabled();
    fireEvent.change(body(), { target: { value: "   " } });
    expect(submit()).toBeDisabled();
    fireEvent.click(submit());
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("never POSTs on blur — the regression that added entries mid-edit", async () => {
    render(<TimelineDraftRow dealId="d1" />);
    fireEvent.change(body(), { target: { value: "Rozepsaná poznámka" } });
    // Focus leaving for the kind picker (or anywhere else) must not commit.
    fireEvent.blur(draft(), { relatedTarget: null });
    await waitFor(() => expect(mutateAsync).not.toHaveBeenCalled());
    expect(body().value).toBe("Rozepsaná poznámka");
  });

  it("POSTs once on the add button, then clears the field", async () => {
    render(<TimelineDraftRow dealId="d1" />);
    fireEvent.change(body(), { target: { value: "Zavolal jsem Petrovi" } });
    fireEvent.click(submit());
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(posted()).toMatchObject({ body: "Zavolal jsem Petrovi", label_id: null });
    await waitFor(() => expect(body().value).toBe(""));
  });

  it("commits a kind on its own, with no description", async () => {
    render(<TimelineDraftRow dealId="d1" />);
    fireEvent.click(screen.getByTestId(ids.timelineDraftKind));
    fireEvent.click(submit());
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(posted()).toMatchObject({ label_id: "label-1", body: null });
  });

  it("commits on plain Enter in the text field", async () => {
    render(<TimelineDraftRow dealId="d1" />);
    fireEvent.change(body(), { target: { value: "Poslal jsem nabídku" } });
    fireEvent.keyDown(body(), { key: "Enter" });
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(posted()).toMatchObject({ body: "Poslal jsem nabídku" });
  });

  it("commits on Ctrl+Enter as before", async () => {
    render(<TimelineDraftRow dealId="d1" />);
    fireEvent.change(body(), { target: { value: "Zápis z jednání" } });
    fireEvent.keyDown(body(), { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
  });

  it("sends the naive local time as a tz-aware instant", async () => {
    render(<TimelineDraftRow dealId="d1" />);
    fireEvent.change(body(), { target: { value: "Schůzka" } });
    fireEvent.change(time(), { target: { value: "2026-08-10T09:00" } });
    fireEvent.click(submit());
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    // 9:00 local — whatever offset the runner sits at — never 9:00 UTC.
    expect(posted().occurred_at).toBe(new Date(2026, 7, 10, 9, 0, 0, 0).toISOString());
  });

  it("commits the real save time when the time field was never touched", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.setSystemTime(new Date(2026, 7, 10, 9, 0, 0, 0));
      render(<TimelineDraftRow dealId="d1" />);
      expect(time().value).toBe("2026-08-10T09:00");
      // The row sits open while other things happen; the prefill goes stale.
      const saveMoment = new Date(2026, 7, 10, 9, 5, 30, 0);
      vi.setSystemTime(saveMoment);
      fireEvent.change(body(), { target: { value: "Hovor po pauze" } });
      fireEvent.click(submit());
      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
      const occurred = new Date(posted().occurred_at as string).getTime();
      // The actual commit moment — never the minute-rounded 9:00 prefill,
      // which would sort the entry under anything logged since mount.
      expect(Math.abs(occurred - saveMoment.getTime())).toBeLessThan(2_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the untouched prefill tracking now, and stops once touched", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 7, 10, 9, 0, 0, 0));
      render(<TimelineDraftRow dealId="d1" />);
      expect(time().value).toBe("2026-08-10T09:00");
      act(() => {
        vi.setSystemTime(new Date(2026, 7, 10, 9, 3, 0, 0));
        vi.advanceTimersByTime(30_000);
      });
      expect(time().value).toBe("2026-08-10T09:03");
      fireEvent.change(time(), { target: { value: "2026-08-10T08:00" } });
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(time().value).toBe("2026-08-10T08:00");
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-reads 'now' into the time field after a successful save", async () => {
    render(<TimelineDraftRow dealId="d1" />);
    fireEvent.change(body(), { target: { value: "Zpětný zápis" } });
    fireEvent.change(time(), { target: { value: "2026-08-10T09:00" } });
    fireEvent.click(submit());
    await waitFor(() => expect(time().value).not.toBe("2026-08-10T09:00"));
    const reset = new Date(time().value).getTime();
    expect(Math.abs(reset - Date.now())).toBeLessThan(120_000);
  });

  it("keeps the typing and toasts when the save fails", async () => {
    mutateAsync.mockRejectedValueOnce(new Error("boom"));
    render(<TimelineDraftRow dealId="d1" />);
    fireEvent.change(body(), { target: { value: "Nepovede se" } });
    fireEvent.click(submit());
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(body().value).toBe("Nepovede se");
  });

  it("leaves Enter on the kind chip to the chip itself — no premature POST", async () => {
    render(<TimelineDraftRow dealId="d1" />);
    fireEvent.change(body(), { target: { value: "Rozepsaná poznámka" } });
    // Keyboard path of the original bug: Enter on the picker trigger must
    // open the picker (native button activation), never commit the draft.
    fireEvent.keyDown(screen.getByTestId(ids.timelineDraftKind), { key: "Enter" });
    await waitFor(() => expect(mutateAsync).not.toHaveBeenCalled());
    expect(body().value).toBe("Rozepsaná poznámka");
  });

  it("ignores an IME candidate-confirming Enter", async () => {
    render(<TimelineDraftRow dealId="d1" />);
    fireEvent.change(body(), { target: { value: "変換中" } });
    fireEvent.keyDown(body(), { key: "Enter", isComposing: true });
    await waitFor(() => expect(mutateAsync).not.toHaveBeenCalled());
    expect(body().value).toBe("変換中");
  });

  it("POSTs once for two rapid activations and refocuses the text field", async () => {
    let resolve!: (v: unknown) => void;
    mutateAsync.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    render(<TimelineDraftRow dealId="d1" />);
    fireEvent.change(body(), { target: { value: "Dvojklik" } });
    fireEvent.click(submit());
    fireEvent.click(submit());
    resolve({ id: "a1" });
    await waitFor(() => expect(body().value).toBe(""));
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(body());
  });

  it("clears the draft on Escape without saving", async () => {
    render(<TimelineDraftRow dealId="d1" />);
    fireEvent.change(body(), { target: { value: "Přehlédnuto" } });
    fireEvent.keyDown(body(), { key: "Escape" });
    await waitFor(() => expect(body().value).toBe(""));
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
