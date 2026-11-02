import { describe, expect, it } from "vitest";
import { flyerStatus } from "../src/chat/flyerStatus.js";

const fallFlyer = { validFrom: "2026-11-02", validTo: "2026-11-15" };

describe("flyerStatus", () => {
  it.each([
    ["2026-10-28", "UPCOMING, starts 2026-11-02, ends 2026-11-15"],
    ["2026-11-01", "UPCOMING, starts 2026-11-02, ends 2026-11-15"],
    ["2026-11-02", "ACTIVE today, ends 2026-11-15"],
    ["2026-11-05", "ACTIVE today, ends 2026-11-15"],
    ["2026-11-15", "ACTIVE today, ends 2026-11-15"],
    ["2026-11-16", "EXPIRED on 2026-11-15"],
  ])("on %s is %s (both ends of the range are inclusive)", (today, expected) => {
    expect(flyerStatus(fallFlyer, today)).toBe(expected);
  });

  it("returns undefined for a chunk with no sale period", () => {
    expect(flyerStatus({}, "2026-11-05")).toBeUndefined();
  });
});
