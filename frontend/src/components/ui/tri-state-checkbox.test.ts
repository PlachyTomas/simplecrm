import { describe, expect, it } from "vitest";

import { checkState } from "@/components/ui/tri-state-checkbox";

describe("checkState", () => {
  it("maps selected/total to the tri-state checkbox", () => {
    expect(checkState(0, 3)).toBe("none");
    expect(checkState(2, 3)).toBe("some");
    expect(checkState(3, 3)).toBe("all");
    expect(checkState(0, 0)).toBe("none");
  });
});
