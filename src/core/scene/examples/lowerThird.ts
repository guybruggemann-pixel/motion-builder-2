/**
 * Reference scene: a lower third as a motion asset.
 * Main comp holds a Subnet node; inside, the panel draws on, the name types on word by word
 * and the title fades up. Name, title and accent colour are promoted controls for designers.
 * Colours use brand tokens. Swap the placeholder brand values for the real Techonomy kit.
 */
import type { SceneDoc } from "../schema";

export const lowerThird: SceneDoc = {
  version: 2,
  name: "Lower third reference",
  root: "main",
  source: { kind: "blank" },
  assets: [],
  brand: {
    name: "Brand placeholder (replace with the Techonomy kit)",
    colors: [
      { token: "primary", value: "#1F4BFF" },
      { token: "ink", value: "#0B0B0F" },
      { token: "paper", value: "#FFFFFF" },
    ],
    fonts: [{ family: "Inter", weights: [400, 700], role: "all" }],
    assets: ["lower-third"],
  },
  networks: [
    {
      id: "main",
      name: "Main_v01",
      comp: { width: 1920, height: 1080, fps: 25, duration: 6, motionBlur: { shutter: 180, samples: 8 } },
      output: "out",
      wires: [{ from: { node: "lt", port: "out" }, to: { node: "out", port: "in" } }],
      nodes: [
        {
          id: "lt",
          type: "Subnet",
          name: "Lower third",
          subnet: "lower-third",
          enabled: true,
          timing: { in: 0.5, out: 5.5 },
          params: { position: { value: [120, 860] } },
          ui: { x: 0, y: 0 },
        },
        { id: "out", type: "Output", name: "Output", enabled: true, params: {}, ui: { x: 240, y: 0 } },
      ],
    },
    {
      id: "lower-third",
      name: "Lower third",
      output: "merge",
      promoted: [
        { id: "name", label: "Name", target: { node: "name", param: "text" }, control: "text" },
        { id: "title", label: "Title", target: { node: "title", param: "text" }, control: "text" },
        { id: "accent", label: "Accent colour", target: { node: "panel", param: "fill" }, control: "color" },
      ],
      wires: [
        { from: { node: "panel", port: "out" }, to: { node: "merge", port: "in" } },
        { from: { node: "name", port: "out" }, to: { node: "split", port: "in" } },
        { from: { node: "split", port: "out" }, to: { node: "name-in", port: "in" } },
        { from: { node: "name-in", port: "out" }, to: { node: "merge", port: "in" } },
        { from: { node: "title", port: "out" }, to: { node: "title-in", port: "in" } },
        { from: { node: "title-in", port: "out" }, to: { node: "merge", port: "in" } },
      ],
      nodes: [
        {
          id: "panel",
          type: "Shape",
          name: "Panel",
          role: "panel",
          enabled: true,
          params: {
            shape: { value: "rect" },
            fill: { value: "brand:primary" },
            radius: { value: 6 },
            // Hand-keyed hero move: the panel grows from 0 to full width.
            size: {
              value: [640, 120],
              keys: [
                { t: 0, v: [0, 120], ease: "outExpo" },
                { t: 0.5, v: [640, 120], ease: "linear" },
              ],
            },
          },
          ui: { x: 0, y: 0 },
        },
        {
          id: "name",
          type: "Text",
          name: "Name",
          role: "title",
          enabled: true,
          params: {
            text: { value: "Guy Bruggemann" },
            font: { value: "Inter" },
            weight: { value: 700 },
            size: { value: 48 },
            fill: { value: "brand:paper" },
            position: { value: [32, 56] },
          },
          ui: { x: 0, y: 120 },
        },
        { id: "split", type: "Split", name: "Split words", enabled: true, params: { by: { value: "words" } }, ui: { x: 220, y: 120 } },
        {
          id: "name-in",
          type: "Phase",
          name: "Name in",
          enabled: true,
          params: {
            mode: { value: "in" },
            start: { value: 0.25 },
            duration: { value: 0.5 },
            ease: { value: "outExpo" },
            stagger: { value: 0.06 },
            offsetPosition: { value: [0, 30] },
            offsetOpacity: { value: 0 },
            reveal: { value: "up" },
          },
          ui: { x: 440, y: 120 },
        },
        {
          id: "title",
          type: "Text",
          name: "Title",
          role: "subtitle",
          enabled: true,
          params: {
            text: { value: "Motion designer" },
            font: { value: "Inter" },
            weight: { value: 400 },
            size: { value: 28 },
            fill: { value: "brand:paper" },
            position: { value: [32, 96] },
            // Procedural on top: a subtle drift that keeps the frame alive while it holds.
            opacity: { value: 100, modifiers: [{ id: "breathe", type: "wave", enabled: true, blend: "add", params: { amplitude: -6, frequency: 0.5 } }] },
          },
          ui: { x: 0, y: 240 },
        },
        {
          id: "title-in",
          type: "Phase",
          name: "Title in",
          enabled: true,
          params: {
            mode: { value: "in" },
            start: { value: 0.45 },
            duration: { value: 0.6 },
            ease: { value: "outQuart" },
            stagger: { value: 0 },
            offsetPosition: { value: [0, 16] },
            offsetOpacity: { value: 0 },
          },
          ui: { x: 440, y: 240 },
        },
        { id: "merge", type: "Merge", name: "Merge", enabled: true, params: {}, ui: { x: 660, y: 120 } },
      ],
    },
  ],
};
