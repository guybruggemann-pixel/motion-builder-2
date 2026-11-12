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

export interface MaterialPreset {
  id: string;
  name: string;
  kind: MaterialKind;
  color: string;
  /** Overrides on top of the kind's defaults. */
  params?: Record<string, Value>;
}

export const MATERIAL_PRESETS: MaterialPreset[] = [
  { id: "plaster", name: "Plaster", kind: "plaster", color: "#ECE8E1" },
  { id: "gloss-plastic", name: "Gloss plastic", kind: "plastic", color: "#2F5BFF", params: { roughness: 0.15, clearcoat: 1 } },
  { id: "matte-plastic", name: "Matte plastic", kind: "plastic", color: "#8C7CF0", params: { roughness: 0.7, clearcoat: 0, grain: 0.15 } },
  { id: "glass", name: "Glass", kind: "glass", color: "#FFFFFF" },
  { id: "frosted", name: "Frosted", kind: "glass", color: "#F2F6FF", params: { roughness: 0.45 } },
  { id: "chrome", name: "Chrome", kind: "metal", color: "#E8EAEE", params: { roughness: 0.05 } },
  { id: "brushed-alu", name: "Brushed alu", kind: "metal", color: "#C9CDD3", params: { roughness: 0.35, grain: 0.25 } },
  { id: "gold", name: "Gold", kind: "metal", color: "#E5B65A", params: { roughness: 0.2 } },
  { id: "foil", name: "Foil", kind: "iridescent", color: "#D9DDE8" },
  { id: "neon", name: "Neon", kind: "emissive", color: "#C3FC2F", params: { emission: 2.5 } },
  { id: "paper", name: "Paper", kind: "plaster", color: "#F7F4EE", params: { roughness: 1, grain: 0.2 } },
  { id: "ink", name: "Ink", kind: "solid", color: "#16171A" },
];

/** A preset's full Material params. */
export function presetParams(p: MaterialPreset): Record<string, Value> {
  return { kind: p.kind, color: p.color, ...KIND_DEFAULTS[p.kind], ...p.params };
}
