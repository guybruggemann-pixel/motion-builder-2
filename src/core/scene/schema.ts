/**
 * Scene doc v2: the single source of truth.
 *
 * Model (Houdini-style, mirrors AE comp-in-comp):
 * - A doc holds networks. A network with `comp` settings is a comp (it has a timeline).
 * - Networks hold nodes and wires. A node with `subnet` opens into another network (= precomp).
 * - Every node parameter is a stack: base value -> keyframes -> modifiers.
 * - Subnets can promote parameters to simple controls (motion assets for designers).
 *
 * Everything is plain JSON: the UI, the AI and the exporters read and write the same shape.
 * Time is in seconds everywhere in the doc (anime-ae works in ms internally; convert at the edge).
 */
import { z } from "zod";

export const Id = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/, "ids are lowercase slugs");
export type Id = z.infer<typeof Id>;

/* ---------- values ---------- */

export const Vec2 = z.tuple([z.number(), z.number()]);
export const Vec3 = z.tuple([z.number(), z.number(), z.number()]);
/** Colours are hex strings (#RRGGBB or #RRGGBBAA) or a brand token reference like "brand:blue". */
export const Color = z.string().regex(/^(#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?|brand:[a-z0-9-]+)$/);
export const Value = z.union([z.number(), Vec2, Vec3, z.string(), z.boolean()], {
  // zod 4 reports a failed union as a bare "Invalid input"; say what is allowed (the AI reads this).
  error: "expected a number, [x, y], [x, y, z], a string or a boolean",
});
export type Value = z.infer<typeof Value>;

/* ---------- parameter stack ---------- */

/**
 * Ease of the segment that STARTS at this key. Any anime-ae ease string:
 * "outExpo", "outBack(1.6)", "cubicBezier(.2,0,0,1)", "spring(.4,628)", "hold".
 */
export const EaseString = z.string().min(1);

export const Key = z.object({
  t: z.number().min(0),
  v: Value,
  ease: EaseString.default("linear"),
});
export type Key = z.infer<typeof Key>;

export const ModifierType = z.enum([
  "wave", //     periodic offset: amplitude, frequency (Hz), phase (deg), shape sine|triangle|square|saw
  "noise", //    seeded smooth noise: amplitude, frequency, seed
  "stagger", //  per-part time offset (anime-ae stagger): each (s), from, grid, ease, seed
  "link", //     follow another node's parameter: node, param, scale, offset
  "audio", //    drive from a beat/marker track: track, amount
]);

export const Modifier = z.object({
  id: Id,
  type: ModifierType,
  enabled: z.boolean().default(true),
  blend: z.enum(["add", "multiply", "replace"]).default("add"),
  params: z.record(z.string(), Value),
});
export type Modifier = z.infer<typeof Modifier>;

export const Param = z.object({
  value: Value,
  keys: z.array(Key).optional(),
  modifiers: z.array(Modifier).optional(),
});
export type Param = z.infer<typeof Param>;

/* ---------- nodes and networks ---------- */

/** Semantic role of a node. Roles let one choreography fit many designs. */
export const Role = z.enum([
  "background", "panel", "title", "subtitle", "body", "caption-word", "caption-line",
  "label", "accent", "logo", "icon", "image", "decoration", "none",
]);
export type Role = z.infer<typeof Role>;

export const Node = z.object({
  id: Id,
  /** Catalog type, see catalog.ts. */
  type: z.string(),
  name: z.string(),
  role: Role.optional(),
  params: z.record(z.string(), Param),
  /** Layer in/out on the parent comp's timeline, seconds. Omitted = whole comp. */
  timing: z.object({ in: z.number().min(0), out: z.number().min(0) }).optional(),
  enabled: z.boolean().default(true),
  /** Network this node opens into (Houdini subnet / AE precomp). */
  subnet: Id.optional(),
  ui: z.object({ x: z.number(), y: z.number() }),
});
export type Node = z.infer<typeof Node>;

export const Wire = z.object({
  from: z.object({ node: Id, port: z.string().default("out") }),
  to: z.object({ node: Id, port: z.string().default("in") }),
});
export type Wire = z.infer<typeof Wire>;

/** A parameter of a node inside this network, exposed as a simple control on the subnet node. */
export const Promoted = z.object({
  id: Id,
  label: z.string(),
  target: z.object({ node: Id, param: z.string() }),
  control: z.enum(["text", "number", "slider", "color", "choice", "toggle", "font"]),
  min: z.number().optional(),
  max: z.number().optional(),
  options: z.array(z.string()).optional(),
});
export type Promoted = z.infer<typeof Promoted>;

export const CompSettings = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().positive(),
  duration: z.number().positive(),
  background: Color.optional(),
  /** Motion blur: shutter angle in degrees and sub-frame samples. Omitted = off. */
  motionBlur: z.object({ shutter: z.number().min(0).max(720), samples: z.number().int().min(2).max(64) }).optional(),
});

