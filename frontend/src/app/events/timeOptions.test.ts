import { describe, expect, it } from "vitest";

import {
  buildEndOptions,
  buildStartOptions,
  filterTimeOptions,
  formatDuration,
  formatTimeLabel,
  hhmmFromMinutes,
  minutesFromHHMM,
  parseTimeInput,
  shiftEndPreservingDuration,
} from "@/app/events/timeOptions";

const CS = "cs-CZ";

describe("parseTimeInput", () => {
  it("accepts the loose shapes people actually type", () => {
    expect(parseTimeInput("9")).toBe("09:00");
    expect(parseTimeInput("9:30")).toBe("09:30");
    expect(parseTimeInput("9.30")).toBe("09:30");
    expect(parseTimeInput("9,30")).toBe("09:30");
    expect(parseTimeInput("9h30")).toBe("09:30");
    expect(parseTimeInput("14.15")).toBe("14:15");
    expect(parseTimeInput("930")).toBe("09:30");
    expect(parseTimeInput("0930")).toBe("09:30");
    expect(parseTimeInput("1415")).toBe("14:15");
    expect(parseTimeInput("  8 : 05 ".replace(/\s+/g, ""))).toBe("08:05");
    expect(parseTimeInput("0")).toBe("00:00");
    expect(parseTimeInput("23:59")).toBe("23:59");
  });

  it("rejects non-times and out-of-range values", () => {
    expect(parseTimeInput("")).toBeNull();
    expect(parseTimeInput("   ")).toBeNull();
    expect(parseTimeInput("schůzka")).toBeNull();
    expect(parseTimeInput("24")).toBeNull();
    expect(parseTimeInput("9:70")).toBeNull();
    expect(parseTimeInput("2560")).toBeNull();
    expect(parseTimeInput("12345")).toBeNull();
  });
});

describe("minutesFromHHMM / hhmmFromMinutes", () => {
  it("round-trips", () => {
    expect(minutesFromHHMM("09:30")).toBe(570);
    expect(hhmmFromMinutes(570)).toBe("09:30");
    expect(minutesFromHHMM("24:00")).toBeNull();
    expect(minutesFromHHMM("nope")).toBeNull();
  });

  it("clamps out-of-day minutes into the day", () => {
    expect(hhmmFromMinutes(24 * 60 + 30)).toBe("23:59");
    expect(hhmmFromMinutes(-5)).toBe("00:00");
  });
});

describe("buildStartOptions", () => {
  it("covers the whole day in quarter hours", () => {
    const options = buildStartOptions("09:00");
    expect(options).toHaveLength(96);
    expect(options[0]!.value).toBe("00:00");
    expect(options[1]!.value).toBe("00:15");
    expect(options.at(-1)!.value).toBe("23:45");
    // An on-grid current time is not duplicated.
    expect(options.filter((o) => o.value === "09:00")).toHaveLength(1);
  });

  it("keeps an off-grid existing time selectable, in order", () => {
    const options = buildStartOptions("09:37");
    expect(options).toHaveLength(97);
    const at = options.findIndex((o) => o.value === "09:37");
    expect(options[at - 1]!.value).toBe("09:30");
    expect(options[at + 1]!.value).toBe("09:45");
  });
});

describe("buildEndOptions", () => {
  it("starts one step after the start and carries durations", () => {
    const options = buildEndOptions("09:00", "10:00");
    expect(options[0]).toMatchObject({ value: "09:15", durationMinutes: 15 });
    expect(options[1]).toMatchObject({ value: "09:30", durationMinutes: 30 });
    expect(options.find((o) => o.value === "10:00")?.durationMinutes).toBe(60);
    expect(options.at(-1)!.value).toBe("23:45");
    expect(options.some((o) => o.value === "09:00")).toBe(false);
  });

  it("offsets the whole window when the start is off-grid", () => {
    const options = buildEndOptions("09:37", "10:37");
    expect(options[0]).toMatchObject({ value: "09:52", durationMinutes: 15 });
    expect(options.find((o) => o.value === "10:37")?.durationMinutes).toBe(60);
  });

  it("keeps an off-grid existing end and drops one that is not after the start", () => {
    const kept = buildEndOptions("09:00", "09:37");
    const at = kept.findIndex((o) => o.value === "09:37");
    expect(kept[at]).toMatchObject({ durationMinutes: 37 });
    expect(kept[at - 1]!.value).toBe("09:30");
    expect(kept[at + 1]!.value).toBe("09:45");

    expect(buildEndOptions("09:00", "08:00").some((o) => o.value === "08:00")).toBe(false);
  });

  it("late starts fall back to just the current end", () => {
    const options = buildEndOptions("23:50", "23:59");
    expect(options.map((o) => o.value)).toEqual(["23:59"]);
  });
});

describe("formatDuration", () => {
  it("uses Intl units, localized", () => {
    expect(formatDuration(15, CS)).toBe("15 min");
    expect(formatDuration(30, CS)).toBe("30 min");
    expect(formatDuration(60, CS)).toBe("1 h");
    expect(formatDuration(90, CS)).toBe("1,5 h");
    expect(formatDuration(75, CS)).toBe("1,25 h");
    expect(formatDuration(60, "en-GB")).toBe("1 hr");
  });
});

describe("formatTimeLabel", () => {
  it("renders clock text for the active locale", () => {
    expect(formatTimeLabel("09:05", CS)).toBe("09:05");
    expect(formatTimeLabel("23:45", "en-GB")).toBe("23:45");
    expect(formatTimeLabel("nonsense", CS)).toBe("nonsense");
  });
});

describe("filterTimeOptions", () => {
  const options = buildStartOptions("09:00");

  it("matches on digits, padded or not", () => {
    expect(filterTimeOptions(options, "9").map((o) => o.value)).toEqual([
      "09:00",
      "09:15",
      "09:30",
      "09:45",
    ]);
    expect(filterTimeOptions(options, "93").map((o) => o.value)).toEqual(["09:30"]);
    expect(filterTimeOptions(options, "9:3").map((o) => o.value)).toEqual(["09:30"]);
    expect(filterTimeOptions(options, "15").map((o) => o.value)).toEqual([
      "15:00",
      "15:15",
      "15:30",
      "15:45",
    ]);
  });

  it("returns everything for an empty query and nothing for nonsense", () => {
    expect(filterTimeOptions(options, "")).toHaveLength(options.length);
    expect(filterTimeOptions(options, "schůzka")).toHaveLength(options.length);
    expect(filterTimeOptions(options, "999")).toHaveLength(0);
  });
});

describe("shiftEndPreservingDuration", () => {
  it("keeps the slot length when the start moves", () => {
    expect(shiftEndPreservingDuration("09:00", "10:00", "11:00")).toBe("12:00");
    expect(shiftEndPreservingDuration("09:00", "09:30", "14:15")).toBe("14:45");
    // Backwards too.
    expect(shiftEndPreservingDuration("14:00", "15:30", "09:00")).toBe("10:30");
  });

  it("clamps at 23:59 instead of crossing midnight", () => {
    expect(shiftEndPreservingDuration("09:00", "10:00", "23:30")).toBe("23:59");
    expect(shiftEndPreservingDuration("09:00", "10:00", "23:45")).toBe("23:59");
  });

  it("falls back to one step when the stored slot is inverted, and no-ops on junk", () => {
    expect(shiftEndPreservingDuration("10:00", "09:00", "12:00")).toBe("12:15");
    expect(shiftEndPreservingDuration("", "10:00", "12:00")).toBe("10:00");
  });
});
