/**
 * Starter materials (handover §3): physical looks for Material nodes, as param sets. Applying one
 * writes these params into a Material node; `KIND_DEFAULTS` are what changing a material's kind
 * sets (its colour stays). Values are three.js MeshPhysicalMaterial terms (see the catalog).
 */
import type { Value } from "./schema";
import type { MATERIAL_KINDS } from "./catalog";

export type MaterialKind = (typeof MATERIAL_KINDS)[number];

/** Params a kind implies (except colour). */
export const KIND_DEFAULTS: Record<MaterialKind, Record<string, Value>> = {
  solid: { roughness: 1, metalness: 0, transmission: 0, clearcoat: 0, iridescence: 0, emission: 0, grain: 0 },
  plastic: { roughness: 0.4, metalness: 0, transmission: 0, clearcoat: 0.3, iridescence: 0, emission: 0, grain: 0 },
  plaster: { roughness: 0.9, metalness: 0, transmission: 0, clearcoat: 0, iridescence: 0, emission: 0, grain: 0.35 },
  glass: { roughness: 0.05, metalness: 0, transmission: 1, ior: 1.5, thickness: 0.6, clearcoat: 1, iridescence: 0, emission: 0, grain: 0 },
  metal: { roughness: 0.2, metalness: 1, transmission: 0, clearcoat: 0, iridescence: 0, emission: 0, grain: 0 },
  iridescent: { roughness: 0.25, metalness: 0.6, transmission: 0, clearcoat: 1, iridescence: 1, emission: 0, grain: 0 },
  emissive: { roughness: 0.5, metalness: 0, transmission: 0, clearcoat: 0, iridescence: 0, emission: 2, grain: 0 },
};

export type MaterialGroup = "metal" | "plastic" | "glass" | "ceramic" | "everyday" | "special";

/** Library sections, in display order. */
export const MATERIAL_GROUPS: { id: MaterialGroup; name: string }[] = [
  { id: "metal", name: "Metals" },
  { id: "plastic", name: "Plastics" },
  { id: "glass", name: "Glass & crystal" },
  { id: "ceramic", name: "Ceramic & stone" },
  { id: "everyday", name: "Everyday" },
  { id: "special", name: "Special" },
];

export interface MaterialPreset {
  id: string;
  name: string;
  group: MaterialGroup;
  kind: MaterialKind;
  color: string;
  /** Overrides on top of the kind's defaults. */
  params?: Record<string, Value>;
}

/**
 * Colours of real materials come from physicallybased.info (CC0; linear base colour converted to
 * sRGB hex, ior from the same source). Roughness is a look choice, not measured.
 */