export const Network = z.object({
  id: Id,
  name: z.string(),
  /** Present = this network is a comp with a timeline. */
  comp: CompSettings.optional(),
  nodes: z.array(Node),
  wires: z.array(Wire),
  /** Id of the node whose output is this network's result. */
  output: Id,
  promoted: z.array(Promoted).optional(),
  /** AE-style versioning: this comp was saved as a new version of another (name keeps the _v02 suffix). */
  versionOf: Id.optional(),
});
export type Network = z.infer<typeof Network>;

/* ---------- brand kit and assets ---------- */

export const BrandKit = z.object({
  name: z.string(),
  colors: z.array(z.object({ token: z.string().regex(/^[a-z0-9-]+$/), value: z.string().regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/) })),
  fonts: z.array(z.object({ family: z.string(), weights: z.array(z.number().int()), role: z.string().optional() })),
  /** Motion assets (network ids) approved for this brand; the AI drafts with these first. */
  assets: z.array(Id).default([]),
});

export const Asset = z.object({
  id: Id,
  kind: z.enum(["image", "svg", "font", "audio", "video", "srt", "csv"]),
  /** Relative path inside the project folder, or a data: URI for small items. */
  src: z.string(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

/* ---------- doc ---------- */

export const SceneDoc = z
  .object({
    version: z.literal(2),
    name: z.string(),
    /** The network opened at the top level. Must be a comp. */
    root: Id,
    networks: z.array(Network),
    brand: BrandKit.optional(),
    assets: z.array(Asset).default([]),
    /** Where the design came from, for the overlay diff. */
    source: z
      .object({ kind: z.enum(["figma", "svg", "pdf", "image", "prompt", "blank"]), ref: z.string().optional() })
      .optional(),
  })
  .superRefine((doc, ctx) => {
    const nets = new Map(doc.networks.map((n) => [n.id, n]));
    if (nets.size !== doc.networks.length) ctx.addIssue({ code: "custom", message: "duplicate network id" });
    const root = nets.get(doc.root);
    if (!root) ctx.addIssue({ code: "custom", path: ["root"], message: `root network "${doc.root}" not found` });
    else if (!root.comp) ctx.addIssue({ code: "custom", path: ["root"], message: "root network must be a comp" });

    for (const net of doc.networks) {
      const ids = new Set<string>();
      for (const node of net.nodes) {
        if (ids.has(node.id)) ctx.addIssue({ code: "custom", message: `duplicate node id "${node.id}" in ${net.id}` });
        ids.add(node.id);
        if (node.subnet && !nets.has(node.subnet))
          ctx.addIssue({ code: "custom", message: `node ${net.id}/${node.id} points at missing subnet "${node.subnet}"` });
      }
      if (!ids.has(net.output)) ctx.addIssue({ code: "custom", message: `network ${net.id} output "${net.output}" not found` });
      for (const w of net.wires)
        for (const end of [w.from.node, w.to.node])
          if (!ids.has(end)) ctx.addIssue({ code: "custom", message: `wire in ${net.id} references missing node "${end}"` });
      for (const p of net.promoted ?? [])
        if (!ids.has(p.target.node))
          ctx.addIssue({ code: "custom", message: `promoted control ${p.id} targets missing node "${p.target.node}"` });
    }

    // Subnets may nest but never contain themselves.
    const visit = (id: string, stack: string[]): void => {
      if (stack.includes(id)) {
        ctx.addIssue({ code: "custom", message: `subnet cycle: ${[...stack, id].join(" > ")}` });
        return;
      }
      for (const node of nets.get(id)?.nodes ?? []) if (node.subnet) visit(node.subnet, [...stack, id]);
    };
    if (root) visit(root.id, []);
  });
export type SceneDoc = z.infer<typeof SceneDoc>;
