import { describe, expect, it } from "vitest";
import { checkCase, type ServerReply } from "../src/eval/checkCase.js";

function ok(answer: string, outcome = "answer", files: string[] = []): ServerReply {
  return { status: 200, body: { answer, outcome, sources: files.map((file) => ({ file, chunkId: `${file}#1` })) } };
}

describe("checkCase", () => {
  it("passes when every rule holds", () => {
    const expectation = {
      outcome: "answer",
      mustInclude: [["9:00", "9 am"], ["sunday"]],
      mustNotInclude: ["closed on sunday"],
      mustCite: ["store-hours.md"],
      mustNotCite: ["old-website-faq.html"],
    };
    expect(checkCase(expectation, ok("On Sunday we open at 9 AM.", "answer", ["store-hours.md"]))).toEqual([]);
  });

  it("needs one option from every mustInclude group, case-insensitively", () => {
    expect(checkCase({ mustInclude: [["6:00", "6 PM"]] }, ok("We close at 6 pm."))).toEqual([]);
    expect(checkCase({ mustInclude: [["6:00", "6 pm"], ["saturday"]] }, ok("We close at 6 pm."))).toEqual(['missing group ["saturday"]']);
  });

  it("reports forbidden strings and a wrong outcome together", () => {
    expect(checkCase({ outcome: "decline", mustNotInclude: ["20%"] }, ok("Employees get 20% off."))).toEqual([
      "outcome expected decline got answer",
      'contains forbidden "20%"',
    ]);
  });

  it("needs at least one mustCite file and none of the mustNotCite files", () => {
    const reply = ok("...", "answer", ["general-faq.md", "old-website-faq.html"]);
    expect(checkCase({ mustCite: ["special-orders.md", "general-faq.md"], mustNotCite: ["old-website-faq.html"] }, reply)).toEqual([
      "cites forbidden file old-website-faq.html",
    ]);
    expect(checkCase({ mustCite: ["delivery.md"] }, ok("...", "answer", []))).toEqual(['must cite one of ["delivery.md"], cited []']);
  });

  it("accepts HTTP 400 with an error for a bad-input case only", () => {
    const badRequest: ServerReply = { status: 400, body: { error: "message must not be empty" } };
    expect(checkCase({}, badRequest, true)).toEqual([]);
    expect(checkCase({}, badRequest, false)).toEqual(["HTTP 400: message must not be empty"]);
  });

  it("also accepts a polite 200 reply for a bad-input case", () => {
    expect(checkCase({}, ok("What can I help you with?"), true)).toEqual([]);
  });

  it("fails on server errors", () => {
    expect(checkCase({}, { status: 504, body: { error: "Model timed out" } })).toEqual(["HTTP 504: Model timed out"]);
  });
});
