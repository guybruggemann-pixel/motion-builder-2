/** Global keys: Space play, ←/→ step (Shift = 10), Home/End, ⌘Z / ⇧⌘Z (Ctrl on Windows). Ignored while typing. */
import { useEffect } from "react";
import { docStore, useUi, viewComp } from "@/store";
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
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
