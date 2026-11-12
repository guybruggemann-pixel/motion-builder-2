/**
 * The 3D pass: draws a `Scene3D` (plain data from the core) with three.js into an offscreen
 * WebGL canvas, which the 2D renderer then draws as the layer's pixels. Same code in preview and
 * final render, frame-stepped. Conventions come from `@core/scene/scene3d`: px units, y up,
 * column-major matrices, text outlines in layout space mapped to (x - origin, -(y - origin)),
 * extrusions centred on z = 0.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import type { Light3D, Material3D, Object3D, Scene3D, Shape3D, Text3D } from "@core/scene";
import type { OutlineFonts } from "../outlines";

/**
 * What a render draws. `beauty`: the look. `id`: unlit pure colours per object (others black,
 * still occluding) for puzzle mattes. `depth`: view depth as grey, white = `near`, black = `far`.
 */
export type PassMode = { kind: "beauty" } | { kind: "id"; colors: Record<string, [number, number, number]> } | { kind: "depth"; near: number; far: number };

const DEPTH_VERTEX = `varying float vDepth;
void main() {
  vec4 p = vec4(position, 1.0);
  #ifdef USE_INSTANCING
  p = instanceMatrix * p;
  #endif
  vec4 v = modelViewMatrix * p; vDepth = -v.z; gl_Position = projectionMatrix * v;
}`;
const DEPTH_FRAGMENT = `uniform float near; uniform float far; varying float vDepth;
void main() { float g = 1.0 - clamp((vDepth - near) / max(far - near, 1e-3), 0.0, 1.0); gl_FragColor = vec4(vec3(g), 1.0); }`;

/** Largest side of the pass in device px (memory and speed). */
const MAX_PX = 4096;

export class ScenePass {
  readonly canvas = new OffscreenCanvas(2, 2);
  private renderer: THREE.WebGLRenderer;
  private pmrem: THREE.PMREMGenerator;
  private envs = new Map<string, THREE.Texture>();
  private geometries = new Map<string, THREE.BufferGeometry>();
  private grain?: THREE.DataTexture;

  constructor(private fonts: OutlineFonts) {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas as unknown as HTMLCanvasElement, alpha: true, antialias: true, premultipliedAlpha: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.VSMShadowMap;
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    // Build the studio environments now: generating one mid-render changes the renderer's
    // target and viewport, and that frame comes out empty.
    for (const blur of [0, 0.04, 0.08]) this.envs.set(`room-${blur}`, this.pmrem.fromScene(new RoomEnvironment(), blur).texture);
  }

