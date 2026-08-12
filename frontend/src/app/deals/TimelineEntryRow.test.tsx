import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActivityItem } from "@/app/activities/ActivityRow";
import { TimelineEntryRow } from "@/app/deals/TimelineEntryRow";
import { testIds } from "@/lib/testids";

const { updateAsync, deleteMutate, toastError } = vi.hoisted(() => ({
  updateAsync: vi.fn(),
  deleteMutate: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/app/activities/useActivityEdit", () => ({
  useUpdateActivity: () => ({ mutateAsync: updateAsync, isPending: false }),
  useDeleteActivity: () => ({ mutate: deleteMutate, isPending: false }),
}));

vi.mock("@/lib/toast", () => ({
  useToast: () => ({ error: toastError, success: vi.fn(), toast: vi.fn() }),
}));

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
      onClick={() => onChange({ id: "label-9", name: "Schůzka", color: "#EC4899" })}
    >
      {value?.name ?? "—"}
    </button>
  ),
}));

const ids = testIds.deals.detail;

/** The single PATCH the row sent, without tripping `noUncheckedIndexedAccess`. */
function patched(): unknown {
  return updateAsync.mock.calls[0]?.[0];
}

const MANUAL: ActivityItem = {
  id: "a1",
  organization_id: "org1",
  entity_type: "deal",
  entity_id: "d1",
  user_id: "u1",
  user_name: "Jan Novák",
  activity_type: "manual_action",
  payload: { note: "Prošli jsme rozpočet" },
  created_at: "2026-08-10T07:00:00+00:00",
  occurred_at: "2026-08-10T07:00:00+00:00",
  label: { id: "label-1", name: "Hovor", color: "#6366F1" },
  can_edit: true,
};

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function renderRow(activity: ActivityItem = MANUAL) {
  return render(<TimelineEntryRow activity={activity} />, { wrapper });
}

function bodyField() {
  return screen.getByTestId(ids.timelineEntryBody("a1")) as HTMLTextAreaElement;
}

describe("TimelineEntryRow", () => {
  beforeEach(() => {
    updateAsync.mockReset();
    updateAsync.mockResolvedValue({ ...MANUAL });
    deleteMutate.mockReset();
    toastError.mockReset();
  });

  it("PATCHes the body on blur", async () => {
    renderRow();
    fireEvent.change(bodyField(), { target: { value: "Chtějí variantu B" } });
    fireEvent.blur(bodyField());
    await waitFor(() => expect(updateAsync).toHaveBeenCalledTimes(1));
    expect(patched()).toEqual({ id: "a1", patch: { body: "Chtějí variantu B" } });
  });

  it("does not PATCH when the text is unchanged", async () => {
    renderRow();
    fireEvent.blur(bodyField());
    await waitFor(() => expect(updateAsync).not.toHaveBeenCalled());
  });

  it("PATCHes on an 800 ms pause in typing, with no blur", async () => {
    vi.useFakeTimers();
    try {
      renderRow();
      fireEvent.change(bodyField(), { target: { value: "Psaní bez odchodu" } });
      await act(() => vi.advanceTimersByTimeAsync(799));
      expect(updateAsync).not.toHaveBeenCalled();
      await act(() => vi.advanceTimersByTimeAsync(2));
      expect(updateAsync).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reverts and toasts when the PATCH fails", async () => {
    updateAsync.mockRejectedValueOnce(new Error("boom"));
    renderRow();
    fireEvent.change(bodyField(), { target: { value: "Ztraceno" } });
    fireEvent.blur(bodyField());
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(bodyField().value).toBe("Prošli jsme rozpočet");
  });

  it("saves the kind as soon as it changes", async () => {
    renderRow();
    fireEvent.click(screen.getByTestId(ids.timelineEntryKind("a1")));
    await waitFor(() => expect(updateAsync).toHaveBeenCalledTimes(1));
    expect(patched()).toEqual({ id: "a1", patch: { label_id: "label-9" } });
  });

  it("edits the time in place and sends it as a tz-aware instant", async () => {
    renderRow();
    fireEvent.click(screen.getByTestId(ids.timelineEntryTime("a1")));
    const input = screen.getByTestId(ids.timelineEntryTime("a1")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2026-08-09T16:30" } });
    fireEvent.blur(input);
    await waitFor(() => expect(updateAsync).toHaveBeenCalledTimes(1));
    expect(patched()).toEqual({
      id: "a1",
      patch: { occurred_at: new Date(2026, 7, 9, 16, 30, 0, 0).toISOString() },
    });
  });

  it("deletes behind a confirmation", async () => {
    renderRow();
    fireEvent.click(screen.getByTestId(ids.timelineEntryDelete("a1")));
    fireEvent.click(screen.getByTestId(testIds.confirmDialog.confirm));
    await waitFor(() => expect(deleteMutate).toHaveBeenCalledTimes(1));
    expect(deleteMutate.mock.calls[0]?.[0]).toBe("a1");
  });

  it("renders no edit affordances when can_edit is false", () => {
    renderRow({ ...MANUAL, can_edit: false });
    expect(screen.queryByTestId(ids.timelineEntryDelete("a1"))).toBeNull();
    expect(screen.queryByTestId(ids.timelineEntryBody("a1"))).toBeNull();
  });
});
