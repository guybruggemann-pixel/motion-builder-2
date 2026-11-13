import { ESCALATE_AFTER, TASK_TIER, modelsFor, providerId } from "./config";
import { bridgeBackend } from "./backends/bridge";
import { geminiBackend } from "./backends/gemini";
import { recordAnswer, replayBackend } from "./backends/replay";
import type { AiBackend, AiCallResult, AiRequest, AiResult, AiTier } from "./types";

export type { AiPart, AiRequest, AiResult, AiTask } from "./types";

type Log = (msg: string) => void;

/** Parses the answer and runs the request's own check; null when it's fine. */
function reject(req: AiRequest, text: string): string | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return "answer is not valid JSON";
  }
  return req.check?.(value) ?? null;
}

/**
 * Runs a request through one backend with fallbacks:
 * - a busy model (overloaded, over quota) hands over to the next model in its tier;
 * - an answer that fails its check is retried; after ESCALATE_AFTER failures on the small tier the
 *   request moves up to the large tier (logged).
 */
export async function runRequest(req: AiRequest, backend: AiBackend, models: (tier: AiTier) => string[], log: Log = console.warn): Promise<AiResult & { tier?: AiTier }> {
  const tiers: AiTier[] = TASK_TIER[req.task] === "small" ? ["small", "large"] : ["large"];
  let lastProblem = "";
  for (const tier of tiers) {
    let failures = 0;
    for (const model of models(tier)) {
      while (failures < ESCALATE_AFTER) {
        const r: AiCallResult = await backend.call(req, model);
        if (r.ok) {
          const why = reject(req, r.text);
          if (!why) return { ok: true, json: r.text, model: r.model, tier };
          failures++;
          lastProblem = `${r.model}: ${why}`;
          log(`[ai] ${req.name}: ${lastProblem} (attempt ${failures})`);
          continue;
        }
        lastProblem = r.message;
        if (r.kind === "auth") return { ok: false, error: "The AI key was refused. Check GEMINI_API_KEY in .env." };
        if (r.kind === "fatal") return { ok: false, error: r.message };
        if (r.kind === "busy") {
          log(`[ai] ${req.name}: ${r.message}; trying the next model`);
          break;
        }
        failures++;
        log(`[ai] ${req.name}: ${r.message} (attempt ${failures})`);
      }
      if (failures >= ESCALATE_AFTER) break;
    }
    if (tier === "small" && tiers.length > 1) log(`[ai] ${req.name}: escalating to the large tier (${lastProblem})`);
  }
  if (/\b(429|503)\b|quota|demand/i.test(lastProblem)) return { ok: false, error: "The AI is busy or over its quota right now. Wait a moment and try again." };
  return { ok: false, error: "The AI couldn't give a usable answer. Try again or rephrase." };
}

/** The backend chosen in config.ts / .env. */
export function currentBackend(env: Record<string, string | undefined> = process.env): AiBackend {
  const id = providerId(env);
  if (id === "replay") return replayBackend();
  if (id === "bridge") return bridgeBackend();
  return geminiBackend(env.GEMINI_API_KEY ?? "");
}

/** The one entry point for every AI feature (server side). */
export async function generate(req: AiRequest): Promise<AiResult> {
  const env = process.env;
  const backend = currentBackend(env);
  const r = await runRequest(req, backend, (tier) => modelsFor(tier, env));
  if (r.ok) {
    console.info(`[ai] ${req.name} answered by ${backend.id}/${r.model} (${r.tier})`);
    if (env.AI_RECORD === "1" && backend.id !== "replay") recordAnswer(req, r.json, r.model ?? backend.id);
  }
  return r.ok ? { ok: true, json: r.json, model: r.model } : r;
}