  /** Render the scene at `w` × `h` device px. Returns the canvas holding the pixels. */
  render(data: Scene3D, w: number, h: number, mode: PassMode = { kind: "beauty" }): OffscreenCanvas {
    const k = Math.min(1, MAX_PX / Math.max(w, h));
    const pw = Math.max(2, Math.round(w * k)), ph = Math.max(2, Math.round(h * k));
    const beauty = mode.kind === "beauty";

    const scene = new THREE.Scene();
    const disposable: THREE.Material[] = [];
    if (beauty) this.environment(scene, data);
    for (const o of data.objects) {
      const geo = this.geometry(o);
      if (!geo || (!beauty && o.opacity <= 0.01)) continue;
      const mat =
        mode.kind === "id"
          ? new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(...(mode.colors[o.node] ?? [0, 0, 0]), THREE.LinearSRGBColorSpace), toneMapped: false })
          : mode.kind === "depth"
            ? new THREE.ShaderMaterial({ vertexShader: DEPTH_VERTEX, fragmentShader: DEPTH_FRAGMENT, uniforms: { near: { value: mode.near }, far: { value: mode.far } } })
            : this.material(o.material, o.opacity);
      disposable.push(mat);
      const mesh = o.clones ? instanced(geo, mat, o.clones, beauty) : new THREE.Mesh(geo, mat);
      mesh.matrixAutoUpdate = false;
      if (!o.clones) mesh.matrix.fromArray(o.matrix);
      mesh.castShadow = mesh.receiveShadow = beauty && data.shadows && o.material.kind !== "solid";
      scene.add(mesh);
    }
    if (beauty) for (const l of data.lights) this.light(scene, l, data);

    const cam = camera(data);

    this.renderer.setRenderTarget(null);
    this.renderer.setSize(pw, ph, false);
    this.renderer.setViewport(0, 0, pw, ph);
    // mattes and depth are data: no colour conversion, no tone mapping
    this.renderer.outputColorSpace = beauty ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
    this.renderer.toneMapping = beauty ? THREE.NeutralToneMapping : THREE.NoToneMapping;
    this.renderer.render(scene, cam);
    for (const m of disposable) m.dispose();
    scene.traverse((o) => (o as { shadow?: { dispose?: () => void } }).shadow?.dispose?.());
    return this.canvas;
  }

  /**
   * Which object is under a point of the layer (u, v from its top-left, 0..1), front-most first.
   * Used for click-to-select and drag-to-turn in the viewer.
   */
  pick(data: Scene3D, u: number, v: number): string | undefined {
    const scene = new THREE.Scene();
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    for (const o of data.objects) {
      const geo = this.geometry(o);
      if (!geo || o.opacity <= 0.01) continue;
      const mesh = o.clones ? instanced(geo, mat, o.clones, false) : new THREE.Mesh(geo, mat);
      mesh.matrixAutoUpdate = false;
      if (!o.clones) mesh.matrix.fromArray(o.matrix);
      mesh.userData.node = o.node;
      scene.add(mesh);
    }
    scene.updateMatrixWorld(true);
    const cam = camera(data);
    cam.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(u * 2 - 1, -(v * 2 - 1)), cam);
    const hit = ray.intersectObjects(scene.children, false)[0];
    mat.dispose();
    return hit?.object.userData.node as string | undefined;
  }

  /** An object's on-screen box in the layer, as [u0, v0, u1, v1] (0..1 from the top-left), or undefined. */
  box(data: Scene3D, node: string): [number, number, number, number] | undefined {
    const o = data.objects.find((x) => x.node === node);
    const geo = o && this.geometry(o);
    if (!o || !geo) return undefined;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox!, cam = camera(data);
    cam.updateMatrixWorld(true);
    let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
    for (const mat of o.clones ? o.clones.map((c) => c.matrix) : [o.matrix]) {
      const m = new THREE.Matrix4().fromArray(mat);
      for (const x of [bb.min.x, bb.max.x])
        for (const y of [bb.min.y, bb.max.y])
          for (const z of [bb.min.z, bb.max.z]) {
            const p = new THREE.Vector3(x, y, z).applyMatrix4(m).project(cam);
            const u = (p.x + 1) / 2, v = (1 - p.y) / 2;
            u0 = Math.min(u0, u), v0 = Math.min(v0, v), u1 = Math.max(u1, u), v1 = Math.max(v1, v);
          }
    }
    // clones running off screen: keep the box on the layer
    u0 = Math.max(0, u0), v0 = Math.max(0, v0), u1 = Math.min(1, u1), v1 = Math.min(1, v1);
    return [u0, v0, u1, v1];
  }

  /** Nearest and farthest view depth of the scene's objects (bounding spheres), for a depth pass range. */
  depthRange(data: Scene3D): [number, number] | undefined {
    const cam = camera(data);
    cam.updateMatrixWorld(true);
    let near = Infinity, far = -Infinity;
    for (const o of data.objects) {
      const geo = this.geometry(o);
      if (!geo || o.opacity <= 0.01) continue;
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      for (const mat of o.clones ? o.clones.map((c) => c.matrix) : [o.matrix]) {
        const m = new THREE.Matrix4().fromArray(mat);
        const c = geo.boundingSphere!.center.clone().applyMatrix4(m).applyMatrix4(cam.matrixWorldInverse);
        const r = geo.boundingSphere!.radius * m.getMaxScaleOnAxis();
        near = Math.min(near, -c.z - r);
        far = Math.max(far, -c.z + r);
      }
    }
    return near === Infinity ? undefined : [Math.max(1, near), far];
  }

  /**
   * Where an object's origin and the world X, Y, Z axes through it land on screen, in layer uv
   * (0..1 from the top-left). Each axis endpoint is `unit` world px from the origin. For the gizmo.
   */
  axes(data: Scene3D, node: string, unit = 100): { origin: [number, number]; ends: [[number, number], [number, number], [number, number]]; unit: number } | undefined {
    const o = data.objects.find((x) => x.node === node);
    if (!o) return undefined;
    const cam = camera(data);
    cam.updateMatrixWorld(true);
    const p0 = new THREE.Vector3(0, 0, 0).applyMatrix4(new THREE.Matrix4().fromArray(o.matrix));
    const uv = (p: THREE.Vector3): [number, number] => {
      const q = p.clone().project(cam);
      return [(q.x + 1) / 2, (1 - q.y) / 2];
    };
    const ends = [new THREE.Vector3(unit, 0, 0), new THREE.Vector3(0, unit, 0), new THREE.Vector3(0, 0, unit)].map((d) => uv(p0.clone().add(d))) as [[number, number], [number, number], [number, number]];
    return { origin: uv(p0), ends, unit };
  }

  /** World points on screen, in layer uv (0..1 from the top-left). */
  project(data: Scene3D, points: [number, number, number][]): [number, number][] {
    const cam = camera(data);
    cam.updateMatrixWorld(true);
    return points.map((p) => {
      const q = new THREE.Vector3(...p).project(cam);
      return [(q.x + 1) / 2, (1 - q.y) / 2];
    });
  }

  /** The world move that shifts an object by (du, dv) of the layer, parallel to the screen at its depth. */
  planeDelta(data: Scene3D, node: string, du: number, dv: number): [number, number, number] {
    const o = data.objects.find((x) => x.node === node);
    if (!o) return [0, 0, 0];
    const cam = camera(data);
    cam.updateMatrixWorld(true);
    const p0 = new THREE.Vector3(0, 0, 0).applyMatrix4(new THREE.Matrix4().fromArray(o.matrix));
    const q = p0.clone().project(cam);
    const moved = new THREE.Vector3(q.x + du * 2, q.y - dv * 2, q.z).unproject(cam);
    const d = moved.sub(p0);
    return [d.x, d.y, d.z];
  }

  /* ---------- look ---------- */

  private environment(scene: THREE.Scene, data: Scene3D) {
    const k = data.environmentIntensity;
    if (data.environment === "none") return;
    const blur = data.environment === "studio-hard" ? 0 : data.environment === "overcast" ? 0.08 : 0.04;
    const key = `room-${blur}`;
    let env = this.envs.get(key);
    if (!env) {
      env = this.pmrem.fromScene(new RoomEnvironment(), blur).texture;
      this.envs.set(key, env);
    }
    scene.environment = env;
    // the environment fills; the scene's lights shape. Kept low so a key light reads as one.
    scene.environmentIntensity = (data.environment === "studio-hard" ? 0.22 : data.environment === "overcast" ? 0.3 : 0.4) * k;
    if (data.environment === "overcast") scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.4 * k));
  }

  private light(scene: THREE.Scene, l: Light3D, data: Scene3D) {
    const color = new THREE.Color(l.color.slice(0, 7));
    let light: THREE.DirectionalLight | THREE.PointLight | THREE.SpotLight;
    if (l.kind === "point") light = new THREE.PointLight(color, l.intensity, 0, 0);
    else if (l.kind === "spot") light = new THREE.SpotLight(color, l.intensity, 0, (l.angle * Math.PI) / 180, l.softness, 0);
    else light = new THREE.DirectionalLight(color, l.intensity);
    light.position.set(...l.position);
    if ("target" in light) {
      light.target.position.set(...l.target);
      scene.add(light.target);
    }
    if (l.castShadow && data.shadows) {
      light.castShadow = true;
      const s = light.shadow;
      s.mapSize.set(2048, 2048);
      s.radius = 1 + l.softness * 14;
      s.blurSamples = 16;
      s.bias = -0.0004;
      if (light instanceof THREE.DirectionalLight) {
        const ext = Math.max(...data.size) * 0.9;
        const cam = s.camera as THREE.OrthographicCamera;
        Object.assign(cam, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: new THREE.Vector3(...l.position).distanceTo(new THREE.Vector3(...l.target)) + ext * 2 });
        cam.updateProjectionMatrix();
      } else {
        s.camera.near = 1;
        s.camera.far = 50_000;
      }
    }
    scene.add(light);
  }

  private material(m: Material3D, opacity: number): THREE.Material {
    const color = new THREE.Color(m.color.slice(0, 7));
    const transparent = opacity < 1;
    if (m.kind === "solid") return new THREE.MeshBasicMaterial({ color, transparent, opacity, toneMapped: false });
    const mat = new THREE.MeshPhysicalMaterial({
      color,
      roughness: m.roughness,
      metalness: m.metalness,
      transmission: m.transmission,
      ior: m.ior,
      thickness: m.thickness * 100,
      clearcoat: m.clearcoat,
      iridescence: m.iridescence,
      emissive: m.emission > 0 ? color : new THREE.Color(0x000000),
      emissiveIntensity: m.emission,
      transparent,
      opacity,
    });
    if (m.grain > 0) {
      mat.bumpMap = this.grainTexture();
      mat.bumpScale = m.grain * 2;
    }
    return mat;
  }

  /** Seeded value noise (Park-Miller), tiled: fine grain for plaster, paper and matte plastic. */
  private grainTexture(): THREE.DataTexture {
    if (this.grain) return this.grain;
    const n = 256, data = new Uint8Array(n * n * 4);
    let seed = 20261112;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    // two octaves of value noise (coarse 32 + fine 256), wrapped so it tiles
    const coarse = Array.from({ length: 32 * 32 }, rnd);
    const at = (x: number, y: number) => coarse[((y + 32) % 32) * 32 + ((x + 32) % 32)]!;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const fx = (x / n) * 32, fy = (y / n) * 32, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
        const c = (at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) + (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty;
        const v = Math.round((0.55 * c + 0.45 * rnd()) * 255);
        data.set([v, v, v, 255], (y * n + x) * 4);
      }
    const tex = new THREE.DataTexture(data, n, n);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1 / 512, 1 / 512); // extrusion UVs are in px: one texel ≈ 2 px
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return (this.grain = tex);
  }

  /* ---------- geometry ---------- */

  private geometry(o: Object3D): THREE.BufferGeometry | undefined {
    const key = JSON.stringify(o.kind === "text" ? [o.runs, o.font, o.tracking, o.origin, o.depth, o.bevel] : [o.shape, o.size, o.radius, o.path, o.depth, o.bevel]);
    let g = this.geometries.get(key);
    if (g) return g;
    const shapes = o.kind === "text" ? textShapes(this.fonts, o) : shapeShapes(o);
    if (!shapes.length) return undefined;
    g = extrude(shapes, o.depth, o.bevel);
    this.geometries.set(key, g);
    if (this.geometries.size > 300) {
      const [oldest] = this.geometries.keys();
      this.geometries.get(oldest!)!.dispose();
      this.geometries.delete(oldest!);
    }
    return g;
  }

}

