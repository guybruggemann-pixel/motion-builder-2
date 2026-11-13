import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bridgeBackend } from "../src/lib/ai/backends/bridge";
import { geminiBackend, geminiBody } from "../src/lib/ai/backends/gemini";
import { recordAnswer, replayBackend } from "../src/lib/ai/backends/replay";
import { modelsFor, providerId } from "../src/lib/ai/config";
import { runRequest } from "../src/lib/ai/provider";
import type { AiBackend, AiCallResult, AiRequest } from "../src/lib/ai/types";

const req = (over: Partial<AiRequest> = {}): AiRequest => ({
  task: "draft",
  name: "draft",
  instructions: "be brief",
  input: [{ type: "text", text: "fade up" }],
  schema: { type: "object" },
  ...over,
});

/** A backend that answers from a script, recording which model each call went to. */
function scripted(answers: Record<string, AiCallResult[]>) {
  const calls: string[] = [];
  const backend: AiBackend = {
    id: "fake",
    async call(_r, model) {
      calls.push(model);
      return answers[model]?.shift() ?? { ok: false, kind: "busy", message: `${model} 503` };
    },
  };
  return { backend, calls };
}
const models = (t: "small" | "large") => (t === "small" ? ["s1", "s2"] : ["l1"]);
const quiet = () => {};

describe("ai provider", () => {
  it("returns the first good answer", async () => {
    const { backend, calls } = scripted({ s1: [{ ok: true, text: '{"a":1}', model: "s1" }] });
    const r = await runRequest(req(), backend, models, quiet);
    expect(r).toMatchObject({ ok: true, json: '{"a":1}', tier: "small" });
    expect(calls).toEqual(["s1"]);
  });

  it("moves to the next model when one is busy", async () => {
    const { backend, calls } = scripted({ s2: [{ ok: true, text: "{}", model: "s2" }] });
    const r = await runRequest(req(), backend, models, quiet);
    expect(r.ok).toBe(true);
    expect(calls).toEqual(["s1", "s2"]);
  });

  it("escalates to the large tier after two bad answers on the small tier", async () => {
    const bad: AiCallResult = { ok: true, text: "not json", model: "s1" };
    const { backend, calls } = scripted({ s1: [bad, bad], l1: [{ ok: true, text: "{}", model: "l1" }] });
    const logs: string[] = [];
    const r = await runRequest(req(), backend, models, (m) => logs.push(m));
    expect(r).toMatchObject({ ok: true, tier: "large" });
    expect(calls).toEqual(["s1", "s1", "l1"]);
    expect(logs.some((l) => l.includes("escalating"))).toBe(true);
  });

  it("runs the request's own check", async () => {
    const { backend } = scripted({ s1: [{ ok: true, text: '{"x":1}', model: "s1" }, { ok: true, text: '{"tracks":[]}', model: "s1" }] });
    const r = await runRequest(req({ check: (v) => ((v as { tracks?: unknown }).tracks ? null : "no tracks") }), backend, models, quiet);
    expect(r).toMatchObject({ ok: true, json: '{"tracks":[]}' });
  });

  it("stops on a refused key and says so", async () => {
    const { backend, calls } = scripted({ s1: [{ ok: false, kind: "auth", message: "API key not valid" }] });
    const r = await runRequest(req(), backend, models, quiet);
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.error).toContain("GEMINI_API_KEY");
    expect(calls).toEqual(["s1"]);
  });

  it("reports busy when every model is over quota", async () => {
    const { backend } = scripted({});
    const r = await runRequest(req(), backend, models, quiet);
    expect(!r.ok && r.error).toMatch(/busy or over its quota/);
  });

  it("reference reads start on the large tier", async () => {
    const { backend, calls } = scripted({ l1: [{ ok: true, text: "{}", model: "l1" }] });
    await runRequest(req({ task: "reference" }), backend, models, quiet);
    expect(calls).toEqual(["l1"]);
  });
});

describe("ai config", () => {
  it("picks gemini with a key, bridge without, and honours AI_PROVIDER", () => {
    expect(providerId({ GEMINI_API_KEY: "k" })).toBe("gemini");
    expect(providerId({})).toBe("bridge");
    expect(providerId({ GEMINI_API_KEY: "k", AI_PROVIDER: "replay" })).toBe("replay");
  });
  it("lets .env override the models per tier", () => {
    expect(modelsFor("small", { GEMINI_SMALL: "a, b" })).toEqual(["a", "b"]);
    expect(modelsFor("large", {})[0]).toBe("gemini-pro-latest");
  });
});

describe("gemini backend", () => {
  it("sends text and images with the schema, and keeps the key in a header", async () => {
    const body = geminiBody(req({ input: [{ type: "text", text: "hi" }, { type: "image", dataUrl: "data:image/png;base64,AAAA" }] }));
    expect(body.contents[0]!.parts).toEqual([{ text: "hi" }, { inlineData: { mimeType: "image/png", data: "AAAA" } }]);
    expect(body.generationConfig).toEqual({ responseMimeType: "application/json", responseJsonSchema: { type: "object" } });

    let seen: { url: string; init: RequestInit } | null = null;
    const fake = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ modelVersion: "m-1", candidates: [{ content: { parts: [{ text: "{}" }] } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await geminiBackend("secret", fake).call(req(), "gemini-x");
    expect(r).toEqual({ ok: true, text: "{}", model: "m-1" });
    expect(seen!.url).not.toContain("secret");
    expect((seen!.init.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret");
  });

  it("maps quota and overload to busy, a bad key to auth", async () => {
    const status = (s: number) => (async () => new Response(JSON.stringify({ error: { message: "nope" } }), { status: s })) as unknown as typeof fetch;
    expect(await geminiBackend("k", status(429)).call(req(), "m")).toMatchObject({ ok: false, kind: "busy" });
    expect(await geminiBackend("k", status(503)).call(req(), "m")).toMatchObject({ ok: false, kind: "busy" });
    expect(await geminiBackend("k", status(403)).call(req(), "m")).toMatchObject({ ok: false, kind: "auth" });
  });
});

describe("replay and bridge", () => {
  it("plays back a recorded answer for the same request only", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mb-replay-"));
    recordAnswer(req(), '{"ok":1}', "m-1", dir);
    expect(await replayBackend(dir).call(req(), "")).toEqual({ ok: true, text: '{"ok":1}', model: "replay:m-1" });
    expect(await replayBackend(dir).call(req({ instructions: "other" }), "")).toMatchObject({ ok: false, kind: "fatal" });
  });

  it("writes a pending request and returns the answer once it's in done/", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mb-bridge-"));
    const pending = bridgeBackend(dir, { pollMs: 5, timeoutMs: 2000 }).call(req({ input: [{ type: "text", text: "fade up" }, { type: "image", dataUrl: "data:image/jpeg;base64,AAAA" }] }), "");
    await new Promise((r) => setTimeout(r, 30));
    const [id] = readdirSync(join(dir, "pending"));
    const files = readdirSync(join(dir, "pending", id!));
    expect(files.sort()).toEqual(["image-1.jpg", "request.md"]);
    expect(readFileSync(join(dir, "pending", id!, "request.md"), "utf8")).toContain("fade up");
    writeFileSync(join(dir, "done", `${id}.json`), '{"answer":true}');
    expect(await pending).toEqual({ ok: true, text: '{"answer":true}', model: "bridge" });
    expect(readdirSync(join(dir, "pending"))).toEqual([]);
  });
});
