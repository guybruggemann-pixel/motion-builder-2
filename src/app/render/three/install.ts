/**
 * Plugs the 3D pass into the 2D renderer. three.js and the glyph outlines load on first use (the
 * layer shows its placeholder for that moment), then the viewer is asked to redraw.
 */
import type { Scene3DDrawable } from "@core/scene";
import { requestRedraw, setScene3DRenderer } from "../canvas2d";
import type { PassMode, ScenePass } from "./pass";

/**
 * One pass per page, shared by every copy of this module: the dev server can load a module twice
 * (after edits, under different `?t=` URLs), and a second copy without the pass can't pick or draw.
 */
const shared = ((globalThis as { __motionBuilder3D?: { pass?: ScenePass; loading?: Promise<ScenePass>; stats: { rendered: number; placeholder: number; redraws: number } } }).__motionBuilder3D ??= {
  stats: { rendered: 0, placeholder: 0, redraws: 0 },
});
/** Counters for debugging in the console: frames drawn by the pass, and drawn as the placeholder. */
export const stats3D = shared.stats;

/** Load three.js and the outline fonts (once). Await it before a final render. */
export function load3D(): Promise<ScenePass> {
  shared.loading ??= Promise.all([import("./pass"), import("../outlines").then((m) => m.loadOutlineFonts())]).then(([m, fonts]) => {
    shared.pass = new m.ScenePass(fonts);
    stats3D.redraws++;
    requestRedraw();
    return shared.pass;
  });
  return shared.loading;
}

/** The 3D object under (u, v) of a scene layer, or undefined (also while the pass isn't loaded yet). */
export const pick3D = (scene: Scene3DDrawable["scene"], u: number, v: number) => shared.pass?.pick(scene, u, v);

/** An object's on-screen box within its scene layer ([u0, v0, u1, v1], 0..1), once the pass is loaded. */
export const box3D = (scene: Scene3DDrawable["scene"], node: string) => shared.pass?.box(scene, node);

/** Object origin and world axes on screen (see `ScenePass.axes`), once the pass is loaded. */
export const axes3D = (scene: Scene3DDrawable["scene"], node: string) => shared.pass?.axes(scene, node);

/** World move for a screen move of (du, dv) of the layer, parallel to the screen (see `ScenePass.planeDelta`). */
export const planeDelta3D = (scene: Scene3DDrawable["scene"], node: string, du: number, dv: number) => shared.pass?.planeDelta(scene, node, du, dv);

/** Nearest and farthest view depth of a scene's objects, once the pass is loaded. */
export const depthRange3D = (scene: Scene3DDrawable["scene"]) => shared.pass?.depthRange(scene);

export function install3D() {
  setScene3DRenderer((ctx, d: Scene3DDrawable, mode) => {
    const pass = shared.pass;
    if (!pass) {
      stats3D.placeholder++;
      void load3D();
      return false;
    }
    stats3D.rendered++;
    const t = ctx.getTransform();
    const sx = Math.hypot(t.a, t.b), sy = Math.hypot(t.c, t.d);
    const out = pass.render(d.scene, Math.round(d.size[0] * sx), Math.round(d.size[1] * sy), mode as PassMode | undefined);
    ctx.drawImage(out, 0, 0, d.size[0], d.size[1]);
    return true;
  });
}
