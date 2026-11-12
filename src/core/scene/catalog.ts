/**
 * Node catalog: every node type, its category and its parameters with defaults.
 * The AI gets this catalog as its vocabulary; `checkParams` rejects anything outside it.
 * Add a node type here first, then its evaluator, then its UI.
 */
import type { Node, Value } from "./schema";

export type Category =
  | "layer" //      draws something; shows on the timeline (text, shape, image, group, subnet)
  | "split" //      turns one part into many (characters, words, lines, clones)
  | "animate" //    changes parts over time (phase, state)
  | "field" //      spatial influence (linear, spherical) — phase 6
  | "utility"; //   output, null, merge

export type ParamKind = "number" | "vec2" | "vec3" | "color" | "text" | "choice" | "toggle" | "ease" | "font";

export interface ParamSpec {
  kind: ParamKind;
  default: Value;
  min?: number;
  max?: number;
  options?: readonly string[];
  /** Can be keyed in the timeline. Text, fonts and choices hold; numbers interpolate. */
  animatable?: boolean;
}

export interface NodeSpec {
  category: Category;
  label: string;
  inputs: number; // max incoming wires; Infinity for merges
  params: Record<string, ParamSpec>;
}

const transform: Record<string, ParamSpec> = {
  position: { kind: "vec2", default: [0, 0], animatable: true },
  anchor: { kind: "vec2", default: [0, 0], animatable: true },
  scale: { kind: "vec2", default: [100, 100], animatable: true },
  rotation: { kind: "number", default: 0, animatable: true },
  opacity: { kind: "number", default: 100, min: 0, max: 100, animatable: true },
  blur: { kind: "number", default: 0, min: 0, animatable: true },
};

export const CATALOG = {
  Text: {
    category: "layer",
    label: "Text",
    inputs: 0,
    params: {
      text: { kind: "text", default: "Text", animatable: true },
      font: { kind: "font", default: "Inter" },
      weight: { kind: "number", default: 600, min: 100, max: 900 },
      size: { kind: "number", default: 64, min: 1, animatable: true },
      tracking: { kind: "number", default: 0, animatable: true },
      leading: { kind: "number", default: 1.2, min: 0.5, max: 3 },
      align: { kind: "choice", default: "left", options: ["left", "center", "right"] },
      /** Widest a line may be, in px (0 = no limit). What happens beyond it is `overflow`. */
      maxWidth: { kind: "number", default: 0, min: 0 },
      /** Past maxWidth: leave it, shrink the type to fit, or wrap onto more lines. */
      overflow: { kind: "choice", default: "none", options: ["none", "shrink", "wrap"] },
      fill: { kind: "color", default: "#FFFFFF", animatable: true },
      ...transform,
    },
  },
  Shape: {
    category: "layer",
    label: "Shape",
    inputs: 0,
    params: {
      shape: { kind: "choice", default: "rect", options: ["rect", "ellipse", "line", "path"] },
      size: { kind: "vec2", default: [400, 120], animatable: true },
      radius: { kind: "number", default: 0, min: 0, animatable: true },
      fill: { kind: "color", default: "#000000", animatable: true },
      stroke: { kind: "color", default: "#00000000", animatable: true },
      strokeWidth: { kind: "number", default: 0, min: 0, animatable: true },
      path: { kind: "text", default: "" },
      /** Trim paths, 0-100: draw-on for lines and outlines. */
      trimEnd: { kind: "number", default: 100, min: 0, max: 100, animatable: true },
      ...transform,
    },
  },
  Image: {
    category: "layer",
    label: "Image",
    inputs: 0,
    params: { asset: { kind: "text", default: "" }, ...transform },
  },
  Group: {
    category: "layer",
    label: "Group",
    inputs: Infinity,
    params: { ...transform },
  },
  Subnet: {
    category: "layer",
    label: "Subnet",
    inputs: Infinity,
    params: { ...transform },
  },
  Split: {
    category: "split",
    label: "Split text",
    inputs: 1,
    params: { by: { kind: "choice", default: "words", options: ["characters", "words", "lines"] } },
  },
  /**
   * In/out animation (Motion Builder's phase rig): each part moves from an offset state to rest
   * (in) and from rest to an offset state (out), staggered across parts.
   */
  Phase: {
    category: "animate",
    label: "Animate in / out",
    inputs: 1,
    params: {
      mode: { kind: "choice", default: "in", options: ["in", "out"] },
      /** Seconds. In: delay after the layer's in point. Out: how long before the layer's out point it finishes. */
      start: { kind: "number", default: 0, min: 0, animatable: false },
      duration: { kind: "number", default: 0.6, min: 0 },
      ease: { kind: "ease", default: "outExpo" },
      stagger: { kind: "number", default: 0.04, min: 0 },
      from: { kind: "choice", default: "first", options: ["first", "last", "center", "random", "edges"] },
      offsetPosition: { kind: "vec2", default: [0, 40] },
      offsetScale: { kind: "number", default: 100 },
      offsetRotation: { kind: "number", default: 0 },
      offsetOpacity: { kind: "number", default: 0, min: 0, max: 100 },
      offsetBlur: { kind: "number", default: 0, min: 0 },
      /** Mask reveal instead of / on top of the offset: none or a wipe direction. */
      reveal: { kind: "choice", default: "none", options: ["none", "up", "down", "left", "right"] },
    },
  },
  /** Morph between named states of the upstream parts (Motion Builder States). */
  State: {
    category: "animate",
    label: "State morph",
    inputs: 1,
    params: {
      from: { kind: "text", default: "a" },
      to: { kind: "text", default: "b" },
      start: { kind: "number", default: 0, min: 0 },
      duration: { kind: "number", default: 0.8, min: 0 },
      ease: { kind: "ease", default: "inOutCubic" },
    },
  },
  Merge: {
    category: "utility",
    label: "Merge",
    inputs: Infinity,
    params: {},
  },
  Output: {
    category: "utility",
    label: "Output",
    inputs: 1,
    params: {},
  },
} as const satisfies Record<string, NodeSpec>;

