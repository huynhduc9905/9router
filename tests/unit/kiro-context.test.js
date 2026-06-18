/**
 * Context-handling alignment to kirocc (Claude→Kiro path):
 *  - no [Context: Current time …] marker
 *  - system prompt placed as a history pair (user + synthetic ack), not flattened
 *  - origin KIRO_CLI, agentTaskType vibe
 *  - structured envState from the <env> block
 */
import { describe, it, expect } from "vitest";
import { claudeToKiroRequest } from "../../open-sse/translator/request/claude-to-kiro.js";

const SYNTHETIC_ACK =
  "I will fully incorporate this information when generating my responses, and explicitly acknowledge relevant parts of the summary when answering questions.";

const run = (body, model = "claude-sonnet-4.5") =>
  claudeToKiroRequest(model, body, true, {});
const curContent = (r) => r.conversationState.currentMessage.userInputMessage.content;

describe("claudeToKiroRequest — context handling", () => {
  it("does not inject a [Context: Current time] marker", () => {
    const r = run({ messages: [{ role: "user", content: "hi" }] });
    expect(JSON.stringify(r)).not.toContain("[Context: Current time");
  });

  it("sets agentTaskType vibe and origin KIRO_CLI on the current message", () => {
    const r = run({ messages: [{ role: "user", content: "hi" }] });
    expect(r.conversationState.agentTaskType).toBe("vibe");
    expect(r.conversationState.currentMessage.userInputMessage.origin).toBe("KIRO_CLI");
  });

  it("places the system prompt as a history pair, not flattened into content", () => {
    const r = run({
      system: "You are a helpful assistant.",
      messages: [{ role: "user", content: "hi" }],
    });
    const h = r.conversationState.history;
    expect(h[0].userInputMessage.content).toBe("You are a helpful assistant.");
    expect(h[0].userInputMessage.origin).toBe("KIRO_CLI");
    expect(h[1].assistantResponseMessage.content).toBe(SYNTHETIC_ACK);
    expect(h[1].assistantResponseMessage.messageId).toMatch(/^[0-9a-f-]{36}$/);
    // The system text must NOT be flattened into the current user content.
    expect(curContent(r)).not.toContain("You are a helpful assistant.");
  });

  it("joins an array-form system prompt with newlines", () => {
    const r = run({
      system: [{ type: "text", text: "Part A" }, { type: "text", text: "Part B" }],
      messages: [{ role: "user", content: "hi" }],
    });
    expect(r.conversationState.history[0].userInputMessage.content).toBe("Part A\nPart B");
  });

  it("adds NO history pair and NO envState when there is no system prompt", () => {
    const r = run({ messages: [{ role: "user", content: "hi" }] });
    const first = r.conversationState.history[0];
    expect(first?.assistantResponseMessage?.content).not.toBe(SYNTHETIC_ACK);
    expect(
      r.conversationState.currentMessage.userInputMessage.userInputMessageContext?.envState
    ).toBeUndefined();
  });

  it("parses <env> into structured envState on the current message", () => {
    const r = run({
      system: "intro\n<env>\nWorking directory: /home/duc/p\nPlatform: darwin\n</env>",
      messages: [{ role: "user", content: "hi" }],
    });
    const env = r.conversationState.currentMessage.userInputMessage.userInputMessageContext.envState;
    expect(env).toEqual({ operatingSystem: "macos", currentWorkingDirectory: "/home/duc/p" });
  });

  it("still resolves native effort (regression) on a capable model", () => {
    const r = run(
      { system: "sys", output_config: { effort: "high" }, messages: [{ role: "user", content: "hi" }] },
      "claude-opus-4.8"
    );
    expect(r.additionalModelRequestFields).toEqual({ output_config: { effort: "high" } });
  });
});
