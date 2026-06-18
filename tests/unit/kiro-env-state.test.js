import { describe, it, expect } from "vitest";
import { parseKiroEnvState, normalizePlatform } from "../../open-sse/translator/request/kiroEnvState.js";

describe("normalizePlatform", () => {
  it("maps darwin → macos and win32/windows → windows", () => {
    expect(normalizePlatform("darwin")).toBe("macos");
    expect(normalizePlatform("win32")).toBe("windows");
    expect(normalizePlatform("windows")).toBe("windows");
  });
  it("passes other platforms through unchanged", () => {
    expect(normalizePlatform("linux")).toBe("linux");
  });
});

describe("parseKiroEnvState", () => {
  it("extracts working directory and platform from an <env> block", () => {
    const sys = "preamble\n<env>\nWorking directory: /home/duc/proj\nPlatform: darwin\n</env>\nmore";
    expect(parseKiroEnvState(sys)).toEqual({
      operatingSystem: "macos",
      currentWorkingDirectory: "/home/duc/proj",
    });
  });
  it("populates only the fields present", () => {
    const sys = "<env>\nWorking directory: /tmp\n</env>";
    expect(parseKiroEnvState(sys)).toEqual({ currentWorkingDirectory: "/tmp" });
  });
  it("returns null when there is no <env> block", () => {
    expect(parseKiroEnvState("just a plain system prompt")).toBeNull();
  });
  it("returns null for empty input", () => {
    expect(parseKiroEnvState("")).toBeNull();
    expect(parseKiroEnvState(undefined)).toBeNull();
  });
  it("ignores Platform: lines outside the <env> block", () => {
    const sys = "Platform: trickery\n<env>\nWorking directory: /a\n</env>";
    expect(parseKiroEnvState(sys)).toEqual({ currentWorkingDirectory: "/a" });
  });
});
