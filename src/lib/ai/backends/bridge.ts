import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AiBackend, AiCallResult } from "../types";

export const BRIDGE_DIR = ".ai-bridge";

/**
 * For testing without any key: the request is written to .ai-bridge/pending/<id>/ and the app
 * waits. In a Claude Code session, "answer the pending AI request" reads request.md (and any
 * images next to it) and writes the JSON answer to .ai-bridge/done/<id>.json.
 */
export function bridgeBackend(dir = BRIDGE_DIR, opts: { timeoutMs?: number; pollMs?: number; now?: () => number } = {}): AiBackend {
  const timeoutMs = opts.timeoutMs ?? 10 * 60_000;
  const pollMs = opts.pollMs ?? 1000;
  const now = opts.now ?? Date.now;
  return {
    id: "bridge",
    async call(req): Promise<AiCallResult> {
      const id = `${new Date(now()).toISOString().replace(/[:.]/g, "-")}-${req.name}`;
      const pending = join(dir, "pending", id);
      const done = join(dir, "done", `${id}.json`);
      mkdirSync(pending, { recursive: true });
      mkdirSync(join(dir, "done"), { recursive: true });
      const lines: string[] = [];
      let img = 0;
      for (const p of req.input) {
        if (p.type === "text") lines.push(p.text);
        else {
          const m = /^data:image\/(\w+);base64,(.*)$/s.exec(p.dataUrl);
          const file = `image-${++img}.${m?.[1] === "jpeg" ? "jpg" : (m?.[1] ?? "png")}`;
          if (m) writeFileSync(join(pending, file), Buffer.from(m[2] ?? "", "base64"));
          lines.push(`[${file}]`);
        }
      }
      writeFileSync(
        join(pending, "request.md"),
        [
          `# AI request: ${req.task} (${req.name})`,
          `Write the answer as JSON matching the schema to: ${done}`,
          "## Instructions",
          req.instructions,
          "## Input",
          lines.join("\n\n"),
          "## Answer schema",
          "```json",
          JSON.stringify(req.schema, null, 1),
          "```",
        ].join("\n\n"),
      );
      const start = now();
      while (now() - start < timeoutMs) {
        if (existsSync(done)) {
          const text = readFileSync(done, "utf8");
          rmSync(pending, { recursive: true, force: true });
          return { ok: true, text, model: "bridge" };
        }
        await new Promise((r) => setTimeout(r, pollMs));
      }
      return { ok: false, kind: "fatal", message: `No answer in ${Math.round(timeoutMs / 1000)} s. The request is still in ${pending}.` };
    },
  };
}