export type NodeType = keyof typeof CATALOG;
export const isNodeType = (t: string): t is NodeType => Object.prototype.hasOwnProperty.call(CATALOG, t);

/** Default params for a fresh node, as parameter stacks without keys. */
export function defaultParams(type: NodeType): Node["params"] {
  const spec: NodeSpec = CATALOG[type];
  return Object.fromEntries(Object.entries(spec.params).map(([k, p]) => [k, { value: p.default }]));
}

const kindOf = (v: Value): ParamKind[] => {
  if (typeof v === "number") return ["number"];
  if (typeof v === "boolean") return ["toggle"];
  if (typeof v === "string") return ["text", "color", "choice", "ease", "font"];
  return v.length === 2 ? ["vec2"] : ["vec3"];
};

/**
 * Errors for params a node type doesn't have, values of the wrong kind, or keys on non-animatable params.
 * `extra` adds params beyond the catalog: a Subnet node's promoted controls (values set on the instance).
 */
export function checkParams(node: Node, extra: Record<string, ParamSpec> = {}): string[] {
  const where = `${node.id} (${node.type})`;
  if (!isNodeType(node.type)) return [`${where}: unknown node type`];
  const spec: NodeSpec = CATALOG[node.type];
  const errors: string[] = [];
  for (const [name, param] of Object.entries(node.params)) {
    const ps = spec.params[name] ?? extra[name];
    if (!ps) {
      errors.push(`${where}: unknown param "${name}"`);
      continue;
    }
    for (const v of [param.value, ...(param.keys ?? []).map((k) => k.v)]) {
      if (!kindOf(v).includes(ps.kind)) errors.push(`${where}.${name}: expected ${ps.kind}, got ${JSON.stringify(v)}`);
      else if (typeof v === "number" && ((ps.min !== undefined && v < ps.min) || (ps.max !== undefined && v > ps.max)))
        errors.push(`${where}.${name}: ${v} outside ${ps.min ?? "-inf"}..${ps.max ?? "inf"}`);
      else if (ps.options && typeof v === "string" && !ps.options.includes(v))
        errors.push(`${where}.${name}: "${v}" not one of ${ps.options.join(", ")}`);
    }
    if (param.keys?.length && !ps.animatable) errors.push(`${where}.${name}: not animatable, cannot hold keys`);
  }
  return errors;
}
