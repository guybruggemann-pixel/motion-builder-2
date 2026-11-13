import type { AiTask, AiTier } from "./types";

/**
 * Which tier each task uses. The engine does the heavy lifting, so most calls run small;
 * reading a reference picture or video needs the large tier.
 */
export const TASK_TIER: Record<AiTask, AiTier> = {
  "describe-motion": "small",
  draft: "small",
  reference: "large",
};

/**
 * Models per tier, tried in order: when one is overloaded or over quota the next one answers.
 * These are Google's own aliases (they follow Google's current Flash-Lite / Flash / Pro), so the
 * app doesn't pin version numbers. Override with GEMINI_SMALL / GEMINI_LARGE in .env
 * (comma-separated). Note: Pro has no free-tier quota; on a free key the large tier falls
 * through to Flash.
 */
export const GEMINI_MODELS: Record<AiTier, string[]> = {
  small: ["gemini-flash-lite-latest", "gemini-flash-latest"],
  large: ["gemini-pro-latest", "gemini-flash-latest", "gemini-flash-lite-latest"],
};

/** A small-tier call whose answer fails twice moves up to the large tier. */
export const ESCALATE_AFTER = 2;

/**
 * gemini: Google's Gemini API (GEMINI_API_KEY).
 * bridge: the request waits in .ai-bridge/pending/ until a Claude Code session answers it.
 * replay: plays back saved answers from test/fixtures/ai-replay/ (free, repeatable).
 * Default: gemini when a key is set, otherwise bridge. AI_PROVIDER in .env overrides.
 */
export type ProviderId = "gemini" | "bridge" | "replay";

export function providerId(env: Record<string, string | undefined> = process.env): ProviderId {
  const p = env.AI_PROVIDER?.trim();
  if (p === "gemini" || p === "bridge" || p === "replay") return p;
  return env.GEMINI_API_KEY ? "gemini" : "bridge";
}

export function modelsFor(tier: AiTier, env: Record<string, string | undefined> = process.env): string[] {
  const override = tier === "small" ? env.GEMINI_SMALL : env.GEMINI_LARGE;
  const list = override?.split(",").map((s) => s.trim()).filter(Boolean);
  return list?.length ? list : GEMINI_MODELS[tier];
}
