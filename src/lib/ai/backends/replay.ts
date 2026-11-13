import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AiBackend, AiCallResult, AiRequest } from "../types";

export const REPLAY_DIR = "test/fixtures/ai-replay";

/** A stable key for a request: same task, instructions, input and schema = same answer. */
export function replayKey(req: AiRequest): string {
  const h = createHash("sha256");
  h.update(JSON.stringify([req.task, req.name, req.instructions, req.input, req.schema]));
  return `${req.name}-${h.digest("hex").slice(0, 16)}`;
}

/** Plays back saved answers. A request with no saved answer fails with the file it looked for. */
export function replayBackend(dir = REPLAY_DIR): AiBackend {
  return {
    id: "replay",
    async call(req): Promise<AiCallResult> {
      const file = join(dir, `${replayKey(req)}.json`);
      if (!existsSync(file)) return { ok: false, kind: "fatal", message: `No saved answer for this request (${file}). Run it once with AI_RECORD=1.` };
      const saved = JSON.parse(readFileSync(file, "utf8")) as { text: string; model?: string };
      return { ok: true, text: saved.text, model: `replay:${saved.model ?? "?"}` };
    },
  };
}

/** Saves a live answer so `replay` can play it back (AI_RECORD=1). */
export function recordAnswer(req: AiRequest, text: string, model: string, dir = REPLAY_DIR) {
  mkdirSync(dir, { recursive: true });
  const prompt = req.input.map((p) => (p.type === "text" ? p.text : "[image]")).join("\n");
  writeFileSync(join(dir, `${replayKey(req)}.json`), JSON.stringify({ task: req.task, model, prompt: prompt.slice(0, 2000), text }, null, 1));
}
