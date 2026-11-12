/**
 * The lower third as a data-ready template: layout follows the text, so any name fits.
 * - The panel's width links to the Name's measured bounds + 64 px padding (height stays 120).
 * - Names wider than 900 px shrink to fit.
 * - The panel draws on with a Phase wipe (reveal right) instead of hand keys to a fixed width,
 *   so the wipe always ends at the fitted width.
 * Same promoted controls as the reference: Name, Title, Accent colour.
 */
import type { SceneDoc } from "../schema";
import { lowerThird } from "./lowerThird";

function build(): SceneDoc {
  const d: SceneDoc = structuredClone(lowerThird);
  d.name = "Lower third (fits any name)";
  const net = d.networks.find((n) => n.id === "lower-third")!;
  const panel = net.nodes.find((n) => n.id === "panel")!;
  panel.params.size = {
    value: [640, 120],
    modifiers: [
      { id: "fit", type: "link", enabled: true, blend: "replace", params: { node: "name", param: "bounds", offset: 64, min: 160, axis: "x" } },
    ],
  };
  const name = net.nodes.find((n) => n.id === "name")!;
  name.params.maxWidth = { value: 900 };
  name.params.overflow = { value: "shrink" };
  net.nodes.push({
    id: "panel-in",
    type: "Phase",
    name: "Panel in",
    enabled: true,
    params: {
      mode: { value: "in" },
      duration: { value: 0.5 },
      ease: { value: "outExpo" },
      stagger: { value: 0 },
      offsetPosition: { value: [0, 0] },
      offsetOpacity: { value: 100 },
      reveal: { value: "right" },
    },
    ui: { x: 220, y: 0 },
  });
  net.wires = net.wires.filter((w) => !(w.from.node === "panel" && w.to.node === "merge"));
  net.wires.unshift(
    { from: { node: "panel", port: "out" }, to: { node: "panel-in", port: "in" } },
    { from: { node: "panel-in", port: "out" }, to: { node: "merge", port: "in" } },
  );
  return d;
}

export const lowerThirdFit: SceneDoc = build();
