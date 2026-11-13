/**
 * A hand-made After Effects dump in the shape `tools/ae/mb-export.jsx` writes (mb-ae-dump/0.2).
 * Replace with a real dump once the script has run in After Effects.
 *
 * LT_bar (1920x1080, 25 fps, 4 s), top to bottom:
 *  1 Camera            (not imported)
 *  2 Name [ctl]        text, parented to the rig, slides up with Easy Ease, fades in linearly
 *  3 Bar [ctl]         shape: a rectangle growing from 0 to 640 wide with an outExpo-like ease
 *  4 Rig               null at [120, 860], parent of 2, 3 and 5
 *  5 Accent            precomp "Accent dot": an ellipse that pops in after a hold
 *  6 BG                solid with an effect and a blend mode (both reported)
 */
import type { AeDump, AeProp } from "../../src/core/library/importAe";

const p = (name: string, matchName: string, value: unknown, keys?: AeProp["keys"]): AeProp => ({ name, matchName, value, ...(keys ? { keys } : {}) });
const g = (name: string, matchName: string, children: AeProp[]): AeProp => ({ name, matchName, children });
const transform = (o: { anchor?: number[]; position?: AeProp; scale?: AeProp; opacity?: AeProp } = {}): AeProp =>
  g("Transform", "ADBE Transform Group", [
    p("Anchor Point", "ADBE Anchor Point", o.anchor ?? [0, 0, 0]),
    o.position ?? p("Position", "ADBE Position", [0, 0, 0]),
    o.scale ?? p("Scale", "ADBE Scale", [100, 100, 100]),
    p("Rotation", "ADBE Rotate Z", 0),
    o.opacity ?? p("Opacity", "ADBE Opacity", 100),
  ]);
const layer = { enabled: true, threeD: false, blendingMode: "normal", trackMatteType: "none", stretch: 100, timeRemapEnabled: false, startTime: 0 };
const easy = [{ speed: 0, influence: 33.3333 }];

