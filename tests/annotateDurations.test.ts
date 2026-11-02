import { describe, expect, it } from "vitest";
import { annotateDurations } from "../src/chat/annotateDurations.js";

describe("annotateDurations", () => {
  it.each([
    ["I opened my drill 5 weeks ago.", "I opened my drill 5 weeks (= 35 days) ago."],
    ["bought it three weeks ago", "bought it three weeks (= 21 days) ago"],
    ["It broke after 2 years.", "It broke after 2 years (= 730 days)."],
    ["about a month ago", "about a month (= 30 days) ago"],
    ["1.5 years old", "1.5 years (= 548 days) old"],
  ])("annotates %j", (input, expected) => {
    expect(annotateDurations(input)).toBe(expected);
  });

  it("leaves messages without periods, and periods already in days, unchanged", () => {
    expect(annotateDurations("Do you rent tile saws for 3 days?")).toBe("Do you rent tile saws for 3 days?");
    expect(annotateDurations("Is there a yearly fee?")).toBe("Is there a yearly fee?");
  });
});
