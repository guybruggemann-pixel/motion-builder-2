/** The .jsx After Effects runs: the build script with this doc's baked plan inside. */
import type { MeasureText, SceneDoc } from "@core/scene";
import buildScript from "./ae-build.jsx?raw";
import { buildAePlan, type AePlan } from "./aePlan";
import passesBuild from "./ae-passes.jsx?raw";
import type { PassPlan } from "@/app/render/passes/plan";

/** ExtendScript reads the file as Latin-1 unless told otherwise: escape everything outside ASCII. */
const ascii = (s: string) => s.replace(/[\u0080-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

export function aeScript(plan: AePlan): string {
  return buildScript.replace("/*@PLAN@*/null", ascii(JSON.stringify(plan)));
}

export function exportAe(doc: SceneDoc, networkId: string, measure: MeasureText): { plan: AePlan; jsx: string } {
  const plan = buildAePlan(doc, networkId, measure);
  return { plan, jsx: aeScript(plan) };
}

/** The .jsx that assembles an AE passes export (beauty layers, a hidden Mattes precomp, depth of field ready). */
export function passesScript(plan: PassPlan): string {
  const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  const data = { comp: { ...plan.comp, bg: plan.comp.background ? hex(plan.comp.background) : undefined }, outputs: plan.outputs };
  return passesBuild.replace("/*@PLAN@*/null", ascii(JSON.stringify(data)));
}