export const aeLowerThird: AeDump = {
  format: "mb-ae-dump/0.2",
  root: "comp:10",
  comps: [
    {
      id: "comp:20", name: "Accent dot", width: 200, height: 200, fps: 25, duration: 4, layers: [
        {
          ...layer, index: 1, name: "Dot", type: "shape", inPoint: 0, outPoint: 4, parent: null,
          properties: [
            g("Contents", "ADBE Root Vectors Group", [
              g("Ellipse 1", "ADBE Vector Group", [
                g("Contents", "ADBE Vectors Group", [
                  g("Ellipse Path 1", "ADBE Vector Shape - Ellipse", [p("Size", "ADBE Vector Ellipse Size", [40, 40]), p("Position", "ADBE Vector Ellipse Position", [0, 0])]),
                  g("Fill 1", "ADBE Vector Graphic - Fill", [p("Color", "ADBE Vector Fill Color", [1, 0.5, 0, 1]), p("Opacity", "ADBE Vector Fill Opacity", 100)]),
                ]),
                g("Transform", "ADBE Vector Transform Group", [p("Position", "ADBE Vector Position", [0, 0])]),
              ]),
            ]),
            transform({
              position: p("Position", "ADBE Position", [100, 100, 0]),
              scale: p("Scale", "ADBE Scale", [0, 0, 100], [
                { t: 0, v: [0, 0, 100], inInterp: "linear", outInterp: "hold" },
                { t: 0.4, v: [0, 0, 100], inInterp: "hold", outInterp: "bezier", easeIn: [{ speed: 0, influence: 16.7 }, { speed: 0, influence: 16.7 }, { speed: 0, influence: 16.7 }], easeOut: [{ speed: 1562.5, influence: 16 }, { speed: 1562.5, influence: 16 }, { speed: 0, influence: 16 }] },
                { t: 0.8, v: [100, 100, 100], inInterp: "bezier", outInterp: "linear", easeIn: [{ speed: 0, influence: 70 }, { speed: 0, influence: 70 }, { speed: 0, influence: 70 }], easeOut: [{ speed: 0, influence: 16.7 }, { speed: 0, influence: 16.7 }, { speed: 0, influence: 16.7 }] },
              ]),
            }),
          ],
        },
      ],
    },
    {
      id: "comp:10", name: "LT_bar", width: 1920, height: 1080, fps: 25, duration: 4, motionBlur: true, shutterAngle: 180, layers: [
        { ...layer, index: 1, name: "Camera 1", type: "camera", inPoint: 0, outPoint: 4, parent: null, properties: [] },
        {
          ...layer, index: 2, name: "Name [ctl]", type: "text", inPoint: 0.2, outPoint: 4, parent: 4,
          properties: [
            g("Text", "ADBE Text Properties", [p("Source Text", "ADBE Text Document", { text: "Guy Bruggemann", font: "Inter-Bold", fontSize: 48, tracking: 25, justification: "left", applyFill: true, fillColor: [1, 1, 1] })]),
            transform({
              position: p("Position", "ADBE Position", [32, 116, 0], [
                { t: 0.2, v: [32, 116, 0], inInterp: "linear", outInterp: "bezier", easeIn: easy, easeOut: easy, spatialIn: [0, 0, 0], spatialOut: [0, 0, 0] },
                { t: 0.8, v: [32, 56, 0], inInterp: "bezier", outInterp: "linear", easeIn: easy, easeOut: easy, spatialIn: [0, 0, 0], spatialOut: [0, 0, 0] },
              ]),
              opacity: p("Opacity", "ADBE Opacity", 0, [
                { t: 0.2, v: 0, inInterp: "linear", outInterp: "linear", easeIn: [{ speed: 0, influence: 16.7 }], easeOut: [{ speed: 250, influence: 16.7 }] },
                { t: 0.6, v: 100, inInterp: "linear", outInterp: "linear", easeIn: [{ speed: 250, influence: 16.7 }], easeOut: [{ speed: 0, influence: 16.7 }] },
              ]),
            }),
          ],
        },
        {
          ...layer, index: 3, name: "Bar [ctl]", type: "shape", inPoint: 0, outPoint: 4, parent: 4,
          properties: [
            g("Contents", "ADBE Root Vectors Group", [
              g("Rectangle 1", "ADBE Vector Group", [
                g("Contents", "ADBE Vectors Group", [
                  g("Rectangle Path 1", "ADBE Vector Shape - Rect", [
                    p("Size", "ADBE Vector Rect Size", [0, 120], [
                      // outExpo: cubic-bezier(0.16, 1, 0.3, 1) over 0.5 s and 640 px → 8000 px/s out at 16 %, 0 in at 70 %
                      { t: 0, v: [0, 120], inInterp: "linear", outInterp: "bezier", easeIn: [{ speed: 0, influence: 16.7 }, { speed: 0, influence: 16.7 }], easeOut: [{ speed: 8000, influence: 16 }, { speed: 0, influence: 16 }] },
                      { t: 0.5, v: [640, 120], inInterp: "bezier", outInterp: "linear", easeIn: [{ speed: 0, influence: 70 }, { speed: 0, influence: 70 }], easeOut: [{ speed: 0, influence: 16.7 }, { speed: 0, influence: 16.7 }] },
                    ]),
                    p("Position", "ADBE Vector Rect Position", [320, 60]),
                    p("Roundness", "ADBE Vector Rect Roundness", 6),
                  ]),
                  g("Fill 1", "ADBE Vector Graphic - Fill", [p("Color", "ADBE Vector Fill Color", [0.1216, 0.2941, 1, 1]), p("Opacity", "ADBE Vector Fill Opacity", 100)]),
                ]),
                g("Transform", "ADBE Vector Transform Group", [p("Position", "ADBE Vector Position", [0, 0])]),
              ]),
            ]),
            transform(),
          ],
        },
        { ...layer, index: 4, name: "Rig", type: "null", inPoint: 0, outPoint: 4, parent: null, properties: [transform({ position: p("Position", "ADBE Position", [120, 860, 0]) })] },
        { ...layer, index: 5, name: "Accent", type: "precomp", source: "comp:20", inPoint: 0.5, outPoint: 4, startTime: 0.5, parent: 4, properties: [transform({ anchor: [100, 100, 0], position: p("Position", "ADBE Position", [660, 60, 0]) })] },
        {
          ...layer, index: 6, name: "BG", type: "solid", solidColor: [0.04, 0.04, 0.06], width: 1920, height: 1080, inPoint: 0, outPoint: 4, parent: null, blendingMode: "5216",
          properties: [g("Effects", "ADBE Effect Parade", [g("Gaussian Blur", "ADBE Gaussian Blur 2", [p("Blurriness", "ADBE Gaussian Blur 2-0001", 20)])]), transform({ opacity: { name: "Opacity", matchName: "ADBE Opacity", value: 50, expression: "wiggle(1, 10)" } })],
        },
      ],
    },
  ],
};
