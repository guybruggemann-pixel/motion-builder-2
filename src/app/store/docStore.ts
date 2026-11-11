/**
 * The scene doc store: the only place the app holds output-affecting state.
 *
 * - Every doc that enters (load) or results from an edit passes `validateDoc`; an invalid edit
 *   is rejected and the doc stays as it was.
 * - Edits are immer recipes. The doc is frozen and structurally shared, so a new doc object
 *   means "changed" (the frame cache relies on this).
 * - Undo/redo stores immer patches, not snapshots. Edits with the same `coalesce` key in a row
 *   (a slider drag, typing in a field) collapse into one undo step.
 */
import { applyPatches, enablePatches, freeze, produceWithPatches, type Draft, type Patch } from "immer";
import { createStore } from "zustand";
import { validateDoc, type SceneDoc } from "@core/scene";

enablePatches();

export interface HistoryEntry {
  label: string;
  patches: Patch[];
  inverse: Patch[];
  coalesce?: string;
}

export interface DocState {
  doc: SceneDoc;
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** Errors from the last rejected load or edit; empty when it went through. */
  errors: string[];
  /** Replace the doc (from disk, an importer or the AI). Clears history. */
  load(input: unknown): boolean;
  /** Apply a change. Returns false (and sets `errors`) when the result doesn't validate. */
  edit(label: string, recipe: (d: Draft<SceneDoc>) => void, opts?: { coalesce?: string }): boolean;
  /** Close the current coalesce run, so the next edit starts a new undo step (e.g. on pointer up). */
  commit(): void;
  undo(): void;
  redo(): void;
}

const HISTORY_LIMIT = 500;

export function createDocStore(initial: unknown) {
  const first = validateDoc(initial);
  if (!first.ok) throw new Error(`initial doc is invalid:\n${first.errors.join("\n")}`);

  return createStore<DocState>()((set, get) => ({
    doc: freeze(first.doc, true),
    past: [],
    future: [],
    errors: [],

    load(input) {
      const r = validateDoc(input);
      if (!r.ok) {
        set({ errors: r.errors });
        return false;
      }
      set({ doc: freeze(r.doc, true), past: [], future: [], errors: [] });
      return true;
    },

    edit(label, recipe, opts = {}) {
      const { doc, past } = get();
      const [next, patches, inverse] = produceWithPatches(doc, recipe);
      if (!patches.length) return true;
      const r = validateDoc(next);
      if (!r.ok) {
        set({ errors: r.errors });
        return false;
      }
      const top = past[past.length - 1];
      const merge = opts.coalesce !== undefined && top?.coalesce === opts.coalesce;
      const history = merge
        ? [...past.slice(0, -1), { ...top, patches: [...top.patches, ...patches], inverse: [...inverse, ...top.inverse] }]
        : [...past, { label, patches, inverse, coalesce: opts.coalesce }];
      set({ doc: next, past: history.slice(-HISTORY_LIMIT), future: [], errors: [] });
      return true;
    },

    commit() {
      const { past } = get();
      const top = past[past.length - 1];
      if (top?.coalesce) set({ past: [...past.slice(0, -1), { ...top, coalesce: undefined }] });
    },

    undo() {
      const { doc, past, future } = get();
      const top = past[past.length - 1];
      if (!top) return;
      set({ doc: applyPatches(doc, top.inverse), past: past.slice(0, -1), future: [{ ...top, coalesce: undefined }, ...future], errors: [] });
    },

    redo() {
      const { doc, past, future } = get();
      const [top, ...rest] = future;
      if (!top) return;
      set({ doc: applyPatches(doc, top.patches), past: [...past, top], future: rest, errors: [] });
    },
  }));
}

export type DocStore = ReturnType<typeof createDocStore>;


