/**
 * Kiro envState parsing — faithful port of kirocc's internal/reqconv/env_state.go.
 *
 * Claude Code embeds an <env> block in its system prompt with "Working directory:"
 * and "Platform:" lines. kiro-cli sends these as a structured
 * userInputMessageContext.envState ({ operatingSystem, currentWorkingDirectory })
 * rather than as free text. We extract only from inside the <env> block to avoid
 * matching stray lines elsewhere in the prompt, and omit envState entirely when
 * neither field is found (no host-derived fallback).
 */

// Isolate the <env>...</env> block ([\s\S] = dotall since JS has no /s flag here).
const ENV_BLOCK_RE = /<env>([\s\S]*?)<\/env>/;
const WORKING_DIR_RE = /^Working directory:\s*(.+?)\s*$/m;
const PLATFORM_RE = /^Platform:\s*(.+?)\s*$/m;

/**
 * Map a Go runtime.GOOS-style platform string to kiro-cli's operatingSystem
 * vocabulary (darwin→macos, win32/windows→windows; others pass through).
 * @param {string} platform
 * @returns {string}
 */
export function normalizePlatform(platform) {
  switch (platform) {
    case "darwin":
      return "macos";
    case "win32":
    case "windows":
      return "windows";
    default:
      return platform;
  }
}

/**
 * Extract the Kiro envState from a Claude Code system prompt string.
 * Returns { operatingSystem?, currentWorkingDirectory? } or null when no <env>
 * block is present or it yields neither field.
 * @param {string} systemPrompt
 * @returns {{operatingSystem?: string, currentWorkingDirectory?: string} | null}
 */
export function parseKiroEnvState(systemPrompt) {
  if (!systemPrompt || typeof systemPrompt !== "string") return null;
  const block = ENV_BLOCK_RE.exec(systemPrompt);
  if (!block) return null;
  const inner = block[1];

  const env = {};
  const wd = WORKING_DIR_RE.exec(inner);
  if (wd) env.currentWorkingDirectory = wd[1].trim();
  const pf = PLATFORM_RE.exec(inner);
  if (pf) env.operatingSystem = normalizePlatform(pf[1].trim());

  if (!env.operatingSystem && !env.currentWorkingDirectory) return null;
  return env;
}