/** Text 3D outlines as three.js shapes in object space (one ShapePath per glyph, so holes match within it). */
export function textShapes(fonts: OutlineFonts, o: Text3D): THREE.Shape[] {
    const [ox, oy] = o.origin;
    const P = (x: number, y: number): [number, number] => [x - ox, -(y - oy)];
    const shapes: THREE.Shape[] = [];
    for (const run of o.runs)
      for (const g of fonts.runOutlines(run, o.font, o.tracking)) {
        const sp = new THREE.ShapePath();
        for (const c of g.cmds) {
          if (c.op === "M") sp.moveTo(...P(c.p[0], c.p[1]));
          else if (c.op === "L") sp.lineTo(...P(c.p[0], c.p[1]));
          else if (c.op === "Q") sp.quadraticCurveTo(...P(c.p[0], c.p[1]), ...P(c.p[2], c.p[3]));
          else if (c.op === "C") sp.bezierCurveTo(...P(c.p[0], c.p[1]), ...P(c.p[2], c.p[3]), ...P(c.p[4], c.p[5]));
        }
        shapes.push(...sp.toShapes());
      }
    return shapes;
}

/**
 * An object drawn as its clones: one instanced mesh. With `tint`, clone colours replace the
 * material's colour (the material goes white and each instance carries its colour).
 */
