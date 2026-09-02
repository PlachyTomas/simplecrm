import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EVENT_LABEL_PALETTE, nextEventLabelColor } from "@/app/events/useEventLabels";
import { EventLabelsSection } from "@/app/settings/sections/EventLabelsSection";
import { testIds } from "@/lib/testids";

const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }));

vi.mock("@/app/events/useEventLabels", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useEventLabels: () => ({ data: [], isPending: false, isError: false }),
    useCreateEventLabel: () => ({ mutateAsync, isPending: false }),
    useUpdateEventLabel: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useDeleteEventLabel: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

vi.mock("@/auth/useCurrentUser", () => ({
  useCurrentUser: () => ({ data: { id: "u1", role: "admin" } }),
}));

describe("EventLabelsSection create form", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue({ id: "l1", name: "Obhlídka", color: "#123456" });
  });

  it("creates a label with the picked color", async () => {
    render(<EventLabelsSection />);
    fireEvent.change(screen.getByTestId(testIds.eventLabels.createName), {
      target: { value: "Obhlídka" },
    });
    const picked = EVENT_LABEL_PALETTE[3]!;
    fireEvent.click(screen.getByTestId(testIds.eventLabels.createColor(picked)));
    fireEvent.click(screen.getByTestId(testIds.eventLabels.createSubmit));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ name: "Obhlídka", color: picked }),
    );
    // The input clears for the next label.
    await waitFor(() =>
      expect((screen.getByTestId(testIds.eventLabels.createName) as HTMLInputElement).value).toBe(
        "",
      ),
    );
  });

  it("defaults the color to the palette rotation and disables empty submits", async () => {
    render(<EventLabelsSection />);
    expect(screen.getByTestId(testIds.eventLabels.createSubmit)).toBeDisabled();
    fireEvent.change(screen.getByTestId(testIds.eventLabels.createName), {
      target: { value: "Telefonát" },
    });
    fireEvent.click(screen.getByTestId(testIds.eventLabels.createSubmit));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        name: "Telefonát",
        color: nextEventLabelColor(0),
      }),
    );
  });
});
