import { CATALOG, isNodeType, type ParamSpec, type SceneDoc } from "@core/scene";

/** Stable layer ids and resting values let prompts target the actual design, not a generic role. */
export function designMotionContext(doc: SceneDoc) {
  const net = doc.networks.find((n) => n.id === doc.root);
  if (!net?.comp) throw new Error("The design has no composition.");
  const comp = net.comp;
  return {
    comp: { width: comp.width, height: comp.height, fps: comp.fps, duration: comp.duration },
    layers: net.nodes.filter((n) => ["Text", "Shape", "Image", "Group", "Subnet", "Scene3D"].includes(n.type)).slice(0, 60).map((n) => ({
      node: n.id, name: n.name.slice(0, 80), type: n.type, role: n.role,
      ...(n.type === "Text" ? { text: String(n.params.text?.value ?? "").slice(0, 2000), font: String(n.params.font?.value ?? "Inter") } : {}),
      span: [n.timing?.in ?? 0, n.timing?.out ?? comp.duration] as [number, number],
      params: Object.entries(isNodeType(n.type) ? CATALOG[n.type].params as Record<string, ParamSpec> : {}).filter(([, s]) => s.animatable && ["number", "vec2", "vec3", "color"].includes(s.kind)).map(([name, s]) => ({ name, kind: s.kind, value: n.params[name]?.value ?? s.default, min: s.min, max: s.max })),
    })),
  };
}