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
  | "field" //      spatial influence (linear, spherical) — roadmap 3D-b
  | "3d" //         lives in a 3D scene: objects, camera, lights (on the timeline, like layers)
  | "material" //   surface looks, wired into an object's or layer's `material` input
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
  inputs: number; // max incoming wires on the main input; Infinity for merges
  /** Named inputs besides the main one, e.g. `material`. Each takes one wire. */
  ports?: readonly string[];
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

/**
 * 3D transform (inside a 3D scene). World units are px, y up, origin at the scene's centre,
 * +z towards the default camera. Rotation is degrees, X then Y then Z (three.js 'XYZ').
 */
const transform3d: Record<string, ParamSpec> = {
  position: { kind: "vec3", default: [0, 0, 0], animatable: true },
  rotation: { kind: "vec3", default: [0, 0, 0], animatable: true },
  scale: { kind: "vec3", default: [100, 100, 100], animatable: true },
  anchor: { kind: "vec3", default: [0, 0, 0], animatable: true },
  opacity: { kind: "number", default: 100, min: 0, max: 100, animatable: true },
};

/** Material kinds. `solid` is an unlit flat colour; the others are lit physical materials. */
export const MATERIAL_KINDS = ["solid", "plastic", "plaster", "glass", "metal", "iridescent", "emissive"] as const;

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
  /**
   * A 3D scene drawn into the comp as one layer, from [0, 0] to `size`. Its contents live in the
   * network it opens into (3D objects, camera, lights, materials). Without a camera, the default
   * one shows the z = 0 plane 1:1, like After Effects.
   */
  Scene3D: {
    category: "layer",
    label: "3D scene",
    inputs: 0,
    params: {
      size: { kind: "vec2", default: [1920, 1080] },
      environment: { kind: "choice", default: "studio-soft", options: ["studio-soft", "studio-hard", "overcast", "none"] },
      environmentIntensity: { kind: "number", default: 1, min: 0, max: 4, animatable: true },
      shadows: { kind: "toggle", default: true },
      /** Ambient occlusion strength, 0..1: soft contact shadows where surfaces meet. */
      ambientOcclusion: { kind: "number", default: 0.5, min: 0, max: 1, animatable: true },
      ...transform,
    },
  },
  /** Extruded type from the font's outlines, centred on its origin. */
  Text3D: {
    category: "3d",
    label: "Text 3D",
    inputs: 0,
    ports: ["material"],
    params: {
      text: { kind: "text", default: "Text", animatable: true },
      font: { kind: "font", default: "Inter" },
      weight: { kind: "number", default: 700, min: 100, max: 900 },
      size: { kind: "number", default: 200, min: 1, animatable: true },
      tracking: { kind: "number", default: 0, animatable: true },
      leading: { kind: "number", default: 1.1, min: 0.5, max: 3 },
      align: { kind: "choice", default: "center", options: ["left", "center", "right"] },
      /** Extrusion depth in px. */
      depth: { kind: "number", default: 40, min: 0, animatable: true },
      /** Rounded edge in px (0 = sharp). */
      bevel: { kind: "number", default: 2, min: 0, animatable: true },
      /** Colour when no material is wired in. */
      fill: { kind: "color", default: "#FFFFFF", animatable: true },
      ...transform3d,
    },
  },
  /** An extruded rectangle, ellipse or SVG path, centred on its origin. */
  Shape3D: {
    category: "3d",
    label: "Shape 3D",
    inputs: 0,
    ports: ["material"],
    params: {
      shape: { kind: "choice", default: "rect", options: ["rect", "ellipse", "path"] },
      size: { kind: "vec2", default: [400, 400], animatable: true },
      radius: { kind: "number", default: 0, min: 0, animatable: true },
      path: { kind: "text", default: "" },
      depth: { kind: "number", default: 40, min: 0, animatable: true },
      bevel: { kind: "number", default: 2, min: 0, animatable: true },
      fill: { kind: "color", default: "#FFFFFF", animatable: true },
      ...transform3d,
    },
  },
  /** Looks from `position` at `target`. Lens in mm on a 36 mm wide film back (AE's default). */
  Camera: {
    category: "3d",
    label: "Camera",
    inputs: 0,
    params: {
      position: { kind: "vec3", default: [0, 0, 2666.67], animatable: true },
      target: { kind: "vec3", default: [0, 0, 0], animatable: true },
      lens: { kind: "number", default: 50, min: 5, max: 400, animatable: true },
      roll: { kind: "number", default: 0, animatable: true },
    },
  },
  Light: {
    category: "3d",
    label: "Light",
    inputs: 0,
    params: {
      kind: { kind: "choice", default: "directional", options: ["directional", "point", "spot"] },
      color: { kind: "color", default: "#FFFFFF", animatable: true },
      intensity: { kind: "number", default: 2, min: 0, max: 20, animatable: true },
      position: { kind: "vec3", default: [-900, 1200, 1600], animatable: true },
      target: { kind: "vec3", default: [0, 0, 0], animatable: true },
      castShadow: { kind: "toggle", default: true },
      /** Shadow edge, 0 = hard, 1 = very soft. */
      softness: { kind: "number", default: 0.5, min: 0, max: 1, animatable: true },
      /** Spot cone in degrees. */
      angle: { kind: "number", default: 40, min: 1, max: 89, animatable: true },
    },
  },
  /**
   * Makes copies of the object wired into it, in its own space: a grid (centred), a line (step
   * per clone) or a circle. Effectors after it change the clones; it has its own 3D transform.
   */
  Cloner: {
    category: "split",
    label: "Cloner",
    inputs: 1,
    params: {
      mode: { kind: "choice", default: "grid", options: ["grid", "linear", "radial"] },
      /** Grid: columns, rows, layers. Linear and radial: the first number is the count. */
      count: { kind: "vec3", default: [3, 3, 1] },
      spacing: { kind: "vec3", default: [300, 200, 200], animatable: true },
      /** Linear: position and rotation added per clone. */
      step: { kind: "vec3", default: [250, 0, 0], animatable: true },
      stepRotation: { kind: "vec3", default: [0, 0, 0], animatable: true },
      radius: { kind: "number", default: 400, min: 0, animatable: true },
      plane: { kind: "choice", default: "xy", options: ["xy", "xz", "zy"] },
      /** Radial: turn each clone to face along the circle. */
      align: { kind: "toggle", default: true },
      /** Grid: odd rows slide +x, even rows −x by this many px. Key it to make rows run past each other. */
      rowSlide: { kind: "number", default: 0, animatable: true },
      ...transform3d,
    },
  },
  /** Random offsets per clone, and colours from a palette. Wire a field into it to say where. */
  Random: {
    category: "animate",
    label: "Random effector",
    inputs: 1,
    ports: ["field"],
    params: {
      strength: { kind: "number", default: 1, min: 0, max: 1, animatable: true },
      position: { kind: "vec3", default: [0, 0, 0], animatable: true },
      rotation: { kind: "vec3", default: [0, 0, 0], animatable: true },
      /** ± percent. */
      scale: { kind: "number", default: 0, animatable: true },
      /** Colours to pick from, comma separated: hex or brand tokens (brand:primary). */
      palette: { kind: "text", default: "" },
      seed: { kind: "number", default: 1 },
    },
  },
  /**
   * Clones arrive or leave one after another (Motion Builder's animate in / out, per clone): each
   * starts offset by these values and settles at rest, staggered. A spring ease gives overshoot.
   */
  Reveal: {
    category: "animate",
    label: "Reveal effector",
    inputs: 1,
    params: {
      mode: { kind: "choice", default: "in", options: ["in", "out"] },
      start: { kind: "number", default: 0, min: 0 },
      duration: { kind: "number", default: 0.8, min: 0 },
      ease: { kind: "ease", default: "outExpo" },
      stagger: { kind: "number", default: 0.04, min: 0 },
      from: { kind: "choice", default: "first", options: ["first", "last", "center", "random", "edges"] },
      offsetPosition: { kind: "vec3", default: [0, -300, 0] },
      offsetRotation: { kind: "vec3", default: [-90, 0, 0] },
      /** Percent at the start of the move (0 = grows from nothing, 100 = no scaling). */
      offsetScale: { kind: "number", default: 100, min: 0 },
    },
  },
  /** Moves, turns and scales every clone by the same amount (where its field says so). */
  Plain: {
    category: "animate",
    label: "Plain effector",
    inputs: 1,
    ports: ["field"],
    params: {
      strength: { kind: "number", default: 1, min: 0, max: 1, animatable: true },
      position: { kind: "vec3", default: [0, 0, 0], animatable: true },
      rotation: { kind: "vec3", default: [0, 0, 0], animatable: true },
      scale: { kind: "number", default: 0, animatable: true },
    },
  },
  /** Like Plain, ramped from nothing on the first clone to all of it on the last. */
  Step: {
    category: "animate",
    label: "Step effector",
    inputs: 1,
    ports: ["field"],
    params: {
      strength: { kind: "number", default: 1, min: 0, max: 1, animatable: true },
      position: { kind: "vec3", default: [0, 0, 0], animatable: true },
      rotation: { kind: "vec3", default: [0, 90, 0], animatable: true },
      scale: { kind: "number", default: 0, animatable: true },
    },
  },
  /** Full weight on one side of a plane, none on the other, ramping over `length`. */
  LinearField: {
    category: "field",
    label: "Linear field",
    inputs: 0,
    params: {
      position: { kind: "vec3", default: [0, 0, 0], animatable: true },
      direction: { kind: "choice", default: "x", options: ["x", "-x", "y", "-y", "z", "-z"] },
      length: { kind: "number", default: 600, min: 1, animatable: true },
      invert: { kind: "toggle", default: false },
    },
  },
  /** Full weight inside a sphere, fading out over its edge. */
  SphericalField: {
    category: "field",
    label: "Spherical field",
    inputs: 0,
    params: {
      position: { kind: "vec3", default: [0, 0, 0], animatable: true },
      radius: { kind: "number", default: 400, min: 0, animatable: true },
      /** 0 = hard edge, 1 = fades from the centre. */
      falloff: { kind: "number", default: 0.5, min: 0, max: 1, animatable: true },
      invert: { kind: "toggle", default: false },
    },
  },
  /** Smooth 3D noise, moving over time. */
  NoiseField: {
    category: "field",
    label: "Noise field",
    inputs: 0,
    params: {
      scale: { kind: "number", default: 400, min: 1, animatable: true },
      speed: { kind: "number", default: 0.5, animatable: true },
      seed: { kind: "number", default: 1 },
      invert: { kind: "toggle", default: false },
    },
  },
  /** A physical material (three.js MeshPhysicalMaterial). Wire it into an object's `material` input. */
  Material: {
    category: "material",
    label: "Material",
    inputs: 0,
    params: {
      kind: { kind: "choice", default: "plastic", options: MATERIAL_KINDS },
      color: { kind: "color", default: "#FFFFFF", animatable: true },
      roughness: { kind: "number", default: 0.45, min: 0, max: 1, animatable: true },
      metalness: { kind: "number", default: 0, min: 0, max: 1, animatable: true },
      transmission: { kind: "number", default: 0, min: 0, max: 1, animatable: true },
      ior: { kind: "number", default: 1.5, min: 1, max: 2.333, animatable: true },
      thickness: { kind: "number", default: 0.5, min: 0, max: 1, animatable: true },
      clearcoat: { kind: "number", default: 0, min: 0, max: 1, animatable: true },
      iridescence: { kind: "number", default: 0, min: 0, max: 1, animatable: true },
      emission: { kind: "number", default: 0, min: 0, max: 4, animatable: true },
      /** Fine surface noise (bump), 0..1: plaster, paper, matte plastic. */
      grain: { kind: "number", default: 0, min: 0, max: 1, animatable: true },
    },
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

/** Named input ports of a node type (besides its main input), e.g. ["material"]. */
export const portsOf = (type: string): readonly string[] => (isNodeType(type) ? (CATALOG[type] as NodeSpec).ports ?? [] : []);

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
