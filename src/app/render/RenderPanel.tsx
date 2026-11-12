/**
 * Render the shown comp to ProRes 4444 with alpha (.mov). Frames are drawn on the page (it has the
 * fonts) one at a time, frame-stepped, and encoded in parallel workers running v1's encoder.
 */
import { useRef, useState } from "react";
import { Clapperboard, X } from "lucide-react";
import { Button, Label, Switch } from "@/design-system/motionbuilder---brandbook-c4b4eb";
import { docStore, shownNetwork, useUi, viewComp } from "@/store";
import { loadFonts } from "./fonts";
import { mp4Supported } from "./mp4";
import { renderToBlob } from "./renderJob";
import { canvasMeasure } from "./canvas2d";
import { exportAe, passesScript } from "@/export/exportAe";
import { exportPasses } from "./passes/export";
import type { PassOptions } from "./passes/plan";

type State =
  | { kind: "idle" }
  | { kind: "busy"; done: number; total: number; started: number }
  | { kind: "done"; url: string; name: string; seconds: number; frames: number; note?: string }
  | { kind: "error"; message: string };

export function RenderPanel({ onClose }: { onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [format, setFormat] = useState<"prores" | "mp4">("prores");
  const [blur, setBlur] = useState(true);
  const [aov, setAov] = useState<PassOptions>({ mattes: true, puzzle: true, depth: true });
  const [state, setState] = useState<State>({ kind: "idle" });
  const cancel = useRef(false);
  const doc = docStore.getState().doc;
  const path = useUi.getState().path;
  const net = shownNetwork(doc, path);
  const comp = viewComp(doc, path);
  const w = Math.round((comp.width * scale) / 2) * 2, h = Math.round((comp.height * scale) / 2) * 2;

  const run = async () => {
    cancel.current = false;
    useUi.getState().setPlaying(false);
    try {
      await loadFonts();
      const doc = docStore.getState().doc; // render exactly what the doc is now
      const started = performance.now();
      const out = await renderToBlob(doc, net.id, { format, width: w, height: h, motionBlur: blur }, (done, total) => setState({ kind: "busy", done, total, started }), () => cancel.current);
      if (!out) return setState({ kind: "idle" });
      setState({ kind: "done", url: URL.createObjectURL(out.blob), name: `${net.name.replace(/[^\w.-]+/g, "_")}.${out.ext}`, seconds: (performance.now() - started) / 1000, frames: out.frames });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  /**
   * The .jsx, plus a ProRes pass per 3D scene layer (AE imports them from the script's folder).
   * With passes, everything is written into a folder you pick; without folder access, each file downloads.
   */
  /** AE passes: beauty per layer + the chosen AOVs + the assembly script, into a folder you pick. */
  const exportAePasses = async () => {
    try {
      cancel.current = false;
      const pick = (window as unknown as { showDirectoryPicker?: (o?: object) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
      if (!pick) throw new Error("Pick-a-folder isn't available in this browser; use Chrome or Edge");
      const dir = await pick({ mode: "readwrite", id: "ae-passes" });
      await loadFonts();
      const doc = docStore.getState().doc;
      const started = performance.now();
      const save = async (name: string, blob: Blob) => {
        const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
        await w.write(blob);
        await w.close();
      };
      const plan = await exportPasses(doc, net.id, aov, save, (done, total) => setState({ kind: "busy", done, total, started }), () => cancel.current);
      if (!plan) return setState({ kind: "idle" });
      const script = `${net.name.replace(/[^\w.-]+/g, "_")}_passes.jsx`;
      await save(script, new Blob([passesScript(plan)], { type: "text/javascript" }));
      setState({ kind: "done", url: "", name: "", seconds: (performance.now() - started) / 1000, frames: plan.comp.frames, note: `Saved ${plan.outputs.length} passes and ${script} in “${dir.name}”. In AE: File › Scripts › Run Script File.` });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return setState({ kind: "idle" });
      setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const exportForAe = async () => {
    try {
      cancel.current = false;
      await loadFonts();
      const doc = docStore.getState().doc;
      const { jsx, plan } = exportAe(doc, net.id, canvasMeasure());
      const scriptName = `${net.name.replace(/[^\w.-]+/g, "_")}.jsx`;
      const layers = plan.comps.reduce((n, c) => n + c.layers.length, 0);
      const note = `${layers} layers in ${plan.comps.length} comps${plan.passes.length ? `, ${plan.passes.length} 3D pass${plan.passes.length > 1 ? "es" : ""}` : ""}. In AE: File › Scripts › Run Script File.`;
      const script = new Blob([jsx], { type: "text/javascript" });
      if (!plan.passes.length) return setState({ kind: "done", url: URL.createObjectURL(script), name: scriptName, seconds: 0, frames: 0, note });

      const pick = (window as unknown as { showDirectoryPicker?: (o?: object) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
      const dir = pick ? await pick({ mode: "readwrite", id: "ae-export" }) : undefined;
      const save = async (name: string, blob: Blob) => {
        if (dir) {
          const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
          await w.write(blob);
          await w.close();
        } else {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = name;
          a.click();
        }
      };
      const started = performance.now();
      for (const [i, p] of plan.passes.entries()) {
        const out = await renderToBlob(doc, p.network, { format: "prores", width: p.width, height: p.height, motionBlur: true, frames: p.frames }, (done, total) => setState({ kind: "busy", done: i * total + done, total: plan.passes.length * total, started }), () => cancel.current);
        if (!out) return setState({ kind: "idle" });
        await save(p.file, out.blob);
      }
      await save(scriptName, script);
      setState({ kind: "done", url: "", name: "", seconds: (performance.now() - started) / 1000, frames: 0, note: `${dir ? `Saved ${scriptName} and the passes in “${dir.name}”` : "Downloaded the script and passes; keep them in one folder"}. ${note}` });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return setState({ kind: "idle" });
      setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div role="dialog" aria-label="Render" className="absolute right-1 top-[52px] z-50 w-80 rounded-xl bg-card p-4 shadow-float">
      <div className="mb-3 flex items-center">
        <h2 className="font-display text-sm font-semibold">Render {net.name}</h2>
        <Button variant="ghost" size="icon" className="ml-auto size-6" aria-label="Close" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="grid gap-2 text-xs">
        <div className="grid grid-cols-[96px_1fr] items-center">
          <Label htmlFor="r-format">Format</Label>
          <select id="r-format" value={format} onChange={(e) => setFormat(e.target.value as "prores" | "mp4")} className="h-7 rounded-sm border border-border bg-muted px-1.5">
            <option value="prores">ProRes 4444 with alpha (.mov)</option>
            <option value="mp4" disabled={!mp4Supported()}>
              H.264 MP4 (no alpha)
            </option>
          </select>
        </div>
        <div className="grid grid-cols-[96px_1fr] items-center">
          <Label htmlFor="r-size">Size</Label>
          <select id="r-size" value={scale} onChange={(e) => setScale(+e.target.value)} className="h-7 rounded-sm border border-border bg-muted px-1.5">
            <option value={1}>
              Full · {comp.width}×{comp.height}
            </option>
            <option value={0.5}>Half · {Math.round(comp.width / 2)}×{Math.round(comp.height / 2)}</option>
          </select>
        </div>
        <div className="grid grid-cols-[96px_1fr] items-center">
          <Label>Motion blur</Label>
          <Switch aria-label="Render with motion blur" checked={blur && !!comp.motionBlur} disabled={!comp.motionBlur} onCheckedChange={setBlur} />
        </div>
        <p className="font-mono text-[11px] text-muted-foreground">
          {Math.round(comp.duration * comp.fps)} frames · {comp.fps} fps · {comp.duration}s
        </p>
      </div>

      <div className="mt-3">
        {state.kind === "busy" ? (
          <div className="grid gap-2">
            <div className="h-2 rounded-full bg-field">
              <div className="h-2 rounded-full bg-volt shadow-[inset_0_0_0_1.5px_var(--ink)]" style={{ width: `${(state.done / state.total) * 100}%` }} />
            </div>
            <div className="flex items-center font-mono text-[11px] text-muted-foreground">
              Frame {state.done} / {state.total}
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => (cancel.current = true)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : state.kind === "done" ? (
          <div className="grid gap-2">
            <p className="font-mono text-[11px] text-muted-foreground">
              {state.note ?? `${state.frames} frames in ${state.seconds.toFixed(1)}s`}
            </p>
            {state.url && (
              <Button asChild>
                <a href={state.url} download={state.name}>
                  Save {state.name}
                </a>
              </Button>
            )}
          </div>
        ) : (
          <>
            {state.kind === "error" && <p className="mb-2 font-mono text-[11px] text-destructive">Render failed: {state.message}</p>}
            <div className="mb-3 rounded-lg bg-field p-3">
              <p className="mb-2 text-[13px] font-semibold">After Effects passes</p>
              <p className="mb-2 text-[11px] text-muted-foreground">A ProRes beauty per layer, plus room to play in comp:</p>
              {(
                [
                  ["mattes", "Alpha mattes", "per layer and 3D object, what's covered cut out"],
                  ["puzzle", "Puzzle mattes", "three elements per file in R, G, B"],
                  ["depth", "Depth", "per 3D scene, ready for Camera Lens Blur"],
                ] as [keyof PassOptions, string, string][]
              ).map(([k, label, hint]) => (
                <label key={k} className="flex items-start gap-2 py-1 text-xs">
                  <input type="checkbox" checked={aov[k]} onChange={(e) => setAov({ ...aov, [k]: e.target.checked })} className="mt-0.5 accent-[var(--ink)]" />
                  <span>
                    {label} <span className="text-muted-foreground">· {hint}</span>
                  </span>
                </label>
              ))}
              <Button className="mt-2 w-full" onClick={exportAePasses} title="Pick a folder: the passes and an assembly script are written into it">
                Export AE passes
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mb-2 w-full"
              title="Frozen simple-2D option: rebuilds layers and keyframes natively in AE (no expressions)"
              onClick={exportForAe}
            >
              Native AE layers (simple 2D, .jsx)
            </Button>
            <Button variant="secondary" className="w-full" onClick={run}>
              <Clapperboard /> Render {format === "mp4" ? "MP4" : "ProRes 4444"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