function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, clones: NonNullable<Object3D["clones"]>, tint: boolean): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, clones.length);
  const m = new THREE.Matrix4();
  clones.forEach((c, i) => mesh.setMatrixAt(i, m.fromArray(c.matrix)));
  if (tint && clones.some((c) => c.color) && "color" in mat) {
    const base = (mat as THREE.MeshPhysicalMaterial).color.clone();
    (mat as THREE.MeshPhysicalMaterial).color.set(0xffffff);
    const col = new THREE.Color();
    clones.forEach((c, i) => mesh.setColorAt(i, c.color ? col.set(c.color.slice(0, 7)) : base));
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/** The scene's camera as three.js sees it (AE lens maths and roll already in the data). */
function camera(data: Scene3D): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(data.camera.fov, data.size[0] / data.size[1], 1, 200_000);
  cam.position.set(...data.camera.position);
  const dir = new THREE.Vector3(...data.camera.target).sub(cam.position).normalize();
  cam.up.set(0, 1, 0).applyAxisAngle(dir, (data.camera.roll * Math.PI) / 180);
  cam.lookAt(...data.camera.target);
  return cam;
}

export function shapeShapes(o: Shape3D): THREE.Shape[] {
  const [w, h] = o.size;
  if (o.shape === "ellipse") {
    const s = new THREE.Shape();
    s.absellipse(0, 0, w / 2, h / 2, 0, Math.PI * 2, false, 0);
    return [s];
  }
  if (o.shape === "path") {
    if (!o.path.trim()) return [];
    const svg = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${o.path.replace(/"/g, "")}"/></svg>`);
    // SVG is y down and drawn from [0, 0] to size, like 2D shapes: centre it and flip y
    return svg.paths.flatMap((p) => SVGLoader.createShapes(p)).map((s) => {
      const pts = s.extractPoints(12);
      const flip = (v: THREE.Vector2) => new THREE.Vector2(v.x - w / 2, -(v.y - h / 2));
      const out = new THREE.Shape(pts.shape.map(flip));
      out.holes = pts.holes.map((hole) => new THREE.Path(hole.map(flip)));
      return out;
    });
  }
  const r = Math.min(o.radius, w / 2, h / 2);
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  if (r) s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  if (r) s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  if (r) s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  if (r) s.quadraticCurveTo(x, y, x + r, y);
  return [s];
}

/** Extrude to a total depth of `depth` (bevel included), centred on z = 0, bevel kept inside the outline. */
export function extrude(shapes: THREE.Shape[], depth: number, bevel: number): THREE.BufferGeometry {
  const b = Math.min(bevel, depth / 2 - 0.01);
  const body = Math.max(0.01, depth - 2 * Math.max(0, b));
  const g = new THREE.ExtrudeGeometry(shapes, {
    depth: body,
    bevelEnabled: b > 0,
    bevelThickness: Math.max(0, b),
    bevelSize: Math.max(0, b),
    bevelOffset: -Math.max(0, b),
    bevelSegments: 3,
    curveSegments: 8,
  });
  g.translate(0, 0, -body / 2);
  return g;
}
