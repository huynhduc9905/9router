/**
 * Unit tests for kirocc-aligned Kiro thinking effort (Claude→Kiro path).
 *
 * Target behavior (matches d-kuro/kirocc):
 *  - additionalModelRequestFields contains ONLY output_config.effort — no
 *    `thinking` object, and no <thinking_mode>/<max_thinking_length> XML.
 *  - Effort is resolved via per-model enums: opus-4.8/4.7 accept xhigh; the
 *    4-value models (sonnet-4.6, opus-4.6, -1m variants) clamp xhigh→max; every
 *    other model (4.5 family, deepseek, glm, qwen) gets NO field at all.
 *  - thinking on without an explicit level → "medium"; unrecognized → dropped.
 */

import { describe, it, expect } from "vitest";
import { resolveKiroEffort } from "../../open-sse/config/kiroConstants.js";
import { claudeToKiroRequest } from "../../open-sse/translator/request/claude-to-kiro.js";

describe("resolveKiroEffort", () => {
  it("passes a supported level through unchanged", () => {
    expect(resolveKiroEffort("claude-opus-4.8", "high")).toBe("high");
    expect(resolveKiroEffort("claude-sonnet-4.6", "medium")).toBe("medium");
  });

  it("keeps xhigh for opus 4.7/4.8", () => {
    expect(resolveKiroEffort("claude-opus-4.8", "xhigh")).toBe("xhigh");
    expect(resolveKiroEffort("claude-opus-4.7", "xhigh")).toBe("xhigh");
  });

  it("clamps xhigh to max for 4-value models", () => {
    expect(resolveKiroEffort("claude-sonnet-4.6", "xhigh")).toBe("max");
    expect(resolveKiroEffort("claude-opus-4.6", "xhigh")).toBe("max");
    expect(resolveKiroEffort("claude-sonnet-4.6-1m", "xhigh")).toBe("max");
  });

  it("returns '' for models without effort support", () => {
    expect(resolveKiroEffort("claude-sonnet-4.5", "high")).toBe("");
    expect(resolveKiroEffort("claude-haiku-4.5", "high")).toBe("");
    expect(resolveKiroEffort("deepseek-3.2", "high")).toBe("");
    expect(resolveKiroEffort("glm-5", "max")).toBe("");
  });

  it("returns '' for empty or unrecognized effort", () => {
    expect(resolveKiroEffort("claude-opus-4.8", "")).toBe("");
    expect(resolveKiroEffort("claude-opus-4.8", "enabled")).toBe("");
    expect(resolveKiroEffort("claude-opus-4.8", "ultra")).toBe("");
  });
});

describe("claudeToKiroRequest — kirocc-aligned native effort", () => {
  const body = (extra) => ({
    messages: [{ role: "user", content: "Hello" }],
    ...extra,
  });
  const content = (r) => r.conversationState.currentMessage.userInputMessage.content;

  it("emits output_config.effort ONLY (no thinking object) for opus-4.8", () => {
    const r = claudeToKiroRequest(
      "claude-opus-4.8",
      body({ output_config: { effort: "high" } }),
      true,
      {}
    );
    expect(r.additionalModelRequestFields).toEqual({ output_config: { effort: "high" } });
    expect(content(r)).not.toContain("<thinking_mode>");
  });

  it("clamps xhigh to max for sonnet-4.6", () => {
    const r = claudeToKiroRequest(
      "claude-sonnet-4.6",
      body({ output_config: { effort: "xhigh" } }),
      true,
      {}
    );
    expect(r.additionalModelRequestFields).toEqual({ output_config: { effort: "max" } });
  });

  it("defaults to medium when thinking is on with no explicit effort", () => {
    const r = claudeToKiroRequest(
      "claude-opus-4.8",
      body({ thinking: { type: "enabled" } }),
      true,
      {}
    );
    expect(r.additionalModelRequestFields).toEqual({ output_config: { effort: "medium" } });
  });

  it("maps a budget_tokens request to medium (kirocc does not convert the number)", () => {
    const r = claudeToKiroRequest(
      "claude-opus-4.8",
      body({ thinking: { type: "enabled", budget_tokens: 24000 } }),
      true,
      {}
    );
    expect(r.additionalModelRequestFields).toEqual({ output_config: { effort: "medium" } });
  });

  it("emits NO field and NO XML for a 4.5 model", () => {
    const r = claudeToKiroRequest(
      "claude-sonnet-4.5",
      body({ output_config: { effort: "high" } }),
      true,
      {}
    );
    expect(r.additionalModelRequestFields).toBeUndefined();
    expect(content(r)).not.toContain("<thinking_mode>");
    expect(content(r)).not.toContain("<max_thinking_length>");
  });

  it("emits NO field and NO XML for a -thinking 4.5 variant", () => {
    const r = claudeToKiroRequest(
      "claude-sonnet-4.5-thinking",
      body({}),
      true,
      {}
    );
    expect(r.additionalModelRequestFields).toBeUndefined();
    expect(content(r)).not.toContain("<thinking_mode>");
  });

  it("omits the field entirely when thinking is disabled", () => {
    const r = claudeToKiroRequest(
      "claude-opus-4.8",
      body({ thinking: { type: "disabled" } }),
      true,
      {}
    );
    expect(r.additionalModelRequestFields).toBeUndefined();
    expect(content(r)).not.toContain("<thinking_mode>");
  });

  it("drops an unrecognized explicit effort on a capable model", () => {
    const r = claudeToKiroRequest(
      "claude-opus-4.8",
      body({ output_config: { effort: "ultra" } }),
      true,
      {}
    );
    expect(r.additionalModelRequestFields).toBeUndefined();
  });
});
