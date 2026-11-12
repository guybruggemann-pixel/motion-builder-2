/**
 * Shows the selected field in the viewer: a spherical field as its outer and inner (full weight)
 * radius, a linear field as its ramp from 0 % to 100 %. In 3D through the scene's camera; in 2D in
 * the network's px (y down). A noise field has no shape; it says so.
 */
import { mul, type Drawable, type Mat, type Network, type Node, type SceneDoc } from "@core/scene";
import { project3D } from "@/render/three/install";
import { vecAt } from "./manipulate";

const AXIS: Record<string, [number, number, number]> = { x: [1, 0, 0], "-x": [-1, 0, 0], y: [0, 1, 0], "-y": [0, -1, 0], z: [0, 0, 1], "-z": [0, 0, -1] };

export function FieldOverlay({ doc, net, node, t, drawables, view }: { doc: SceneDoc; net: Network; node: Node; t: number; drawables: readonly Drawable[]; view: Mat }) {
  const num = (k: string, d: number) => vecAt(doc, net.id, node.id, k, t, 1, d)[0]!;
  const pos = vecAt(doc, net.id, node.id, "position", t, 3) as [number, number, number];
  const sd = drawables.find((x) => x.kind === "scene3d" && x.subnet === net.id);
  // world point -> viewer px
  const toPx = (pts: [number, number, number][]): [number, number][] | undefined => {
    if (sd?.kind === "scene3d") {
      const uv = project3D(sd.scene, pts);
      if (!uv) return undefined;
      const m = mul(view, sd.matrix);
      const [w, h] = sd.size;
      return uv.map(([u, v]) => [m[0] * u * w + m[2] * v * h + m[4], m[1] * u * w + m[3] * v * h + m[5]]);
    }
    return pts.map(([x, y]) => [view[0] * x + view[4], view[3] * y + view[5]]);
  };
  const label = (x: number, y: number, text: string) => (
    <text x={x + 8} y={y - 8} fontSize={11} fontWeight={600} fill="var(--ink)" stroke="var(--card)" strokeWidth={3} paintOrder="stroke">
      {text}
    </text>
  );

  let body: React.ReactNode = null;
  if (node.type === "SphericalField") {
    const r = num("radius", 400), inner = r * (1 - Math.min(1, Math.max(0, num("falloff", 0.5))));
    const p = toPx([pos, [pos[0] + r, pos[1], pos[2]], [pos[0] + inner, pos[1], pos[2]]]);
    if (p) {
      const [c, e, i] = p as [[number, number], [number, number], [number, number]];
      const R = Math.hypot(e[0] - c[0], e[1] - c[1]), Ri = Math.hypot(i[0] - c[0], i[1] - c[1]);
      body = (
        <>
          {/* volt over ink, like the selection outline: readable on any background */}
          <circle cx={c[0]} cy={c[1]} r={R} fill="none" stroke="var(--ink)" strokeWidth={3.5} strokeDasharray="6 5" />
          <circle cx={c[0]} cy={c[1]} r={R} fill="none" stroke="var(--volt)" strokeWidth={1.5} strokeDasharray="6 5" />
          <circle cx={c[0]} cy={c[1]} r={Ri} fill="color-mix(in srgb, var(--volt) 14%, transparent)" stroke="var(--ink)" strokeWidth={3.5} />
          <circle cx={c[0]} cy={c[1]} r={Ri} fill="none" stroke="var(--volt)" strokeWidth={1.5} />
          {label(c[0] + R * 0.7, c[1] - R * 0.7, `${node.name} · full inside, fades to the dashed edge`)}
        </>
      );
    }
  } else if (node.type === "LinearField") {
    const dir = AXIS[String(node.params.direction?.value ?? "x")] ?? AXIS.x!;
    const half = num("length", 600) / 2;
    const p = toPx([pos.map((v, i) => v - dir[i]! * half) as [number, number, number], pos.map((v, i) => v + dir[i]! * half) as [number, number, number]]);
    if (p) {
      const [a, b] = p as [[number, number], [number, number]];
      body = (
        <>
          <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="var(--ink)" strokeWidth={4} strokeDasharray="6 5" />
          <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="var(--volt)" strokeWidth={2} strokeDasharray="6 5" />
          <circle cx={a[0]} cy={a[1]} r={5} fill="var(--card)" stroke="var(--ink)" strokeWidth={2} />
          <circle cx={b[0]} cy={b[1]} r={5} fill="var(--volt)" stroke="var(--ink)" strokeWidth={2} />
          {label(a[0], a[1], node.params.invert?.value ? "100 %" : "0 %")}
          {label(b[0], b[1], node.params.invert?.value ? "0 %" : "100 %")}
        </>
      );
    }
  }
  return (
    <svg className="pointer-events-none absolute inset-0 z-10 size-full overflow-visible" aria-label={`${node.name} shape`}>
      {body}
    </svg>
  );
}
