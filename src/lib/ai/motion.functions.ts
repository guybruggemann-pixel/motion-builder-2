import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  prompt: z.string().min(1).max(2000),
  context: z.object({
    layer: z.object({ name: z.string(), type: z.string() }),
    fps: z.number(),
    span: z.tuple([z.number(), z.number()]),
    params: z.array(z.object({ name: z.string(), kind: z.string(), value: z.unknown(), min: z.number().optional(), max: z.number().optional() })).max(80),
  }),
});

const SYSTEM = `You are a senior motion designer writing keyframes for one layer in a motion graphics editor (After Effects conventions).
Units: position in px (comp space, y down), scale in percent [x, y], rotation in degrees, opacity 0-100, colours as #RRGGBB.
Times are seconds in the comp and must lie within the layer span. Use only the params listed. Every track needs at least 2 keys.
A key's ease shapes the segment that STARTS at that key (outgoing ease). Allowed eases: linear, outQuad, outCubic, outQuart, outQuint, outExpo, outCirc, outSine, outBack(1.7), outElastic(1,0.3), outBounce, inOutQuad, inOutCubic, inOutQuart, inOutExpo, inOutSine, inOutBack(1.7), inQuad, inCubic, inQuart, inExpo, inSine, inCirc, inBack(1.7), spring(bounce 0-1, durationMs e.g. spring(0.4,628)), cubicBezier(x1,y1,x2,y2), steps(n), hold.
Prefer few, purposeful keys with professional timing (anticipation, overshoot and settle where asked). Animate relative to the current values. The summary is one short sentence for the designer.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "tracks"],
  properties: {
    summary: { type: "string" },
    tracks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["param", "keys"],
        properties: {
          param: { type: "string" },
          keys: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["t", "v", "ease"],
              properties: {
                t: { type: "number" },
                v: { anyOf: [{ type: "number" }, { type: "array", items: { type: "number" } }, { type: "string" }] },
                ease: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
} as const;

/** Asks the model for keys on one layer. Returns the raw proposal; the editor checks it before use. */
export const describeMotion = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const { generate } = await import("./provider");
    return generate({
      task: "describe-motion",
      name: "motion",
      instructions: SYSTEM,
      input: [{ type: "text", text: `Layer: ${JSON.stringify(data.context)}\n\nDesired animation: ${data.prompt}` }],
      schema: SCHEMA as unknown as Record<string, unknown>,
      check: (v) => (Array.isArray((v as { tracks?: unknown }).tracks) ? null : "no tracks"),
    });
  });
