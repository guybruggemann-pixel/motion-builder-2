/** Camera orbit maths for the viewer's camera menu: position ↔ (orbit, height, distance) round the target. Pure. */
export type V3 = [number, number, number];
export interface Orbit { azimuth: number; elevation: number; distance: number }
const R = Math.PI / 180;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function orbitOf(position: V3, target: V3): Orbit {
  const [dx, dy, dz] = [position[0] - target[0], position[1] - target[1], position[2] - target[2]];
  const distance = Math.hypot(dx, dy, dz) || 1;
  return { azimuth: r2(Math.atan2(dx, dz) / R), elevation: r2(Math.asin(Math.max(-1, Math.min(1, dy / distance))) / R), distance: r2(distance) };
}

export function positionOf(o: Orbit, target: V3): V3 {
  const el = Math.max(-89, Math.min(89, o.elevation)) * R, az = o.azimuth * R;
  return [r2(target[0] + Math.sin(az) * Math.cos(el) * o.distance), r2(target[1] + Math.sin(el) * o.distance), r2(target[2] + Math.cos(az) * Math.cos(el) * o.distance)];
}

/** One-click angles (distance kept). */
export const CAMERA_ANGLES: { label: string; azimuth: number; elevation: number }[] = [
  { label: "Front", azimuth: 0, elevation: 0 },
  { label: "¾ left", azimuth: -35, elevation: 18 },
  { label: "¾ right", azimuth: 35, elevation: 18 },
  { label: "Corner", azimuth: -45, elevation: 25 },
  { label: "High", azimuth: 0, elevation: 50 },
  { label: "Low", azimuth: -20, elevation: -15 },
];
