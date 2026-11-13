import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Import's AI: a first animation from a prompt, and a rebuild of a reference picture or video
 * (layers + motion). Both only return the model's JSON text; the editor checks it
 * (`checkDraftSpec`, `checkReferenceLayers`) before anything reaches the doc.
 */

const MOTION_RULES = `You choreograph editable motion for a motion graphics editor (After Effects conventions). Preserve the supplied design's exact words, fonts, colours, layout and asset identities. Only animate properties the designer asks to animate; don't restyle or replace a design. A reference supplies motion, not replacement artwork.
First identify whether the design starts already composed, enters, holds, exits, or moves continuously. Do not invent a fade/entrance for a composition visible at frame zero. Distinguish short snappy transitions from long holds and continuous looping movement.
Per-layer motion fields: ease, duration (s), stagger (s between split parts), offset [x,y] px it starts away from rest (y down), scale (% it starts at, 100 = none), rotation (deg it starts at), opacity (0-100 it starts at), blur (px it starts at), reveal (none|up|down|left|right mask wipe), split (none|characters|words|lines, text only), from (first|last|center|random|edges stagger order). gap = seconds between layers starting, back to front.
enabled=false disables the entrance; start is an explicit delay in seconds after the layer's in point. byLayer entries target exact supplied node ids, overriding role defaults: {node,motion,out,tracks}. out uses the same fields; out.start is seconds BEFORE the layer out point at which the exit FINISHES (usually 0). Omit out when not requested. Backgrounds normally stay visible and still. byLayer is essential for independently timed objects; never treat every title as one identical motion.
tracks: [{param,keys:[{t,v,ease}]}] are absolute ordinary keyframes for continuous drift, pulses, multiple movements and holds. Use only allowed animatable numeric/vector/colour params supplied with that layer. v is the actual property value, not an offset; keep the design's supplied base value as its resting state. For position add desired offsets to the supplied position; for scale return actual percent vectors. Use at least two keys per track. Avoid an entrance on a property already choreographed by tracks. Time t is seconds in the supplied composition, frame-snapped; duplicate endpoint values for seamless loops, use hold for cuts and identical successive values for pauses. Don't key text/font/design geometry. Keep keys inside the supplied span.
Allowed eases: linear, outQuad, outCubic, outQuart, outQuint, outExpo, outCirc, outSine, outBack(1.7), outElastic(1,0.3), outBounce, inOutQuad, inOutCubic, inOutQuart, inOutExpo, inOutSine, inOutBack(1.7), cubicBezier(x1,y1,x2,y2), steps(n), spring(bounce 0-1,durationMs). Spring feels: Gentle spring(0.15,900), Smooth spring(0.3,628), Snappy spring(0.25,350), Bouncy spring(0.6,628), Wobbly spring(0.8,1000).
Characters: smooth = outQuart/inOutCubic/outSine, 0.6-1.2s, stagger 0.04-0.09; punchy = outExpo/outQuint, 0.18-0.45s, stagger 0.015-0.04; playful = springs/outBack/outElastic/outBounce, 0.45-0.9s, stagger 0.03-0.07.
Roles: background, panel, title, subtitle, body, label, accent, logo, icon, image, decoration. "motion" is the default; "byRole" overrides fields for specific roles (omit fields you don't change). name: 1-3 words. desc: one short sentence for the designer.`;

const MOTION_FIELDS = {
  ease: { type: "string" }, duration: { type: "number" }, stagger: { type: "number" },
  offset: { type: "array", items: { type: "number" } }, scale: { type: "number" }, rotation: { type: "number" },
  opacity: { type: "number" }, blur: { type: "number" }, reveal: { type: "string" }, split: { type: "string" }, from: { type: "string" }, start: { type: "number" }, enabled: { type: "boolean" },
} as const;
const SPEC = {
  type: "object",
  required: ["name", "desc", "gap", "motion", "byRole"],
  properties: {
    name: { type: "string" }, desc: { type: "string" }, gap: { type: "number" },
    motion: { type: "object", properties: MOTION_FIELDS },
    byRole: { type: "array", items: { type: "object", required: ["role"], properties: { role: { type: "string" }, ...MOTION_FIELDS } } },
    byLayer: { type: "array", items: { type: "object", required: ["node"], properties: { node: { type: "string" }, motion: { type: "object", properties: MOTION_FIELDS }, out: { type: "object", properties: MOTION_FIELDS }, tracks: { type: "array", items: { type: "object", required: ["param", "keys"], properties: { param: { type: "string" }, keys: { type: "array", items: { type: "object", required: ["t", "v", "ease"], properties: { t: { type: "number" }, v: { anyOf: [{ type: "number" }, { type: "string" }, { type: "array", items: { type: "number" } }] }, ease: { type: "string" } } } } } } } } } },
  },
} as const;

