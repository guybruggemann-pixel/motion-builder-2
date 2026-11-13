/**
 * Camera pill in the viewer: for the 3D scene shown (or the first 3D scene layer in the shown
 * comp), pick an angle or set orbit / height / distance / lens. Edits the scene's Camera node
 * through `setValue` (keys at the playhead when keyed), one undo step per slider drag.
 */
import { useState } from "react";
import { Video } from "lucide-react";
import type { SceneDoc } from "@core/scene";
import { docStore, useDocStore, useUi } from "@/app/store";
import { setValue } from "@/app/inspector/edits";
import { vecAt } from "./manipulate";
import { CAMERA_ANGLES, orbitOf, positionOf, type Orbit, type V3 } from "./camOrbit";

type Net = SceneDoc["networks"][number];

/** The 3D network to aim: the shown one if it holds 3D objects, else the first 3D scene layer's. */
function sceneNet(doc: SceneDoc, net: Net, selected: string[]): Net | undefined {
  if (net.nodes.some((n) => n.type === "Camera" || n.type === "Text3D" || n.type === "Shape3D")) return net;
  const scenes = net.nodes.filter((n) => n.type === "Scene3D" && n.subnet);
  const s = scenes.find((n) => selected.includes(n.id)) ?? scenes[0];
  return s ? doc.networks.find((x) => x.id === s.subnet) : undefined;
}

export function CameraMenu({ net, t, tol }: { net: Net; t: number; tol: number }) {
  const doc = useDocStore((s) => s.doc);
  const selected = useUi((s) => s.selectedNodes);
  const [open, setOpen] = useState(false);
  const scene = sceneNet(doc, net, selected);
  if (!scene) return null;
  const cam = scene.nodes.find((n) => n.type === "Camera");

  const addCamera = () =>
    docStore.getState().edit("Add camera", (d) => {
      const s = d.networks.find((x) => x.id === scene.id)!;
      const id = `camera-${Math.random().toString(36).slice(2, 7)}`;
      s.nodes.push({ id, type: "Camera", name: "Camera", enabled: true, params: { position: { value: [0, 0, 2666.67] }, target: { value: [0, 0, 0] }, lens: { value: 50 } }, ui: { x: -240, y: 340 } } as never);
      const out = s.nodes.find((n) => n.id === s.output);
      if (out?.type === "Merge") s.wires.push({ from: { node: id, port: "out" }, to: { node: out.id, port: "in" } });
    });

  const pos = cam ? (vecAt(doc, scene.id, cam.id, "position", t, 3, NaN) as V3) : ([0, 0, 2666.67] as V3);
  const position: V3 = pos.some((x) => Number.isNaN(x)) ? [0, 0, 2666.67] : pos;
  const tg = cam ? (vecAt(doc, scene.id, cam.id, "target", t, 3, 0) as V3) : ([0, 0, 0] as V3);
  const lens = cam ? (vecAt(doc, scene.id, cam.id, "lens", t, 1, 50)[0] ?? 50) : 50;
  const orbit = orbitOf(position, tg);

  const setOrbit = (o: Partial<Orbit>, final: boolean) => {
    if (!cam) return;
    const next = positionOf({ ...orbit, ...o }, tg);
    docStore.getState().edit("Camera angle", (d) => setValue(d, scene.id, cam.id, "position", next as never, t, tol), { coalesce: "camera-menu" });
    if (final) docStore.getState().commit();
  };
  const setLens = (v: number, final: boolean) => {
    if (!cam) return;
    docStore.getState().edit("Camera lens", (d) => setValue(d, scene.id, cam.id, "lens", v as never, t, tol), { coalesce: "camera-menu" });
    if (final) docStore.getState().commit();
  };

  const slider = (label: string, v: number, min: number, max: number, on: (v: number, final: boolean) => void, unit = "°") => (
    <label className="grid grid-cols-[64px_1fr_48px] items-center gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <input type="range" aria-label={label} min={min} max={max} step={1} value={Math.round(v)} onChange={(e) => on(+e.target.value, false)} onPointerUp={(e) => on(+(e.target as HTMLInputElement).value, true)} onKeyUp={(e) => on(+(e.target as HTMLInputElement).value, true)} />
      <span className="text-right tabular-nums">{Math.round(v)}{unit}</span>
    </label>
  );

  return (
    <div className="relative">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex h-[30px] items-center gap-1.5 rounded-full bg-card px-3 text-xs shadow-card [&_svg]:size-[14px]">
        <Video /> Camera
      </button>
      {open && (
        <div role="dialog" aria-label="Camera" className="absolute left-0 top-9 z-20 w-[300px] space-y-3 rounded-xl bg-card p-3 shadow-card">
          {!cam ? (
            <div className="space-y-2 text-xs">
              <p className="text-muted-foreground">This scene uses the default front camera.</p>
              <button type="button" onClick={addCamera} className="rounded-full bg-ink px-3 py-1.5 text-ink-foreground">Add a camera</button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-1">
                {CAMERA_ANGLES.map((a) => (
                  <button key={a.label} type="button" onClick={() => setOrbit({ azimuth: a.azimuth, elevation: a.elevation }, true)} className="rounded-full bg-field px-2.5 py-1 text-xs hover:bg-line">
                    {a.label}
                  </button>
                ))}
              </div>
              {slider("Orbit", orbit.azimuth, -180, 180, (v, f) => setOrbit({ azimuth: v }, f))}
              {slider("Height", orbit.elevation, -89, 89, (v, f) => setOrbit({ elevation: v }, f))}
              {slider("Distance", orbit.distance, 200, 12000, (v, f) => setOrbit({ distance: v }, f), "")}
              {slider("Lens", lens, 10, 200, setLens, "mm")}
              <p className="text-[11px] text-muted-foreground">Turns round the camera's target. If the camera is keyed, this sets a key at the playhead.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
