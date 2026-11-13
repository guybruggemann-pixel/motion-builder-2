/**
 * A library package's `asset.json`: what an asset is and how it moves, for browsing, retrieval
 * and the AI. The format is specified in `docs/asset-library.md`; keep the two in step.
 */
import { z } from "zod";
import { Id } from "../scene/schema";

export const ASSET_CATEGORIES = ["title", "lower-third", "icon-pop", "transition", "loop", "counter", "logo-sting", "kinetic-type", "3d-type", "background", "other"] as const;

/** The motion grammar: the parts of an animation the AI reasons about and retrieval matches on. */
export const Grammar = z.object({
  /** One of `CHARACTERS` in core/motion. */
  character: z.enum(["smooth", "punchy", "playful"]),
  /** e.g. ["enter", "hold", "exit"], ["loop"], ["already-composed", "continuous"]. */
  structure: z.array(z.string().min(1)).min(1),
  /** Seconds per part of the structure. */
  timing: z.record(z.string(), z.number().min(0)).default({}),
  /** Ease strings as they appear in the doc, most used first. */
  eases: z.array(z.string().min(1)).default([]),
  stagger: z.object({ by: z.enum(["characters", "words", "lines", "layers", "clones"]), each: z.number().min(0), from: z.enum(["first", "last", "center", "random", "edges"]).default("first") }).optional(),
  techniques: z.array(z.string().min(1)).default([]),
});
export type Grammar = z.infer<typeof Grammar>;

export const AssetMeta = z.object({
  /** Same as the package's folder name. */
  id: Id,
  name: z.string().min(1),
  category: z.enum(ASSET_CATEGORIES),
  dimension: z.enum(["2d", "3d", "mixed"]),
  tags: z.array(z.string().min(1)).default([]),
  description: z.string().min(1),
  grammar: Grammar,
  /** Promoted control ids of the asset's network in doc.json. */
  controls: z.array(Id).default([]),
  source: z.object({
    tool: z.enum(["ae", "c4d", "app", "preset", "pack"]),
    file: z.string().optional(),
    comp: z.string().optional(),
    author: z.string().optional(),
    /** Required: no package without a known licence. */
    license: z.string().min(1, "a package needs a known licence"),
  }),
  quality: z.object({ rating: z.number().int().min(1).max(5), approvedBy: z.string().optional(), approvedAt: z.string().optional() }).optional(),
  /** inbox = waiting for the owner; rejected stays as a negative example. */
  status: z.enum(["inbox", "approved", "rejected"]),
  /** What an importer skipped or approximated, in plain words. */
  importNotes: z.array(z.string()).optional(),
});
export type AssetMeta = z.infer<typeof AssetMeta>;
