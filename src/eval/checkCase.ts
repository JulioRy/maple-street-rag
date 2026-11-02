export interface CaseExpectation {
  outcome?: string;
  mustInclude?: string[][];
  mustNotInclude?: string[];
  mustCite?: string[];
  mustNotCite?: string[];
  note?: string;
}

/** What the server returned for the last turn of a case. */
export interface ServerReply {
  status: number;
  body: {
    answer?: string;
    outcome?: string;
    sources?: { file: string; chunkId: string }[];
    error?: string;
  };
}

/**
 * Pure checker: returns the list of failed checks, empty when the case passes.
 * `isBadInput` marks a case whose last message is empty: HTTP 400 with an error is a pass there.
 */
export function checkCase(expect: CaseExpectation, reply: ServerReply, isBadInput = false): string[] {
  if (isBadInput && reply.status === 400) {
    return typeof reply.body.error === "string" && reply.body.error.trim() ? [] : ["HTTP 400 without an error message"];
  }
  if (reply.status !== 200) return [`HTTP ${reply.status}: ${reply.body.error ?? "no error message"}`];

  const failures: string[] = [];
  const answer = (reply.body.answer ?? "").toLowerCase();
  const citedFiles = new Set((reply.body.sources ?? []).map((source) => source.file));

  if (expect.outcome && reply.body.outcome !== expect.outcome) {
    failures.push(`outcome expected ${expect.outcome} got ${reply.body.outcome}`);
  }
  for (const group of expect.mustInclude ?? []) {
    if (!group.some((option) => answer.includes(option.toLowerCase()))) failures.push(`missing group ${JSON.stringify(group)}`);
  }
  for (const forbidden of expect.mustNotInclude ?? []) {
    if (answer.includes(forbidden.toLowerCase())) failures.push(`contains forbidden ${JSON.stringify(forbidden)}`);
  }
  if (expect.mustCite?.length && !expect.mustCite.some((file) => citedFiles.has(file))) {
    failures.push(`must cite one of ${JSON.stringify(expect.mustCite)}, cited ${JSON.stringify([...citedFiles])}`);
  }
  for (const file of expect.mustNotCite ?? []) {
    if (citedFiles.has(file)) failures.push(`cites forbidden file ${file}`);
  }
  return failures;
}
