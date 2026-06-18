/**
 * Unit tests for Kiro model-aware graded thinking effort.
 *
 * Verified backend behavior (2026-06-18):
 *  - Opus 4.7/4.8, Sonnet 4.6 accept native
 *    additionalModelRequestFields.output_config.effort.
 *  - Sonnet/Haiku 4.5 reject it (HTTP 400) → must use the <thinking_mode> /
 *    <max_thinking_length> prompt-hint instead, graded by effort.
 */

import { describe, it, expect } from "vitest";
import {
  clampEffortForModel,
  modelSupportsNativeEffort,
} from "../../open-sse/config/kiroConstants.js";
import { claudeToKiroRequest } from "../../open-sse/translator/request/claude-to-kiro.js";

describe("modelSupportsNativeEffort", () => {
  it("is true for Opus 4.7/4.8 and Sonnet 4.6", () => {
    expect(modelSupportsNativeEffort("claude-opus-4.8")).toBe(true);
    expect(modelSupportsNativeEffort("claude-opus-4.7")).toBe(true);
    expect(modelSupportsNativeEffort("claude-sonnet-4.6")).toBe(true);
  });

  it("is false for the 4.5 family and non-Claude models", () => {
    expect(modelSupportsNativeEffort("claude-sonnet-4.5")).toBe(false);
    expect(modelSupportsNativeEffort("claude-haiku-4.5")).toBe(false);
    expect(modelSupportsNativeEffort("deepseek-3.2")).toBe(false);
    expect(modelSupportsNativeEffort("glm-5")).toBe(false);
  });
});

describe("clampEffortForModel", () => {
  it("passes low/medium/high/max through unchanged", () => {
    expect(clampEffortForModel("low", "claude-opus-4.8")).toBe("low");
    expect(clampEffortForModel("high", "claude-sonnet-4.6")).toBe("high");
    expect(clampEffortForModel("max", "claude-opus-4.8")).toBe("max");
  });

  it("keeps xhigh for Opus 4.7/4.8, clamps to max for Sonnet 4.6", () => {
    expect(clampEffortForModel("xhigh", "claude-opus-4.8")).toBe("xhigh");
    expect(clampEffortForModel("xhigh", "claude-opus-4.7")).toBe("xhigh");
    expect(clampEffortForModel("xhigh", "claude-sonnet-4.6")).toBe("max");
  });
});

describe("claudeToKiroRequest — native-effort models", () => {
  const body = (extra) => ({
    messages: [{ role: "user", content: "Hello" }],
    ...extra,
  });

  it("emits native output_config.effort for Opus 4.8", () => {
    const result = claudeToKiroRequest(
      "claude-opus-4.8",
      body({ output_config: { effort: "high" } }),
      true,
      {}
    );
    expect(result.additionalModelRequestFields).toEqual({
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
    });
  });

  it("clamps xhigh to max for Sonnet 4.6", () => {
    const result = claudeToKiroRequest(
      "claude-sonnet-4.6",
      body({ output_config: { effort: "xhigh" } }),
      true,
      {}
    );
    expect(result.additionalModelRequestFields.output_config.effort).toBe("max");
  });

  it("does NOT inject the prompt-hint tag for native-effort models", () => {
    const result = claudeToKiroRequest(
      "claude-opus-4.8",
      body({ output_config: { effort: "high" } }),
      true,
      {}
    );
    const content = result.conversationState.currentMessage.userInputMessage.content;
    expect(content).not.toContain("<thinking_mode>");
  });
});

describe("claudeToKiroRequest — prompt-hint models (4.5)", () => {
  const body = (extra) => ({
    messages: [{ role: "user", content: "Hello" }],
    ...extra,
  });

  it("does NOT emit additionalModelRequestFields for a 4.5 model", () => {
    const result = claudeToKiroRequest(
      "claude-sonnet-4.5",
      body({ output_config: { effort: "high" } }),
      true,
      {}
    );
    expect(result.additionalModelRequestFields).toBeUndefined();
  });

  it("injects a graded <max_thinking_length> for high effort on a 4.5 model", () => {
    const result = claudeToKiroRequest(
      "claude-sonnet-4.5",
      body({ output_config: { effort: "high" } }),
      true,
      {}
    );
    const content = result.conversationState.currentMessage.userInputMessage.content;
    expect(content).toContain("<thinking_mode>enabled</thinking_mode>");
    // high → 24576 per the LEVEL_TO_BUDGET table.
    expect(content).toContain("<max_thinking_length>24576</max_thinking_length>");
  });

  it("uses a smaller budget for low effort than high", () => {
    const low = claudeToKiroRequest(
      "claude-sonnet-4.5",
      body({ output_config: { effort: "low" } }),
      true,
      {}
    ).conversationState.currentMessage.userInputMessage.content;
    // low → 1024.
    expect(low).toContain("<max_thinking_length>1024</max_thinking_length>");
  });

  it("omits thinking entirely when disabled", () => {
    const result = claudeToKiroRequest(
      "claude-sonnet-4.5",
      body({ thinking: { type: "disabled" } }),
      true,
      {}
    );
    expect(result.additionalModelRequestFields).toBeUndefined();
    const content = result.conversationState.currentMessage.userInputMessage.content;
    expect(content).not.toContain("<thinking_mode>");
  });
});
