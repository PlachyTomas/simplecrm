import { act, renderHook } from "@testing-library/react";

import { useDismissGuard } from "@/lib/useDismissGuard";

/** Minimal stand-in for the backdrop click event the hook inspects. */
function backdropClick(onBackdrop = true) {
  const backdrop = document.createElement("div");
  const child = document.createElement("div");
  return {
    target: onBackdrop ? backdrop : child,
    currentTarget: backdrop,
  } as unknown as React.MouseEvent;
}

describe("useDismissGuard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("closes a clean dialog on backdrop click", () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => useDismissGuard(onClose, false));
    act(() => result.current.onBackdropClick(backdropClick()));
    expect(onClose).toHaveBeenCalledOnce();
    expect(result.current.nudgeClass).toBe("");
  });

  it("ignores clicks that land inside the panel", () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => useDismissGuard(onClose, true));
    act(() => result.current.onBackdropClick(backdropClick(false)));
    expect(onClose).not.toHaveBeenCalled();
    expect(result.current.nudgeClass).toBe("");
  });

  it("blocks close and nudges while dirty, then clears the nudge", () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => useDismissGuard(onClose, true));
    act(() => {
      result.current.onBackdropClick(backdropClick());
      vi.advanceTimersToNextFrame();
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(result.current.nudgeClass).toBe("dialog-dismiss-nudge");
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.nudgeClass).toBe("");
  });

  it("closes again once the form is cleared", () => {
    const onClose = vi.fn();
    const { result, rerender } = renderHook(({ dirty }) => useDismissGuard(onClose, dirty), {
      initialProps: { dirty: true },
    });
    act(() => {
      result.current.onBackdropClick(backdropClick());
      vi.advanceTimersToNextFrame();
    });
    expect(onClose).not.toHaveBeenCalled();
    rerender({ dirty: false });
    act(() => result.current.onBackdropClick(backdropClick()));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
