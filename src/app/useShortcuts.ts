/**
 * Global keys: Space play, ←/→ step (Shift = 10), Home/End, J/K previous/next key (AE),
 * Delete removes selected keys, ⌘Z / ⇧⌘Z (Ctrl on Windows). Ignored while typing.
 */
import { useEffect } from "react";
import { docStore, shownNetwork, useUi, viewComp } from "@/store";
import { deleteKeys } from "@/timeline/edits";
import { frameCount } from "@/viewer/Transport";

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) && (t as HTMLInputElement).type !== "range");

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      const ui = useUi.getState();
      const last = frameCount(viewComp(docStore.getState().doc, ui.path)) - 1;
      const go = (f: number) => {
        ui.setPlaying(false);
        ui.setFrame(Math.min(last, Math.max(0, f)));
      };
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) docStore.getState().redo();
        else docStore.getState().undo();
      } else if (e.key === " ") {
        e.preventDefault();
        ui.setPlaying(!ui.playing);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(ui.frame - (e.shiftKey ? 10 : 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(ui.frame + (e.shiftKey ? 10 : 1));
      } else if (e.key === "Home") go(0);
      else if (e.key === "End") go(last);
      else if (!mod && (e.key === "j" || e.key === "k")) {
        // Previous / next key of any layer in the shown network, by frame.
        const doc = docStore.getState().doc;
        const fps = viewComp(doc, ui.path).fps;
        const frames = [...new Set(shownNetwork(doc, ui.path).nodes.flatMap((n) => Object.values(n.params).flatMap((p) => (p.keys ?? []).map((k) => Math.round(k.t * fps)))))].sort((a, b) => a - b);
        const f = e.key === "j" ? frames.filter((x) => x < ui.frame).at(-1) : frames.find((x) => x > ui.frame);
        if (f !== undefined) go(f);
      } else if ((e.key === "Delete" || e.key === "Backspace") && ui.selectedKeys.length) {
        e.preventDefault();
        const net = shownNetwork(docStore.getState().doc, ui.path).id;
        const keys = ui.selectedKeys;
        if (docStore.getState().edit(keys.length > 1 ? "Delete keys" : "Delete key", (d) => deleteKeys(d, net, keys))) ui.selectKeys([]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
