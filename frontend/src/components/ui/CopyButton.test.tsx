import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CopyButton } from "@/components/ui/CopyButton";

describe("CopyButton", () => {
  const writeText = vi.fn<(text: string) => Promise<void>>();
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    writeText.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it("copies the value and confirms it", async () => {
    render(<CopyButton value="eva@demo.cz" label="Kopírovat e-mail" copiedLabel="Zkopírováno" />);

    fireEvent.click(screen.getByRole("button", { name: "Kopírovat e-mail" }));

    expect(writeText).toHaveBeenCalledWith("eva@demo.cz");
    // The label flips so the click has visible confirmation, not just a
    // silent clipboard write.
    expect(await screen.findByRole("button", { name: "Zkopírováno" })).toBeInTheDocument();
  });

  it("only copies — it never fires the surrounding click target", async () => {
    const onParentClick = vi.fn();
    render(
      // The button sits inside clickable chrome (a contact row, a link card).
      // Copying must not also open whatever that chrome does.
      <div onClick={onParentClick}>
        <CopyButton value="eva@demo.cz" label="Kopírovat e-mail" copiedLabel="Zkopírováno" />
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Kopírovat e-mail" }));

    expect(writeText).toHaveBeenCalledWith("eva@demo.cz");
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it("falls back to a prompt when the clipboard API is unavailable", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    const prompt = vi.spyOn(window, "prompt").mockReturnValue(null);
    render(
      <CopyButton
        value="eva@demo.cz"
        label="Kopírovat e-mail"
        copiedLabel="Zkopírováno"
        promptLabel="Zkopírujte e-mail:"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Kopírovat e-mail" }));

    // Plain HTTP and some in-app browsers have no clipboard API — the value
    // still has to be reachable. The fallback runs in the rejection handler,
    // so it lands a microtask after the click.
    await waitFor(() => expect(prompt).toHaveBeenCalledWith("Zkopírujte e-mail:", "eva@demo.cz"));
  });
});
