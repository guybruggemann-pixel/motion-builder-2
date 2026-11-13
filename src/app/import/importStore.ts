import { create } from "zustand";
import type { DraftSpec, SceneDoc } from "@core/scene";

/**
 * What waits in Draft: the design Import produced (undefined = draft the open project), the
 * motion prompt and, once the AI answered, its draft. It only becomes the project when a draft is
 * picked (`docStore.load`), so Import never touches the open work by itself.
 */
interface ImportState {
  base?: SceneDoc;
  skipped: string[];
  prompt: string;
  spec?: DraftSpec;
  summary?: string;
  /** A library preset picked on Import: its own animated doc, shown as a Draft card. */
  preset?: { name: string; desc: string; doc: SceneDoc };
  set(base: SceneDoc | undefined, extra?: { skipped?: string[]; prompt?: string; spec?: DraftSpec; summary?: string; preset?: ImportState["preset"] }): void;
  setSpec(spec: DraftSpec | undefined): void;
}
export const useImport = create<ImportState>()((set) => ({
  base: undefined,
  skipped: [],
  prompt: "",
  set: (base, e = {}) => set({ base, skipped: e.skipped ?? [], prompt: e.prompt ?? "", spec: e.spec, summary: e.summary, preset: e.preset }),
  setSpec: (spec) => set({ spec }),
}));
