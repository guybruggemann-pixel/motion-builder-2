/**
 * The app's one way to ask a language model for something (server side only).
 * Every AI feature calls `generate` from `provider.ts`; which service answers, and on which
 * model, is decided in `config.ts`, never in a feature.
 */

/** What the app asks for. Each task has its own tier in `config.ts`. */
export type AiTask = "describe-motion" | "draft" | "reference";

/** small = fast and cheap (steering, drafts); large = reading pictures and video. */
export type AiTier = "small" | "large";

export type AiPart = { type: "text"; text: string } | { type: "image"; dataUrl: string };

export interface AiRequest {
  task: AiTask;
  /** System instructions. */
  instructions: string;
  /** The user turn: text and images, in order. */
  input: AiPart[];
  /** JSON schema the answer must follow. */
  schema: Record<string, unknown>;
  /** Short name for the answer (logs, replay files). */
  name: string;
  /** Extra check on the parsed answer; return a reason to reject it, or null. */
  check?: (value: unknown) => string | null;
}

/** Same shape the UI already handled with Lovable's gateway: the raw JSON text, or a message for the designer. */
export type AiResult = { ok: true; json: string; model?: string } | { ok: false; error: string };

/** One service that can answer. `model` is a model id for that service (ignored by bridge/replay). */
export interface AiBackend {
  id: string;
  call(req: AiRequest, model: string): Promise<AiCallResult>;
}

/**
 * busy: overloaded or over quota, try the next model; auth: the key is wrong (stop);
 * bad: this answer failed (retry or escalate); fatal: stop and show the message.
 */
export type AiCallResult = { ok: true; text: string; model: string } | { ok: false; kind: "busy" | "auth" | "bad" | "fatal"; message: string };
