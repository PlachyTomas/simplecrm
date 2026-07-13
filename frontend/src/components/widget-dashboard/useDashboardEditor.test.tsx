import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useDashboardEditor } from "./useDashboardEditor";

interface Cfg {
  widgets: string[];
}

describe("useDashboardEditor", () => {
  it("shows the loaded config as working in view mode", () => {
    const loaded: Cfg = { widgets: ["a"] };
    const { result } = renderHook(() =>
      useDashboardEditor<Cfg>({ loaded, onSave: vi.fn(), onReset: vi.fn() }),
    );
    expect(result.current.isEditMode).toBe(false);
    expect(result.current.draft).toBeNull();
    expect(result.current.working).toBe(loaded);
  });

  it("initializes the draft once from loaded on entering edit", () => {
    const loaded: Cfg = { widgets: ["a"] };
    const { result } = renderHook(() =>
      useDashboardEditor<Cfg>({ loaded, onSave: vi.fn(), onReset: vi.fn() }),
    );
    act(() => result.current.enterEdit());
    expect(result.current.isEditMode).toBe(true);
    expect(result.current.draft).toEqual(loaded);
    expect(result.current.working).toEqual(loaded);
  });

  it("setDraft updates the working copy while editing", () => {
    const loaded: Cfg = { widgets: ["a"] };
    const { result } = renderHook(() =>
      useDashboardEditor<Cfg>({ loaded, onSave: vi.fn(), onReset: vi.fn() }),
    );
    act(() => result.current.enterEdit());
    act(() => result.current.setDraft({ widgets: ["a", "b"] }));
    expect(result.current.working).toEqual({ widgets: ["a", "b"] });
  });

  it("cancel discards the draft and exits edit mode", () => {
    const loaded: Cfg = { widgets: ["a"] };
    const { result } = renderHook(() =>
      useDashboardEditor<Cfg>({ loaded, onSave: vi.fn(), onReset: vi.fn() }),
    );
    act(() => result.current.enterEdit());
    act(() => result.current.setDraft({ widgets: ["x"] }));
    act(() => result.current.cancel());
    expect(result.current.isEditMode).toBe(false);
    expect(result.current.draft).toBeNull();
    expect(result.current.working).toBe(loaded);
  });

  it("Escape exits edit mode without saving", () => {
    const onSave = vi.fn();
    const loaded: Cfg = { widgets: ["a"] };
    const { result } = renderHook(() =>
      useDashboardEditor<Cfg>({ loaded, onSave, onReset: vi.fn() }),
    );
    act(() => result.current.enterEdit());
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(result.current.isEditMode).toBe(false);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("save persists the draft then exits edit mode", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const loaded: Cfg = { widgets: ["a"] };
    const { result } = renderHook(() =>
      useDashboardEditor<Cfg>({ loaded, onSave, onReset: vi.fn() }),
    );
    act(() => result.current.enterEdit());
    act(() => result.current.setDraft({ widgets: ["a", "b"] }));
    await act(async () => {
      await result.current.save();
    });
    expect(onSave).toHaveBeenCalledWith({ widgets: ["a", "b"] });
    expect(result.current.isEditMode).toBe(false);
  });

  it("reset runs only when confirmReset approves", async () => {
    const onReset = vi.fn().mockResolvedValue(undefined);
    const confirmReset = vi.fn().mockReturnValue(false);
    const loaded: Cfg = { widgets: ["a"] };
    const { result } = renderHook(() =>
      useDashboardEditor<Cfg>({ loaded, onSave: vi.fn(), onReset, confirmReset }),
    );
    act(() => result.current.enterEdit());

    await act(async () => {
      await result.current.reset();
    });
    expect(onReset).not.toHaveBeenCalled();
    expect(result.current.isEditMode).toBe(true);

    confirmReset.mockReturnValue(true);
    await act(async () => {
      await result.current.reset();
    });
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(result.current.isEditMode).toBe(false);
  });
});