const Layer = z.object({ node: z.string().max(64), name: z.string().max(80), role: z.string().max(30).optional(), type: z.string().max(30), text: z.string().max(2000).optional(), font: z.string().max(200).optional(), span: z.tuple([z.number(), z.number()]), params: z.array(z.object({ name: z.string(), kind: z.string(), value: z.union([z.number(), z.string(), z.boolean(), z.array(z.number())]), min: z.number().optional(), max: z.number().optional() })).max(40) });
const Composition = z.object({ width: z.number(), height: z.number(), fps: z.number(), duration: z.number() });

type Part = { type: "text"; text: string } | { type: "image"; dataUrl: string };

/** Sends one request through the app's AI provider (`provider.ts`); the tier comes from the task. */
async function ask(task: "draft" | "reference", instructions: string, input: Part[], name: string, schema: Record<string, unknown>) {
  const { generate } = await import("./provider");
  return generate({ task, instructions, input, name, schema, check: (v) => (v && typeof v === "object" ? null : "not an object") });
}

/** A first animation for these layers from a description. */
export const draftFromPrompt = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ prompt: z.string().min(1).max(2000), layers: z.array(Layer).max(60), comp: Composition }).parse(d))
  .handler(({ data }) =>
    ask("draft", MOTION_RULES, [{ type: "text", text: `Composition: ${JSON.stringify(data.comp)}\nLayers (back to front): ${JSON.stringify(data.layers)}\n\nDesired animation: ${data.prompt}` }], "draft", SPEC as unknown as Record<string, unknown>),
  );

