/**
 * Unit tests for Kiro native graded thinking effort.
 *
 * Covers:
 *  - clampEffortForModel() in open-sse/config/kiroConstants.js
 *  - claudeToKiroRequest() emitting native additionalModelRequestFields
 *    (output_config.effort + thinking.type:adaptive) instead of the old
 *    <thinking_mode>/<max_thinking_length> prompt-hint injection.
 */

import { describe, it, expect } from "vitest";
import { clampEffortForModel } from "../../open-sse/config/kiroConstants.js";
import { claudeToKiroRequest } from "../../open-sse/translator/request/claude-to-kiro.js";

describe("clampEffortForModel", () => {
  it("passes low/medium/high through unchanged on any model", () => {
    expect(clampEffortForModel("low", "claude-sonnet-4.5")).toBe("low");
    expect(clampEffortForModel("medium", "claude-sonnet-4.5")).toBe("medium");
    expect(clampEffortForModel("high", "claude-sonnet-4.5")).toBe("high");
  });

  it("clamps xhigh to max for the 4.5/4.6 / Sonnet family", () => {
    expect(clampEffortForModel("xhigh", "claude-sonnet-4.5")).toBe("max");
    expect(clampEffortForModel("xhigh", "claude-haiku-4.5")).toBe("max");
    expect(clampEffortForModel("xhigh", "claude-sonnet-4.6")).toBe("max");
  });

  it("keeps xhigh for Opus 4.7 / 4.8", () => {
    expect(clampEffortForModel("xhigh", "claude-opus-4.7")).toBe("xhigh");
    expect(clampEffortForModel("xhigh", "claude-opus-4.8")).toBe("xhigh");
  });

  it("keeps max on every model", () => {
    expect(clampEffortForModel("max", "claude-sonnet-4.5")).toBe("max");
    expect(clampEffortForModel("max", "claude-opus-4.8")).toBe("max");
  });
});

describe("claudeToKiroRequest native effort", () => {
  const baseBody = (extra) => ({
    messages: [{ role: "user", content: "Hello" }],
    ...extra,
  });

  it("emits output_config.effort from explicit Claude output_config.effort", () => {
    const body = baseBody({ output_config: { effort: "high" } });
    const result = claudeToKiroRequest("claude-sonnet-4.5", body, true, {});

    expect(result.additionalModelRequestFields).toEqual({
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
    });
  });

  it("maps medium effort to medium", () => {
    const body = baseBody({ output_config: { effort: "medium" } });
    const result = claudeToKiroRequest("claude-sonnet-4.5", body, true, {});
    expect(result.additionalModelRequestFields.output_config.effort).toBe("medium");
  });

  it("defaults to high when a -thinking model implies thinking with no level", () => {
    const body = baseBody({});
    const result = claudeToKiroRequest("claude-sonnet-4.5-thinking", body, true, {});
    expect(result.additionalModelRequestFields.output_config.effort).toBe("high");
  });

  it("maps a client thinking budget to the nearest discrete level", () => {
    // 8192 → "medium" per budgetToLevel thresholds.
    const body = baseBody({ thinking: { type: "enabled", budget_tokens: 8192 } });
    const result = claudeToKiroRequest("claude-sonnet-4.5", body, true, {});
    expect(result.additionalModelRequestFields.output_config.effort).toBe("medium");
  });

  it("clamps xhigh to max on a 4.5 upstream model", () => {
    const body = baseBody({ output_config: { effort: "xhigh" } });
    const result = claudeToKiroRequest("claude-sonnet-4.5", body, true, {});
    expect(result.additionalModelRequestFields.output_config.effort).toBe("max");
  });

  it("omits additionalModelRequestFields when thinking is disabled", () => {
    const body = baseBody({ thinking: { type: "disabled" } });
    const result = claudeToKiroRequest("claude-sonnet-4.5", body, true, {});
    expect(result.additionalModelRequestFields).toBeUndefined();
  });

  it("no longer injects the <thinking_mode> prompt-hint tag", () => {
    const body = baseBody({ output_config: { effort: "high" } });
    const result = claudeToKiroRequest("claude-sonnet-4.5", body, true, {});
    const content = result.conversationState.currentMessage.userInputMessage.content;
    expect(content).not.toContain("<thinking_mode>");
    expect(content).not.toContain("<max_thinking_length>");
  });
});
