/**
 * Plugs the 3D pass into the 2D renderer. three.js and the glyph outlines load on first use (the
 * layer shows its placeholder for that moment), then the viewer is asked to redraw.
 */
import type { Scene3DDrawable } from "@core/scene";
import { requestRedraw, setScene3DRenderer } from "../canvas2d";
import type { ScenePass } from "./pass";

let pass: ScenePass | undefined;
/** Counters for debugging in the console: frames drawn by the pass, and drawn as the placeholder. */
export const stats3D = { rendered: 0, placeholder: 0, redraws: 0 };
let loading: Promise<ScenePass> | undefined;

/** Load three.js and the outline fonts (once). Await it before a final render. */
export function load3D(): Promise<ScenePass> {
  loading ??= Promise.all([import("./pass"), import("../outlines").then((m) => m.loadOutlineFonts())]).then(([m, fonts]) => {
    pass = new m.ScenePass(fonts);
    stats3D.redraws++;
    requestRedraw();
    return pass;
  });
  return loading;
}

export function install3D() {
  setScene3DRenderer((ctx, d: Scene3DDrawable) => {
    if (!pass) {
      stats3D.placeholder++;
      void load3D();
      return false;
    }
    stats3D.rendered++;
    const t = ctx.getTransform();
    const sx = Math.hypot(t.a, t.b), sy = Math.hypot(t.c, t.d);
    const out = pass.render(d.scene, Math.round(d.size[0] * sx), Math.round(d.size[1] * sy));
    ctx.drawImage(out, 0, 0, d.size[0], d.size[1]);
    return true;
  });
}