const REFERENCE = {
  type: "object",
  required: ["summary", "photo", "pattern", "layers", "draft"],
  properties: {
    summary: { type: "string" },
    pattern: {
      type: "object",
      required: ["kind"],
      properties: {
        kind: { type: "string", enum: ["none", "wave-wall", "sequence", "lower-third", "cards", "trail", "sentence", "box-poster", "type-cube"] },
        count: { type: "number" }, drift: { type: "number" }, tiles: { type: "number" }, angle: { type: "number" }, perWord: { type: "number" }, squiggles: { type: "number" },
        colors: { type: "array", items: { type: "string" } }, labels: { type: "array", items: { type: "string" } }, words: { type: "array", items: { type: "string" } }, glow: { type: "array", items: { type: "string" } },
        cells: { type: "array", items: { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" }, fill: { type: "string" }, color: { type: "string" }, word: { type: "string" }, vertical: { type: "boolean" } } } },
        transitionTime: { type: "number" }, turn: { type: "number" }, turnTime: { type: "number" }, hold: { type: "number" }, delay: { type: "number" }, steps: { type: "number" }, alternate: { type: "boolean" }, elevation: { type: "number" }, azimuth: { type: "number" }, depth: { type: "number" },
        scenes: { type: "array", items: { type: "object", required: ["kind", "text", "color", "background", "duration", "transition"], properties: { kind: { type: "string", enum: ["countdown", "repeat", "caption", "lines", "ticker", "info", "stack", "jumble", "versus"] }, text: { type: "string" }, color: { type: "string" }, background: { type: "string" }, duration: { type: "number" }, transition: { type: "string", enum: ["cut", "push-left", "push-up", "slide-left", "slide-up"] } } } },
        first: { type: "string" }, last: { type: "string" }, role: { type: "string" }, look: { type: "string", enum: ["brush", "tag", "splash"] }, colorA: { type: "string" }, colorB: { type: "string" },
        word: { type: "string" }, columns: { type: "number" }, rows: { type: "number" }, tilt: { type: "number" }, lean: { type: "number" },
        waveAmount: { type: "number" }, wavelength: { type: "number" }, speed: { type: "number" }, rock: { type: "number" }, scroll: { type: "number" },
        color: { type: "string" }, background: { type: "string" }, material: { type: "string", enum: ["plastic", "metal", "plaster", "glass"] },
      },
    },
    photo: { type: "boolean" },
    layers: {
      type: "array",
      items: {
        type: "object",
        required: ["kind", "name", "role", "x", "y", "fill"],
        properties: {
          kind: { type: "string", enum: ["rect", "ellipse", "text"] }, name: { type: "string" }, role: { type: "string" },
          x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" }, radius: { type: "number" },
          fill: { type: "string" }, text: { type: "string" }, size: { type: "number" }, weight: { type: "number" },
        },
      },
    },
    draft: SPEC,
  },
} as const;

/** Rebuilds a reference (one picture, or frames of a video) as layers plus the motion it shows. */
export const analyzeReference = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      width: z.number().int().min(16).max(8192),
      height: z.number().int().min(16).max(8192),
      frames: z.array(z.object({ t: z.number().nonnegative(), image: z.string().startsWith("data:image/").max(3_000_000) })).min(1).max(20),
      prompt: z.string().max(2000).optional(),
      duration: z.number().positive().max(600).optional(),
      design: z.object({ comp: Composition, layers: z.array(Layer).max(60) }).optional(),
    }).parse(d),
  )
  .handler(({ data }) => {
    const video = data.frames.length > 1;
    const instructions = `${MOTION_RULES}

You also rebuild reference designs. Look at the reference and list the layers needed to recreate it with flat shapes and text, back to front, in comp pixels for a ${data.width}x${data.height} comp (origin top-left, y down).
Layers: kind rect|ellipse (x, y = top-left, w, h, fill #RRGGBB, radius for rounded rects) or text (x = left edge, y = top of the capitals, size = font size px, weight 100-900, fill, text = the exact words). Give each a short name and a role. Include a full-frame background rect if the background is a flat colour.
Skip photographic detail you can't build from shapes; set photo=true when the reference is mainly a photo or illustration, so the editor keeps it underneath. Keep it to the elements that matter (max 25).
${video ? "The frames are timestamped video samples. Analyze the opening, intermediate motion and ending, not just a settled frame. Identify each cut and scene hold; use durations from the timestamps, retain the source duration. A blank final frame may be an exit, not the design. Continuous animation already present at frame zero must remain present, not fade in. Use byLayer tracks when a supplied design needs sustained motion and exits." : "Also propose fitting motion in draft without altering the design."}
Repeat patterns: first decide if the reference is a wall of repeated type (one word repeated in rows, often 3D extruded, rows waving or rocking). If so set pattern.kind = "wave-wall" and fill it in, because the editor builds that with a cloner, a wave field and a deformer, which looks far closer than flat layers: word (the repeated word, as shown, best guess if unreadable), columns (words per row visible), rows (rows visible), tilt (deg the rows run at, counter-clockwise positive), lean (deg letters lean, clockwise negative), waveAmount (px the rows bend up and down, in comp px), wavelength (px of one wave along a row), speed (wave cycles per second; 0 if still), rock (deg rows tip forward and back, gives dark gaps between rows), scroll (px per second the rows slide; 0 if not), color (letters #RRGGBB), background (#RRGGBB), material (plastic for matte or satin, metal for chrome, plaster for chalky). Then layers can be empty. Kinetic type sequences: if the reference is a run of full-frame type scenes joined by cuts or pushes (countdowns, giant condensed words, words repeated and scrolling, lines building to fill the frame, a word stacked and scrolling up, small captions on black, icon rows of event details), set pattern.kind = "sequence" with scenes in order: kind (countdown = items replacing each other, one per line in text; repeat = big words then repeated side by side and scrolling; caption = one small line; lines = lines snapping on to fill the frame; ticker = one word stacked in a scrolling column; info = icon + text rows, one per line; stack = one word in about five rows, solid and outlined in turn, zooming out of the centre, wobbling, then collapsing; jumble = one word whose letters hop up and down and tip at odd angles; versus = split screen, top half background colour with the first word, bottom half in the text colour with the last word inverted, a small middle word (e.g. VS) sliding in from both sides: text = top, middle, bottom words one per line), text (the words, newline between lines/items), color and background (#RRGGBB), duration (s), transition (how it comes in: cut, push-left, push-up, slide-left, slide-up; first scene cut), and transitionTime (s a push takes).
Type cubes: if words are extruded in 3D and wrapped round the faces of a box (one word per face, meeting at the corners, rows stacked), with rows turning around the vertical axis, set pattern.kind = "type-cube": words (the words round the box, front face first then going round, 2-4), rows (rows stacked), turn (deg per move, e.g. 90; negative = clockwise seen from above), turnTime (s one move takes), hold (s rows rest between moves), delay (s between one row starting and the next), steps (moves in the clip), alternate (true if neighbouring rows turn opposite ways), elevation (deg the camera looks down), azimuth (deg the camera sits to the side, negative = left), depth (letter extrusion px), color, background, material. Then layers can be empty. Grunge or glitch name titles (a name over brush paint, splatter, speed lines, letters glitching in out of order): set pattern.kind = "lower-third" with first, last (the two parts of the name), role, look (brush = brush-font name over strokes, tag = name in white boxes, splash = paint splats and speed lines), colorA, colorB (the two paint colours), background. Use the first title if there are several.
Card and type layouts:
- "cards": many tilted rounded cards scattered and drifting: count, tilt (max deg), drift (fraction of the frame travelled), background, colors (card colours), labels (short words on cards, "" for none).
- "trail": square tiles in a diagonal line flowing corner to corner: tiles (distinct tiles before it repeats), angle (deg below horizontal), speed (loops per 5 s), background, colors.
- "sentence": a sentence word by word with the camera following: words, colorA/colorB (gradient on words), background, glow (colours of soft blurred blobs), perWord (s per word).
- "box-poster": a grid of coloured boxes each filled by one squashed word or a circle: cells (x, y, w, h as 0-1 fractions of the frame, fill, color = word colour, word or empty for a circle, vertical = letters stacked), squiggles (count of white squiggly lines).
Otherwise pattern.kind = "none".
Reference motion grammar: wave posters = tight condensed/slanted rows and continuous traveling deformation, no entrance; grunge = fast fragmented build, long hold, coordinated glitch exit; square promos = deliberate scene cuts, countdown beats and contrasting giant/tiny typography; cards = intact image-backed faces drifting together with frames, not substitute labels; trails = opening expansion, flowing overlap then contraction; SaaS = scene-by-scene reframing/cursor/counter beats rather than one sentence reveal; box posters = fixed cell layout, independent squashing/scrolling and clipping; black/white type = stacked solid/outline rows, collapse, letter jumble, then split comparison hold. Treat these as observations, not mandates when the current reference differs.
${data.design ? "A separate design is supplied. DO NOT REBUILD OR SUBSTITUTE ITS LAYOUT. Set pattern.kind=none, layers=[], photo=false. Read the reference's animation then return draft.byLayer for the supplied design's node ids and actual base params. Preserve its fonts, words, dimensions and assets. If the reference requires deformable 3D or a multi-scene construction unavailable on these layers, state that limitation in summary rather than claiming a faithful transfer." : ""}
summary: describe the actual supported result and explicitly mention unreconstructed photos/artwork, approximate fonts, unsupported deformation or reduced showcases; don't claim exact fidelity.`;
    const content = [
      { type: "text" as const, text: `${video ? "Video frames" : "Reference picture"}. Source duration: ${data.duration ?? "unknown"}s.${data.design ? ` Supplied design: ${JSON.stringify(data.design)}` : ""}${data.prompt ? ` The designer adds: ${data.prompt}` : ""}` },
      ...data.frames.flatMap((f) => [
        ...(video ? [{ type: "text" as const, text: `t = ${f.t.toFixed(2)}s` }] : []),
        { type: "image" as const, dataUrl: f.image },
      ]),
    ];
    return ask("reference", instructions, content, "reference", REFERENCE as unknown as Record<string, unknown>);
  });
