import type { AiBackend, AiCallResult, AiPart, AiRequest } from "../types";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function toParts(input: AiPart[]) {
  return input.map((p) => {
    if (p.type === "text") return { text: p.text };
    const m = /^data:([^;,]+);base64,(.*)$/s.exec(p.dataUrl);
    if (!m) throw new Error("image parts must be base64 data URLs");
    return { inlineData: { mimeType: m[1] ?? "image/png", data: m[2] ?? "" } };
  });
}

/** The request body for Gemini's generateContent, with the answer held to `schema`. */
export function geminiBody(req: AiRequest) {
  return {
    systemInstruction: { parts: [{ text: req.instructions }] },
    contents: [{ role: "user", parts: toParts(req.input) }],
    generationConfig: { responseMimeType: "application/json", responseJsonSchema: req.schema },
  };
}

/** Google's Gemini API. The key never leaves the server: it's read from the environment per call. */
export function geminiBackend(key: string, fetchImpl: typeof fetch = fetch): AiBackend {
  return {
    id: "gemini",
    async call(req, model): Promise<AiCallResult> {
      let res: Response;
      try {
        res = await fetchImpl(`${BASE}/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify(geminiBody(req)),
        });
      } catch (e) {
        return { ok: false, kind: "busy", message: `network: ${(e as Error).message}` };
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = String(body?.error?.message ?? res.statusText).split("\n")[0] ?? "";
        if (res.status === 429 || res.status === 503 || res.status === 500 || res.status === 404) return { ok: false, kind: "busy", message: `${model} ${res.status}: ${message}` };
        if (res.status === 401 || res.status === 403) return { ok: false, kind: "auth", message };
        return { ok: false, kind: "fatal", message: `${model} ${res.status}: ${message}` };
      }
      const cand = body?.candidates?.[0];
      const text = (cand?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
      if (!text) return { ok: false, kind: "bad", message: `${model}: empty answer (${cand?.finishReason ?? body?.promptFeedback?.blockReason ?? "no reason"})` };
      return { ok: true, text, model: body.modelVersion ?? model };
    },
  };
}
