import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { useModalDialog } from "@/lib/useModalDialog";

function TestModal({ onClose, open }: { onClose: () => void; open: boolean }) {
  const ref = useModalDialog<HTMLDivElement>(onClose, open);
  if (!open) return null;
  return (
    <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true">
      <button>First</button>
      <button>Last</button>
    </div>
  );
}

describe("useModalDialog", () => {
  it("moves focus into the dialog on open", () => {
    render(<TestModal onClose={() => {}} open />);
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<TestModal onClose={onClose} open />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("activates when open flips from false to true (always-mounted pattern)", async () => {
    // Regression for the always-mounted-with-early-return dialogs: the trap must
    // key off `active`, not mount, or it never engages when the dialog opens.
    const onClose = vi.fn();
    const { rerender } = render(<TestModal onClose={onClose} open={false} />);
    expect(screen.queryByRole("dialog")).toBeNull();

    rerender(<TestModal onClose={onClose} open />);
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
