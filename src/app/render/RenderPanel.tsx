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
import { exportAe } from "@/export/exportAe";

type State =
  | { kind: "idle" }
  | { kind: "busy"; done: number; total: number; started: number }
  | { kind: "done"; url: string; name: string; seconds: number; frames: number; note?: string }
  | { kind: "error"; message: string };

export function RenderPanel({ onClose }: { onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [format, setFormat] = useState<"prores" | "mp4">("prores");
  const [blur, setBlur] = useState(true);
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
            <Button asChild>
              <a href={state.url} download={state.name}>
                Save {state.name}
              </a>
            </Button>
          </div>
        ) : (
          <>
            {state.kind === "error" && <p className="mb-2 font-mono text-[11px] text-destructive">Render failed: {state.message}</p>}
            <Button
              variant="secondary"
              className="mb-2 w-full"
              title="A script for File > Scripts > Run Script File in After Effects: native layers and keyframes, no expressions"
              onClick={async () => {
                try {
                  await loadFonts();
                  const { jsx, plan } = exportAe(docStore.getState().doc, net.id, canvasMeasure());
                  const url = URL.createObjectURL(new Blob([jsx], { type: "text/javascript" }));
                  setState({
                    kind: "done",
                    url,
                    name: `${net.name.replace(/[^\w.-]+/g, "_")}.jsx`,
                    seconds: 0,
                    frames: 0,
                    note: `${plan.comps.reduce((n, c) => n + c.layers.length, 0)} layers in ${plan.comps.length} comps. In AE: File › Scripts › Run Script File.`,
                  });
                } catch (e) {
                  setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
                }
              }}
            >
              Export for After Effects (.jsx)
            </Button>
            <Button className="w-full" onClick={run}>
              <Clapperboard /> Render {format === "mp4" ? "MP4" : "ProRes 4444"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
