/**
 * Deformers: bend, twist and wave the shape of 3D objects (Cinema 4D style), as pure maths on
 * scene-space points. They act after the object's matrix and its clones, so one wave runs smoothly
 * through every clone and letter. The axis is a direction in the xy plane (`angle`, degrees).
 */
export interface DeformSpec {
  mode: "wave" | "twist" | "bend";
  /** Centre of the effect, scene px. */
  position: [number, number, number];
  /** Axis direction in the xy plane, degrees (0 = +x). */
  angle: number;
  /** Wave: px of displacement. Twist: degrees per wavelength. Bend: degrees over one wavelength. */
  amount: number;
  /** px. */
  wavelength: number;
  /** Radians, already including time. */
  phase: number;
  /** Wave: move across the axis in the xy plane ("side") or towards the camera ("depth"). */
  displace: "side" | "depth";
  strength: number;
}

/** A point after one deformer. */
export function deformPoint(d: DeformSpec, p: readonly [number, number, number]): [number, number, number] {
  const a = (d.angle * Math.PI) / 180;
  const [cx, cy] = [Math.cos(a), Math.sin(a)];
  const [x, y, z] = [p[0] - d.position[0], p[1] - d.position[1], p[2] - d.position[2]];
  // along the axis (u) and across it (v), in the xy plane
  let u = x * cx + y * cy, v = -x * cy + y * cx, w = z;
  const L = Math.max(1, d.wavelength), s = d.strength;
  if (d.mode === "wave") {
    const off = d.amount * s * Math.sin((2 * Math.PI * u) / L + d.phase);
    if (d.displace === "depth") w += off;
    else v += off;
  } else if (d.mode === "twist") {
    const t = ((d.amount * s * Math.PI) / 180) * (u / L) + d.phase;
    const [c, si] = [Math.cos(t), Math.sin(t)];
    [v, w] = [v * c - w * si, v * si + w * c];
  } else {
    const total = (d.amount * s * Math.PI) / 180;
    if (Math.abs(total) > 1e-6) {
      const R = L / total, th = u / R, r = R - v;
      [u, v] = [r * Math.sin(th), R - r * Math.cos(th)];
    }
  }
  return [u * cx - v * cy + d.position[0], u * cy + v * cx + d.position[1], w + d.position[2]];
}

/** Phase of a time-driven wave: `speed` cycles per second (rounded to whole cycles over `span` when looping), plus `offset` degrees. */
export function wavePhase(speed: number, t: number, span: number, loop: boolean, offset = 0): number {
  const cyc = loop && span > 0 ? Math.round(speed * span) / span : speed;
  return -2 * Math.PI * cyc * t + (offset * Math.PI) / 180;
}
