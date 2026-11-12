/**
 * Canvas viewer: fits the comp onto the stage, draws the current frame (with preview motion
 * blur), a checkerboard where the comp is transparent, and broadcast safe areas on top.
 * View pills (zoom, format, safe areas, blur, transparency) and the transport float over it.
 * All pixels come from `evaluateFrame` via the frame cache; the viewer adds no scene state.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Grid2x2, ScanLine, Wind } from "lucide-react";
import { cn } from "@/design-system/motionbuilder---brandbook-c4b4eb/lib/utils";
import { Transport } from "./Transport";
import { FrameCache, type Mat, type MeasureText } from "@core/scene";
import { hitTestAll, ownerIn } from "@/render/bounds";
import { pick3D } from "@/render/three/install";
import { docStore } from "@/store";
import { setValue } from "@/inspector/edits";
import { rotationAt, turned, turnTarget } from "./turn3d";
import { Gizmo, handlesFor, sceneDrawableFor } from "./Gizmo";
import { FieldOverlay } from "./FieldOverlay";
import { plus, vecAt } from "./manipulate";
import { planeDelta3D } from "@/render/three/install";
import { applyDropped, SOLID_MIME } from "@/panels/materials";
import { openSubnet } from "@/store/navigation";
import { SelectionOverlay } from "./Selection";
import { canvasMeasure, drawCompFrame, setImageListener } from "@/render/canvas2d";
import { loadFonts } from "@/render/fonts";
import { shownNetwork, useDocStore, useUi, viewComp } from "@/store";

/** SMPTE ST 2046-1: action safe 93 %, title safe 90 %. */
const SAFE = { action: 0.93, title: 0.9 };
/** CSS px around the comp: room for the pills on top and the transport below. */
const PAD = { x: 24, top: 56, bottom: 70 };
const CORNER = 10;

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function drawChecker(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cell: number) {
  ctx.fillStyle = cssVar("--card");
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = cssVar("--line2");
  for (let j = 0; j * cell < h; j++)
    for (let i = (j % 2); i * cell < w; i += 2) ctx.fillRect(x + i * cell, y + j * cell, Math.min(cell, w - i * cell), Math.min(cell, h - j * cell));
}

function drawSafeAreas(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, dpr: number) {
  ctx.save();
  ctx.strokeStyle = cssVar("--muted") || "#999";
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = dpr;
  for (const f of [SAFE.action, SAFE.title]) {
    const iw = w * f, ih = h * f;
    ctx.strokeRect(Math.round(x + (w - iw) / 2) + 0.5, Math.round(y + (h - ih) / 2) + 0.5, Math.round(iw), Math.round(ih));
  }
  const cx = x + w / 2, cy = y + h / 2, arm = 10 * dpr;
  ctx.beginPath();
  ctx.moveTo(cx - arm, cy);
  ctx.lineTo(cx + arm, cy);
  ctx.moveTo(cx, cy - arm);
  ctx.lineTo(cx, cy + arm);
  ctx.stroke();
  ctx.restore();
}

