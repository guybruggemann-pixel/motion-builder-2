/**
 * Pure helpers for scene files (no DOM): parse a saved file, write one, name it.
 * A file is the scene doc as JSON; opening runs `validateDoc` (which migrates older versions).
 */
import { validateDoc, type SceneDoc, type ValidateResult } from "@core/scene";

export const FILE_EXT = ".mb.json";

export function parseDocFile(text: string): ValidateResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["This file isn't a Motion Builder scene (not valid JSON)."] };
  }
  return validateDoc(raw);
}

export function serializeDoc(doc: SceneDoc): string {
  return JSON.stringify(doc, null, 2);
}

/** "Lower third / v01" → "Lower-third.mb.json"; safe on every OS. */
export function fileNameFor(doc: SceneDoc): string {
  const base = doc.name.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-") || "scene";
  return base + FILE_EXT;
}

/** Why picking a folder or file won't work here, or undefined when it will. */
export function fileAccessProblem(win: { showDirectoryPicker?: unknown; self?: unknown; top?: unknown }): string | undefined {
  if (win.self !== win.top) return "Exporting to a folder doesn't work inside the editor preview. Open the app in its own tab (the ↗ button above the preview) and try again.";
  if (!win.showDirectoryPicker) return "Exporting to a folder needs Chrome or Edge.";
  return undefined;
}