export const MATERIAL_PRESETS: MaterialPreset[] = [
  { id: "gold", name: "Gold", group: "metal", kind: "metal", color: "#FFE496", params: { roughness: 0.15 } },
  { id: "silver", name: "Silver", group: "metal", kind: "metal", color: "#FEFDFC", params: { roughness: 0.1 } },
  { id: "copper", name: "Copper", group: "metal", kind: "metal", color: "#F7CFBF", params: { roughness: 0.2 } },
  { id: "brass", name: "Brass", group: "metal", kind: "metal", color: "#F5E4AE", params: { roughness: 0.25 } },
  { id: "chrome", name: "Chrome", group: "metal", kind: "metal", color: "#D3D8DA", params: { roughness: 0.04 } },
  { id: "aluminium", name: "Aluminium", group: "metal", kind: "metal", color: "#F5F6F6", params: { roughness: 0.2 } },
  { id: "brushed-alu", name: "Brushed alu", group: "metal", kind: "metal", color: "#F5F6F6", params: { roughness: 0.35, grain: 0.25 } },
  { id: "stainless", name: "Stainless steel", group: "metal", kind: "metal", color: "#D6D1CB", params: { roughness: 0.25 } },
  { id: "titanium", name: "Titanium", group: "metal", kind: "metal", color: "#B1AAA2", params: { roughness: 0.3 } },
  { id: "platinum", name: "Platinum", group: "metal", kind: "metal", color: "#E3DED7", params: { roughness: 0.15 } },
  { id: "iron", name: "Cast iron", group: "metal", kind: "metal", color: "#C0BEBB", params: { roughness: 0.55, grain: 0.3 } },
  { id: "zinc", name: "Zinc", group: "metal", kind: "metal", color: "#E8EDEF", params: { roughness: 0.35 } },
  { id: "acrylic", name: "Acrylic", group: "glass", kind: "glass", color: "#FFFFFF", params: { ior: 1.49, roughness: 0.02 } },
  { id: "glass", name: "Glass", group: "glass", kind: "glass", color: "#FFFFFF", params: { ior: 1.52 } },
  { id: "frosted", name: "Frosted glass", group: "glass", kind: "glass", color: "#FFFFFF", params: { ior: 1.52, roughness: 0.45 } },
  { id: "diamond", name: "Diamond", group: "glass", kind: "glass", color: "#FFFFFF", params: { ior: 2.33, roughness: 0 } },
  { id: "sapphire", name: "Sapphire", group: "glass", kind: "glass", color: "#D6E2EE", params: { ior: 1.77, roughness: 0.02 } },
  { id: "ice", name: "Ice", group: "glass", kind: "glass", color: "#FFFFFF", params: { ior: 1.31, roughness: 0.3 } },
  { id: "water", name: "Water", group: "glass", kind: "glass", color: "#FFFFFF", params: { ior: 1.33, roughness: 0, clearcoat: 0 } },
  { id: "porcelain", name: "Porcelain", group: "ceramic", kind: "plastic", color: "#E0E0DD", params: { roughness: 0.15, clearcoat: 1 } },
  { id: "marble", name: "Marble", group: "ceramic", kind: "plastic", color: "#EBE6E1", params: { roughness: 0.2, clearcoat: 0.6, grain: 0.1 } },
  { id: "concrete", name: "Concrete", group: "ceramic", kind: "plaster", color: "#BDBDBD", params: { roughness: 0.9, grain: 0.45 } },
  { id: "brick", name: "Brick", group: "ceramic", kind: "plaster", color: "#8C5746", params: { roughness: 0.9, grain: 0.4 } },
  { id: "eggshell", name: "Eggshell", group: "ceramic", kind: "plaster", color: "#CDCFD0", params: { roughness: 0.85, grain: 0.1 } },
  { id: "sand", name: "Sand", group: "ceramic", kind: "plaster", color: "#B1A784", params: { roughness: 1, grain: 0.6 } },
  { id: "car-paint", name: "Car paint", group: "everyday", kind: "plastic", color: "#595959", params: { roughness: 0.3, clearcoat: 1 } },
  { id: "tire", name: "Rubber", group: "everyday", kind: "solid", color: "#2A2A2A", params: { roughness: 0.75 } },
  { id: "whiteboard", name: "Whiteboard", group: "everyday", kind: "plastic", color: "#F0EFE3", params: { roughness: 0.1, clearcoat: 0.8 } },
  { id: "blackboard", name: "Blackboard", group: "everyday", kind: "solid", color: "#383838", params: { roughness: 0.9, grain: 0.15 } },
  { id: "chocolate", name: "Chocolate", group: "everyday", kind: "plastic", color: "#705545", params: { roughness: 0.35, clearcoat: 0.2 } },
  { id: "pearl", name: "Pearl", group: "special", kind: "iridescent", color: "#E7E1DA", params: { roughness: 0.35, metalness: 0, iridescence: 0.5 } },
  { id: "soap-bubble", name: "Soap bubble", group: "special", kind: "iridescent", color: "#FFFFFF", params: { roughness: 0, metalness: 0, transmission: 1, ior: 1, thickness: 0.1 } },
  { id: "gloss-plastic", name: "Gloss plastic", group: "plastic", kind: "plastic", color: "#2F5BFF", params: { roughness: 0.15, clearcoat: 1 } },
  { id: "matte-plastic", name: "Matte plastic", group: "plastic", kind: "plastic", color: "#8C7CF0", params: { roughness: 0.7, clearcoat: 0, grain: 0.15 } },
  { id: "soft-touch", name: "Soft touch", group: "plastic", kind: "plastic", color: "#2A2B30", params: { roughness: 0.85, clearcoat: 0 } },
  { id: "plaster", name: "Plaster", group: "ceramic", kind: "plaster", color: "#ECE8E1" },
  { id: "paper", name: "Paper", group: "everyday", kind: "plaster", color: "#F7F4EE", params: { roughness: 1, grain: 0.2 } },
  { id: "ink", name: "Ink", group: "everyday", kind: "solid", color: "#16171A" },
  { id: "foil", name: "Foil", group: "special", kind: "iridescent", color: "#D9DDE8" },
  { id: "neon", name: "Neon", group: "special", kind: "emissive", color: "#C3FC2F", params: { emission: 2.5 } },
];

/** A preset's full Material params. */
export function presetParams(p: MaterialPreset): Record<string, Value> {
  return { kind: p.kind, color: p.color, ...KIND_DEFAULTS[p.kind], ...p.params };
}