export function Viewer() {
  const doc = useDocStore((s) => s.doc);
  const { path, frame, safeAreas, motionBlur, transparency, theme, toggle } = useUi();
  const net = shownNetwork(doc, path);
  const comp = viewComp(doc, path);

  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0, dpr: 1 });
  const [cache, setCache] = useState<FrameCache>();
  const [measure, setMeasure] = useState<MeasureText>();
  const [imageTick, setImageTick] = useState(0);
  const scratch = useMemo(
    () => ({ sample: new OffscreenCanvas(1, 1).getContext("2d")!, accum: new OffscreenCanvas(1, 1).getContext("2d")! }),
    [],
  );

  // Measure text only once the real fonts are in, or layouts would use fallback metrics.
  useEffect(() => {
    let alive = true;
    loadFonts().then(() => {
      if (!alive) return;
      const m = canvasMeasure();
      setMeasure(() => m);
      setCache(new FrameCache({ measure: m }));
    });
    setImageListener(() => setImageTick((n) => n + 1)); // drawables don't change, only pixels
    return () => {
      alive = false;
      setImageListener(undefined);
    };
  }, []);

  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(([e]) => {
      const r = e!.contentRect;
      setSize({ w: r.width, h: r.height, dpr: Math.min(window.devicePixelRatio || 1, 2) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Where the comp sits, in CSS px: scale and top-left. Shared by drawing, hit testing and overlays. */
  const layout = useMemo(() => {
    const k = Math.min((size.w - 2 * PAD.x) / comp.width, (size.h - PAD.top - PAD.bottom) / comp.height);
    if (!(k > 0)) return undefined;
    const ox = Math.round(((size.w - comp.width * k) / 2) * size.dpr) / size.dpr;
    const oy = Math.round((PAD.top + (size.h - PAD.top - PAD.bottom - comp.height * k) / 2) * size.dpr) / size.dpr;
    return { k, ox, oy, view: [k, 0, 0, k, ox, oy] as Mat };
  }, [size, comp.width, comp.height]);

  /** The shown network's drawables now (flattened subnets), for selection and hit testing. */
  const drawables = useMemo(() => (cache ? cache.frame(doc, net.id, Math.min(frame, Math.round(comp.duration * comp.fps) - 1)) : []), [cache, doc, net.id, frame, comp]);

  /**
   * The node under the pointer in the shown network. In a 3D scene the hit must land on an object
   * (empty space falls through to what's below); inside a 3D network it's the object itself.
   */
  const pick = (e: React.MouseEvent) => {
    if (!layout || !measure) return undefined;
    const r = wrap.current!.getBoundingClientRect();
    for (const { d, lx, ly } of hitTestAll(drawables, layout.view, measure, e.clientX - r.left, e.clientY - r.top)) {
      if (d.kind === "scene3d") {
        const obj = pick3D(d.scene, lx / d.size[0], ly / d.size[1]);
        if (!obj) continue;
        if (net.id === d.subnet) {
          // a cloned object is picked as its Cloner: the copies move as one (Shift+click for the object)
          const cl = net.wires.find((w) => w.from.node === obj && w.to.port === "in" && net.nodes.find((n) => n.id === w.to.node && n.type === "Cloner" && n.enabled));
          return net.nodes.find((n) => n.id === (cl ? cl.to.node : obj));
        }
      }
      const n = net.nodes.find((x) => x.id === ownerIn(net.id, d));
      if (n) return n;
    }
    return undefined;
  };

  /**
   * Shift+click: select the part under the pointer, not the whole thing. A precomp (Subnet) opens
   * with the layer you hit selected; a 3D scene opens with the object you hit selected.
   */
  const selectPart = (e: React.MouseEvent) => {
    if (!layout || !measure) return;
    const r = wrap.current!.getBoundingClientRect();
    for (const { d, lx, ly } of hitTestAll(drawables, layout.view, measure, e.clientX - r.left, e.clientY - r.top)) {
      const owner = net.nodes.find((x) => x.id === ownerIn(net.id, d));
      if (d.kind === "scene3d") {
        const obj = pick3D(d.scene, lx / d.size[0], ly / d.size[1]);
        if (!obj) continue;
        if (net.id === d.subnet) return useUi.getState().selectNodes([obj]);
        if (owner?.type === "Scene3D") {
          openSubnet(owner);
          return useUi.getState().selectNodes([obj]);
        }
        continue;
      }
      if (owner?.type === "Subnet" && d.instance.length) {
        const inner = d.instance[1] ?? d.node; // the layer one level inside the precomp
        openSubnet(owner);
        return useUi.getState().selectNodes([inner]);
      }
      if (owner) return useUi.getState().selectNodes([owner.id]);
    }
    useUi.getState().selectNodes([]);
  };

  const selected = useUi((s) => s.selectedNodes[0]);
  const tool = useUi((s) => s.tool);
  const selNode = net.nodes.find((n) => n.id === selected);
  const handles = layout && selNode && cache ? handlesFor(doc, net, selNode, frame / comp.fps, drawables, layout.view, layout.k, tool) : undefined;
  void tool; // re-render the handles when the tool changes

  /**
   * Drag a selected object: the Move tool moves it (2D: in the comp; 3D: parallel to the screen),
   * the Turn tool turns it (3D). One undo step per drag.
   */
  const dragged = useRef(false);
  const turnStart = (e: React.PointerEvent) => {
    dragged.current = false;
    if (e.button !== 0 || e.shiftKey) return;
    const n = pick(e);
    const ui = useUi.getState();
    if (!n || !ui.selectedNodes.includes(n.id) || !layout) return;
    const doc0 = docStore.getState().doc;
    const t = ui.frame / comp.fps;
    const tol = 0.5 / comp.fps;
    const target = turnTarget(doc0, net, n, t);
    const sd = target && sceneDrawableFor(drawables, net, n);
    let apply: (dx: number, dy: number, ev: PointerEvent) => void;
    if (ui.tool === "turn") {
      if (!target) return;
      const start = rotationAt(doc0, target);
      apply = (dx, dy, ev) => docStore.getState().edit(`Turn ${target.name}`, (d) => setValue(d, target.net, target.node, "rotation", turned(start, dx, dy, ev.shiftKey), target.t, tol), { coalesce: key });
    } else if (target && sd && n.type !== "Scene3D") {
      const start = vecAt(doc0, target.net, target.node, "position", target.t, 3);
      const [w, h] = [sd.size[0] * layout.k * Math.hypot(sd.matrix[0], sd.matrix[1]), sd.size[1] * layout.k * Math.hypot(sd.matrix[2], sd.matrix[3])];
      const scene0 = sd.scene;
      apply = (dx, dy) => {
        const delta = planeDelta3D(scene0, target.node, dx / w, dy / h);
        if (delta) docStore.getState().edit(`Move ${target.name}`, (d) => setValue(d, target.net, target.node, "position", plus(start, delta) as never, target.t, tol), { coalesce: key });
      };
    } else if ((!target || n.type === "Scene3D") && n.params) {
      // a 2D layer, or a whole 3D scene layer: moves in the comp
      const start = vecAt(doc0, net.id, n.id, "position", t, 2);
      apply = (dx, dy) => docStore.getState().edit(`Move ${n.name}`, (d) => setValue(d, net.id, n.id, "position", plus(start, [dx / layout.k, dy / layout.k]) as never, t, tol), { coalesce: key });
    } else return;
    e.preventDefault();
    const x0 = e.clientX, y0 = e.clientY, key = `drag-${n.id}-${x0}-${y0}`;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0, dy = ev.clientY - y0;
      if (!dragged.current && Math.hypot(dx, dy) < 3) return;
      dragged.current = true;
      apply(dx, dy, ev);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      if (dragged.current) docStore.getState().commit();
    };
    document.body.style.cursor = "grabbing";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !size.w || !size.h || !layout) return;
    const W = Math.round(size.w * size.dpr), H = Math.round(size.h * size.dpr);
    if (cv.width !== W || cv.height !== H) {
      cv.width = W;
      cv.height = H;
    }
    for (const s of [scratch.sample, scratch.accum])
      if (s.canvas.width !== W || s.canvas.height !== H) {
        s.canvas.width = W;
        s.canvas.height = H;
      }
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const d = size.dpr;
    const k = layout.k * d;
    const cw = comp.width * k, ch = comp.height * k;
    const ox = Math.round(layout.ox * d), oy = Math.round(layout.oy * d);
    const view: Mat = [k, 0, 0, k, ox, oy];

    // the comp frame sits on the stage with a soft shadow and rounded corners (view only)
    ctx.save();
    ctx.shadowColor = theme === "dark" ? "rgba(0,0,0,0.5)" : "rgba(16,17,20,0.18)";
    ctx.shadowBlur = 40 * d;
    ctx.shadowOffsetY = 12 * d;
    ctx.fillStyle = cssVar("--card");
    ctx.beginPath();
    ctx.roundRect(ox, oy, cw, ch, CORNER * d);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(ox, oy, cw, ch, CORNER * d);
    ctx.clip();

    if (comp.background && !transparency) {
      const bg = comp.background.startsWith("brand:")
        ? doc.brand?.colors.find((c) => c.token === comp.background!.slice(6))?.value ?? "#000000"
        : comp.background;
      ctx.fillStyle = bg;
      ctx.fillRect(ox, oy, cw, ch);
    } else drawChecker(ctx, ox, oy, cw, ch, 12 * size.dpr);

    if (cache) drawCompFrame(ctx, scratch, cache, doc, net.id, frame, view, motionBlur ? comp.motionBlur : undefined);
    ctx.restore();
    if (safeAreas) drawSafeAreas(ctx, ox, oy, cw, ch, size.dpr);
  }, [doc, net.id, comp, frame, size, layout, cache, safeAreas, motionBlur, transparency, theme, scratch, imageTick]);

  const pill = "flex h-[30px] items-center rounded-full bg-card px-3 text-xs shadow-card";
  const opt = (on: boolean) =>
    cn("grid h-[26px] w-[30px] place-items-center rounded-full transition-colors [&_svg]:size-[15px]", on ? "bg-field text-foreground" : "text-muted-foreground hover:text-foreground");
  return (
    <div ref={wrap} className="relative min-h-0 flex-1">
      <canvas
        ref={canvas}
        className="absolute inset-0 size-full"
        role="img"
        aria-label={`${net.name}, frame ${frame}. Click a layer to select it.`}
        onPointerDown={turnStart}
        onClick={(e) => {
          if (dragged.current) return void (dragged.current = false); // that was a drag, not a click
          if (e.shiftKey) return void selectPart(e);
          useUi.getState().selectNodes(((n) => (n ? [n.id] : []))(pick(e)));
        }}
        onDoubleClick={(e) => {
          const n = pick(e);
          if (n?.subnet) openSubnet(n);
        }}
        onDragOver={(e) => e.dataTransfer.types.includes(SOLID_MIME) && e.preventDefault()}
        onDrop={(e) => {
          const n = pick(e);
          if (n && applyDropped(n.id, e.dataTransfer.getData(SOLID_MIME))) useUi.getState().selectNodes([n.id]);
        }}
      />
      {layout && measure && <SelectionOverlay net={net} drawables={drawables} view={layout.view} measure={measure} bounds={size} />}
      {handles && <Gizmo handles={handles} />}
      {layout && selNode && (selNode.type === "SphericalField" || selNode.type === "LinearField") && <FieldOverlay doc={doc} net={net} node={selNode} t={frame / comp.fps} drawables={drawables} view={layout.view} />}
      {!cache && <p className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">Loading fonts</p>}

      <div className="absolute left-3 top-3 flex gap-1.5">
        <span className={cn(pill, "font-medium")} title="Zoom: the comp fits the viewer">
          Fit
        </span>
        <span className={cn(pill, "text-muted-foreground")}>
          {comp.width}×{comp.height} · {comp.fps} fps
        </span>
      </div>
      <div role="group" aria-label="View options" className="absolute right-3 top-3 flex gap-0.5 rounded-full bg-card p-[3px] shadow-card">
        <button type="button" aria-label="Safe areas" title="Safe areas" aria-pressed={safeAreas} onClick={() => toggle("safeAreas")} className={opt(safeAreas)}>
          <ScanLine />
        </button>
        <button type="button" aria-label="Preview motion blur" title="Preview motion blur" aria-pressed={motionBlur} onClick={() => toggle("motionBlur")} className={opt(motionBlur)}>
          <Wind />
        </button>
        <button type="button" aria-label="Transparency grid" title="Show transparency (hides the comp background)" aria-pressed={transparency} onClick={() => toggle("transparency")} className={opt(transparency)}>
          <Grid2x2 />
        </button>
      </div>
      <Transport />
    </div>
  );
}
