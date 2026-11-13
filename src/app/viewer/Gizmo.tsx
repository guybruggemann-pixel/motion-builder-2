/**
 * Transform gizmo on the selected object: X / Y (/ Z in 3D) handles at the centre of what it draws.
 * Move tool: drag an arrow to move along that axis. Turn tool: drag a ring to turn around it.
 * 3D axes are the scene's world axes as the camera sees them; 2D axes are the comp's x and y.
 * Every drag is one undo step and keys like the inspector.
 */
import { CATALOG, isNodeType, mul, type Drawable, type Mat, type Network, type Node, type ParamSpec, type Scene3DDrawable } from "@core/scene";
import { axes3D } from "@/app/render/three/install";
import { boxOf, ownerIn } from "@/app/render/bounds";
import type { MeasureText } from "@core/scene";
import { docStore, useDocStore, useUi, viewComp } from "@/app/store";
import { setValue } from "@/app/inspector/edits";
import { turnTarget, type TurnTarget } from "./turn3d";
import { along, nudged, turnAround, vecAt } from "./manipulate";

/** Screen length of a drawn axis, px. */
const ARM = 72;
const AXIS = ["x", "y", "z"] as const;

export interface Handles {
  /** What the handles edit: a 3D object (position/rotation are vec3) or a 2D layer (vec2 / number). */
  target: TurnTarget;
  dims: 2 | 3;
  origin: [number, number];
  /** Per axis: screen px covered by `unit` world units. */
  axes: [number, number][];
  unit: number;
}

/** The scene drawable a 3D target is drawn in: the shown 3D network's, or the selected scene layer's. */
export function sceneDrawableFor(drawables: readonly Drawable[], net: Network, node: Node): Scene3DDrawable | undefined {
  const d = drawables.find((x) => x.kind === "scene3d" && (node.type === "Scene3D" ? x.node === node.id && x.network === net.id : x.subnet === net.id));
  return d?.kind === "scene3d" ? d : undefined;
}

/** Where the selected node's handles go on screen, or undefined if it has none. */
export function handlesFor(doc: Parameters<typeof turnTarget>[0], net: Network, node: Node, t: number, drawables: readonly Drawable[], view: Mat, k: number, tool: "move" | "turn" = "move", measure?: MeasureText): Handles | undefined {
  // a whole 3D scene layer moves in the comp (2D handles); it turns its object in 3D
  const t3 = node.type === "Scene3D" && tool === "move" ? undefined : turnTarget(doc, net, node, t);
  if (t3) {
    const sd = sceneDrawableFor(drawables, net, node);
    const ax = sd && axes3D(sd.scene, t3.node);
    if (!sd || !ax) return undefined;
    const m = mul(view, sd.matrix);
    const [w, h] = sd.size;
    const pt = ([u, v]: [number, number]): [number, number] => [m[0] * u * w + m[2] * v * h + m[4], m[1] * u * w + m[3] * v * h + m[5]];
    const o = pt(ax.origin);
    return { target: t3, dims: 3, origin: o, axes: ax.ends.map((e) => { const p = pt(e); return [p[0] - o[0], p[1] - o[1]] as [number, number]; }), unit: ax.unit };
  }
  const params = isNodeType(node.type) ? (CATALOG[node.type].params as Record<string, ParamSpec>) : {};
  if (!params.position || params.position.kind !== "vec2") return undefined;
  const pos = vecAt(doc, net.id, node.id, "position", t, 2);
  // handles sit in the centre of what the layer draws (an anchor point control can come later)
  const box = measure ? boxOf(drawables.filter((d) => ownerIn(net.id, d) === node.id), view, measure) : undefined;
  const o: [number, number] = box ? [box.x + box.w / 2, box.y + box.h / 2] : [view[0] * pos[0]! + view[4], view[3] * pos[1]! + view[5]];
  return { target: { net: net.id, node: node.id, name: node.name, t }, dims: 2, origin: o, axes: [[100 * k, 0], [0, 100 * k]], unit: 100 };
}

export function Gizmo({ handles }: { handles: Handles }) {
  const tool = useUi((s) => s.tool);
  const playing = useUi((s) => s.playing);
  const fps = viewComp(useDocStore((s) => s.doc), useUi((s) => s.path)).fps;
  if (playing) return null;
  const { origin: [ox, oy], target } = handles;

  const drag = (e: React.PointerEvent, i: number) => {
    e.preventDefault();
    e.stopPropagation();
    const doc = docStore.getState().doc;
    const param = tool === "move" ? "position" : "rotation";
    const dims = handles.dims;
    const turn2D = tool === "turn" && dims === 2;
    const start = vecAt(doc, target.net, target.node, turn2D ? "rotation" : param, target.t, turn2D ? 1 : dims);
    const x0 = e.clientX, y0 = e.clientY, key = `gizmo-${target.node}-${param}-${x0}-${y0}`, tol = 0.5 / fps;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0, dy = ev.clientY - y0;
      moved = true;
      const axis = handles.axes[i]!;
      const value =
        tool === "move" ? nudged(start, i, along(dx, dy, axis, handles.unit)) : turn2D ? Math.round(((start[0] ?? 0) + turnAround(dx, dy, [0, 0])) * 100) / 100 : nudged(start, i, turnAround(dx, dy, axis));
      docStore.getState().edit(`${tool === "move" ? "Move" : "Turn"} ${target.name}`, (d) => setValue(d, target.net, target.node, turn2D ? "rotation" : param, value as never, target.t, tol), { coalesce: key });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (moved) docStore.getState().commit();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const axes = handles.axes.slice(0, tool === "turn" && handles.dims === 2 ? 1 : handles.dims);
  return (
    <svg className="pointer-events-none absolute inset-0 z-10 size-full overflow-visible" aria-label={`${target.name} ${tool === "move" ? "move" : "turn"} handles`}>
      {axes.map(([ax, ay], i) => {
        const len = Math.hypot(ax, ay);
        const flat = handles.dims === 3 && len < 4; // pointing at the camera
        const [ux, uy] = flat ? [0.7, -0.7] : [ax / len, ay / len];
        const arm = flat ? ARM * 0.35 : ARM;
        const [tx, ty] = [ox + ux * arm, oy + uy * arm];
        const name = tool === "turn" && handles.dims === 2 ? "rotation" : AXIS[i]!;
        const color = tool === "turn" && handles.dims === 2 ? "var(--axis-z)" : `var(--axis-${AXIS[i]})`;
        return (
          <g key={i} className="pointer-events-auto cursor-grab" onPointerDown={(e) => drag(e, i)} role="button" aria-label={`${tool === "move" ? "Move along" : "Turn around"} ${name.toUpperCase()}`}>
            <line x1={ox} y1={oy} x2={tx} y2={ty} stroke="transparent" strokeWidth={16} />
            <line x1={ox} y1={oy} x2={tx} y2={ty} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
            {tool === "move" ? (
              <polygon points={`${tx + ux * 10},${ty + uy * 10} ${tx - uy * 6},${ty + ux * 6} ${tx + uy * 6},${ty - ux * 6}`} fill={color} />
            ) : (
              <circle cx={tx} cy={ty} r={8} fill="var(--card)" stroke={color} strokeWidth={2.5} />
            )}
            <text x={tx + ux * 18} y={ty + uy * 18 + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={color}>
              {name === "rotation" ? "R" : name.toUpperCase()}
            </text>
          </g>
        );
      })}
      <circle cx={ox} cy={oy} r={4} fill="var(--volt)" stroke="var(--ink)" strokeWidth={1.5} />
    </svg>
  );
}
