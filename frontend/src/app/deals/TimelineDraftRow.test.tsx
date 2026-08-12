import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

/** Focus leaving the whole draft — what actually commits it. */
function leaveDraft(relatedTarget: Element | null = null) {
  fireEvent.blur(draft(), { relatedTarget });
}

describe("TimelineDraftRow", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue({ id: "a1" });
    toastError.mockReset();
  });

  it("does not POST when the draft was never touched", async () => {
    render(<TimelineDraftRow dealId="d1" />);
    leaveDraft();
    await waitFor(() => expect(mutateAsync).not.toHaveBeenCalled());
  });

  it("does not POST when the body holds only whitespace", async () => {
    render(<TimelineDraftRow dealId="d1" />);
    fireEvent.change(body(), { target: { value: "   " } });
    leaveDraft();
    await waitFor(() => expect(mutateAsync).not.toHaveBeenCalled());
  });

  it("POSTs once on blur after typing, then clears the field", async () => {
    render(<TimelineDraftRow dealId="d1" />);
    fireEvent.change(body(), { target: { value: "Zavolal jsem Petrovi" } });
    leaveDraft();
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(posted()).toMatchObject({ body: "Zavolal jsem Petrovi", label_id: null });
    await waitFor(() => expect(body().value).toBe(""));
  });

  it("stays put while focus moves between the draft's own fields", async () => {
    render(<TimelineDraftRow dealId="d1" />);
    fireEvent.change(body(), { target: { value: "Rozpracováno" } });
    // Tabbing from the text input to the time input inside the same draft.
    leaveDraft(time());
    await waitFor(() => expect(mutateAsync).not.toHaveBeenCalled());
    expect(body().value).toBe("Rozpracováno");
  });

  it("commits a kind on its own, with no description", async () => {
    render(<TimelineDraftRow dealId="d1" />);
    fireEvent.click(screen.getByTestId(ids.timelineDraftKind));
    leaveDraft();
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(posted()).toMatchObject({ label_id: "label-1", body: null });
  });

  it("commits on Ctrl+Enter without waiting for blur", async () => {
    render(<TimelineDraftRow dealId="d1" />);
    fireEvent.change(body(), { target: { value: "Poslal jsem nabídku" } });
    fireEvent.keyDown(body(), { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(posted()).toMatchObject({ body: "Poslal jsem nabídku" });
  });

  it("sends the naive local time as a tz-aware instant", async () => {
    render(<TimelineDraftRow dealId="d1" />);
    fireEvent.change(body(), { target: { value: "Schůzka" } });
    fireEvent.change(time(), { target: { value: "2026-08-10T09:00" } });
    leaveDraft();
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    // 9:00 local — whatever offset the runner sits at — never 9:00 UTC.
    expect(posted().occurred_at).toBe(new Date(2026, 7, 10, 9, 0, 0, 0).toISOString());
  });

  it("re-reads 'now' into the time field after a successful save", async () => {
    render(<TimelineDraftRow dealId="d1" />);
    fireEvent.change(body(), { target: { value: "Zpětný zápis" } });
    fireEvent.change(time(), { target: { value: "2026-08-10T09:00" } });
    leaveDraft();
    await waitFor(() => expect(time().value).not.toBe("2026-08-10T09:00"));
    const reset = new Date(time().value).getTime();
    expect(Math.abs(reset - Date.now())).toBeLessThan(120_000);
  });

  it("keeps the typing and toasts when the save fails", async () => {
    mutateAsync.mockRejectedValueOnce(new Error("boom"));
    render(<TimelineDraftRow dealId="d1" />);
    fireEvent.change(body(), { target: { value: "Nepovede se" } });
    leaveDraft();
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(body().value).toBe("Nepovede se");
  });

  it("clears the draft on Escape without saving", async () => {
    render(<TimelineDraftRow dealId="d1" />);
    fireEvent.change(body(), { target: { value: "Přehlédnuto" } });
    fireEvent.keyDown(body(), { key: "Escape" });
    await waitFor(() => expect(body().value).toBe(""));
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
