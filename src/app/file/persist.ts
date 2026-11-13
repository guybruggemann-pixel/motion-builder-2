/**
 * Save / open / autosave. The doc store stays the only holder of the doc; this module tracks
 * which doc was last saved (to show "unsaved" and warn before leaving) and mirrors the doc to
 * IndexedDB so a reload restores it.
 */
import { createStore, useStore } from "zustand";
import type { SceneDoc } from "@core/scene";
import { docStore, useUi } from "@/app/store";
import { fileNameFor, parseDocFile, serializeDoc } from "./docFile";

type Handle = { name: string; createWritable(): Promise<{ write(b: Blob): Promise<void>; close(): Promise<void> }> };
type Win = typeof window & {
  showSaveFilePicker?: (o?: object) => Promise<Handle>;
  showOpenFilePicker?: (o?: object) => Promise<{ getFile(): Promise<File> }[]>;
};

interface FileState {
  /** The doc as last saved or opened; undefined when it was never saved. */
  savedDoc?: SceneDoc;
  fileName?: string;
  handle?: Handle;
  message?: { kind: "ok" | "error"; text: string };
}
export const fileStore = createStore<FileState>()(() => ({ savedDoc: docStore.getState().doc }));
export const useFile = <T,>(pick: (s: FileState) => T) => useStore(fileStore, pick);
export const isDirty = () => docStore.getState().doc !== fileStore.getState().savedDoc;

const PICK_TYPES = [{ description: "Motion Builder scene", accept: { "application/json": [".json"] } }];
const win = () => window as Win;
const inFrame = () => window.self !== window.top;
let hide: ReturnType<typeof setTimeout> | undefined;
const say = (kind: "ok" | "error", text: string) => {
  fileStore.setState({ message: { kind, text } });
  clearTimeout(hide);
  hide = setTimeout(() => fileStore.setState({ message: undefined }), kind === "error" ? 7000 : 2500);
};

async function writeTo(handle: Handle, doc: SceneDoc) {
  const w = await handle.createWritable();
  await w.write(new Blob([serializeDoc(doc)], { type: "application/json" }));
  await w.close();
}

export async function saveDoc(as = false) {
  const doc = docStore.getState().doc;
  const { handle } = fileStore.getState();
  try {
    if (handle && !as) {
      await writeTo(handle, doc);
    } else if (win().showSaveFilePicker && !inFrame()) {
      const h = await win().showSaveFilePicker!({ suggestedName: fileNameFor(doc), types: PICK_TYPES });
      await writeTo(h, doc);
      fileStore.setState({ handle: h, fileName: h.name });
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([serializeDoc(doc)], { type: "application/json" }));
      a.download = fileNameFor(doc);
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      fileStore.setState({ fileName: a.download });
    }
    fileStore.setState({ savedDoc: doc });
    say("ok", `Saved ${fileStore.getState().fileName ?? ""}`.trim());
  } catch (e) {
    if ((e as Error).name !== "AbortError") say("error", `Couldn't save: ${(e as Error).message}`);
  }
}

export function loadText(text: string, fileName?: string, handle?: Handle) {
  const r = parseDocFile(text);
  if (!r.ok || !docStore.getState().load(r.doc)) {
    say("error", `Couldn't open ${fileName ?? "file"}: ${(r.ok ? docStore.getState().errors : r.errors)[0] ?? "invalid scene"}`);
    return false;
  }
  fileStore.setState({ savedDoc: docStore.getState().doc, fileName, handle });
  useUi.getState().setPlaying(false);
  useUi.getState().setPath([], 0);
  useUi.getState().setScreen("refine");
  say("ok", `Opened ${fileName ?? "scene"}`);
  return true;
}

let openWarned = 0;
export async function openDoc() {
  if (isDirty() && Date.now() - openWarned > 8000) {
    openWarned = Date.now();
    say("error", "You have unsaved changes. Press Open again within a few seconds to discard them, or Save first.");
    return;
  }
  openWarned = 0;
  try {
    if (win().showOpenFilePicker && !inFrame()) {
      const [h] = await win().showOpenFilePicker!({ types: PICK_TYPES });
      if (!h) return;
      const f = await h.getFile();
      loadText(await f.text(), f.name, h as unknown as Handle);
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (f) loadText(await f.text(), f.name);
    };
    input.click();
  } catch (e) {
    if ((e as Error).name !== "AbortError") say("error", `Couldn't open: ${(e as Error).message}`);
  }
}

// ---- autosave to IndexedDB ----
const DB = "motion-builder", STORE = "autosave", KEY = "current";
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbDo<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, mode);
    const q = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); res(q.result); };
    tx.onabort = () => { db.close(); rej(tx.error); };
    tx.onerror = () => { db.close(); rej(tx.error); };
  });
}

interface Snapshot { text: string; savedText: string; fileName?: string }

let started = false;
/** Restore the last session, then mirror every change. Call once on mount. */
export async function startAutosave() {
  if (started || typeof indexedDB === "undefined") return;
  started = true;
  try {
    const snap = await idbDo<Snapshot | undefined>("readonly", (s) => s.get(KEY));
    if (snap && loadText(snap.text, snap.fileName)) {
      const saved = snap.savedText === snap.text ? docStore.getState().doc : snap.savedText ? parseDocFile(snap.savedText) : undefined;
      fileStore.setState({ savedDoc: saved && "ok" in saved ? (saved.ok ? saved.doc : undefined) : saved });
      say("ok", "Restored your last session");
    }
  } catch {
    /* no autosave yet or storage blocked: start fresh */
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const write = () => {
    const { savedDoc, fileName } = fileStore.getState();
    const doc = docStore.getState().doc;
    const text = serializeDoc(doc);
    const snap: Snapshot = { text, savedText: savedDoc === doc ? text : savedDoc ? serializeDoc(savedDoc) : "", fileName };
    idbDo("readwrite", (s) => s.put(snap, KEY)).catch(() => {});
  };
  docStore.subscribe((s, p) => {
    if (s.doc === p.doc) return;
    clearTimeout(timer);
    timer = setTimeout(write, 600);
  });
  fileStore.subscribe((s, p) => s.savedDoc !== p.savedDoc && write());
  window.addEventListener("beforeunload", (e) => {
    write();
    if (isDirty()) e.preventDefault();
  });
}
