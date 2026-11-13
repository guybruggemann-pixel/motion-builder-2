/**
 * Web fonts for the canvas and the UI, registered under their plain family names
 * ("Inter", not "Inter Variable") so they match what scene docs and brand kits say.
 * Bundled (not fetched from a CDN) so preview and render measure the same glyphs offline.
 *
 * Add a family here when a brand kit needs it. Text in a family that isn't registered
 * falls back to the browser default and is reported by `missingFonts`.
 */
import interLatin from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import interLatinExt from "@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2?url";
import tightLatin from "@fontsource-variable/inter-tight/files/inter-tight-latin-wght-normal.woff2?url";
import tightLatinExt from "@fontsource-variable/inter-tight/files/inter-tight-latin-ext-wght-normal.woff2?url";
import oswaldLatin from "@fontsource-variable/oswald/files/oswald-latin-wght-normal.woff2?url";
import oswaldLatinExt from "@fontsource-variable/oswald/files/oswald-latin-ext-wght-normal.woff2?url";
import antonLatin from "@fontsource/anton/files/anton-latin-400-normal.woff2?url";
import antonLatinExt from "@fontsource/anton/files/anton-latin-ext-400-normal.woff2?url";
import outfitLatin from "@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2?url";
import outfitLatinExt from "@fontsource-variable/outfit/files/outfit-latin-ext-wght-normal.woff2?url";
import markerLatin from "@fontsource/permanent-marker/files/permanent-marker-latin-400-normal.woff2?url";
import monoLatin from "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?url";
import monoLatinExt from "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-ext-wght-normal.woff2?url";
import type { SceneDoc } from "@core/scene";

const LATIN =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const LATIN_EXT =
  "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";

/** Family -> [url, unicode-range] per subset. All are variable fonts covering weights 100-900. */
const FAMILIES: Record<string, [string, string][]> = {
  Inter: [[interLatin, LATIN], [interLatinExt, LATIN_EXT]],
  "Inter Tight": [[tightLatin, LATIN], [tightLatinExt, LATIN_EXT]],
  /** Tall condensed display face (OFL), for walls of kinetic type. Weights 200-700. */
  Oswald: [[oswaldLatin, LATIN], [oswaldLatinExt, LATIN_EXT]],
  /** Heavy condensed poster face (OFL), one weight. For frame-filling kinetic type. */
  Anton: [[antonLatin, LATIN], [antonLatinExt, LATIN_EXT]],
  /** Heavy geometric sans (OFL), weights 100-900. For bold black-and-white type sequences. */
  Outfit: [[outfitLatin, LATIN], [outfitLatinExt, LATIN_EXT]],
  /** Hand-drawn brush marker (Apache), one weight. For grunge titles. */
  "Permanent Marker": [[markerLatin, LATIN]],
  "JetBrains Mono": [[monoLatin, LATIN], [monoLatinExt, LATIN_EXT]],
};

export const knownFamilies = () => Object.keys(FAMILIES);

/** The bundled WOFF2 files of a family, in subset order (latin first). For glyph outlines (3D text). */
export const fontFiles = (family: string): string[] => (FAMILIES[family] ?? []).map(([url]) => url);
export const missingFonts = (families: Iterable<string>) => [...new Set(families)].filter((f) => !(f in FAMILIES));

let ready: Promise<void> | undefined;
const embedded = new Map<string, string>();
const restored = new Map<string, Promise<string>>();

/** Register and load every bundled face. Resolves once glyph metrics are final. */
export function loadFonts(): Promise<void> {
  ready ??= Promise.all(
    Object.entries(FAMILIES).flatMap(([family, subsets]) =>
      subsets.map(async ([url, unicodeRange]) => {
        const face = new FontFace(family, `url(${url}) format("woff2")`, { weight: "100 900", unicodeRange, display: "block" });
        document.fonts.add(face);
        await face.load();
      }),
    ),
  ).then(() => undefined);
  return ready;
}

/** Add a font the user brought in (e.g. from a zip on Import), for this session. Returns its family. */
export async function registerFont(family: string, data: ArrayBuffer): Promise<string> {
  const src = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Couldn't read this font."));
    reader.readAsDataURL(new Blob([data], { type: "application/octet-stream" }));
  });
  const face = new FontFace(family, data, { weight: "100 900", display: "block" });
  await face.load();
  document.fonts.add(face);
  FAMILIES[family] = [[src, "U+0000-10FFFF"]];
  embedded.set(family, src);
  return family;
}

/** Imported font bytes belong to the doc, so file open/autosave never substitute a fallback. */
export function embedDocFonts(doc: SceneDoc): SceneDoc {
  const used = new Set(doc.networks.flatMap((n) => n.nodes.filter((x) => x.type === "Text" || x.type === "Text3D").map((x) => String(x.params.font?.value ?? "Inter"))));
  const assets = [...doc.assets];
  for (const family of used) {
    const src = embedded.get(family);
    if (!src || assets.some((a) => a.kind === "font" && a.meta?.family === family && a.src === src)) continue;
    let i = 1;
    while (assets.some((a) => a.id === `font-${i}`)) i++;
    assets.push({ id: `font-${i}`, kind: "font", src, meta: { family } });
  }
  return assets.length === doc.assets.length ? doc : { ...doc, assets };
}

export async function loadDocFonts(doc: SceneDoc): Promise<void> {
  await loadFonts();
  await Promise.all(doc.assets.filter((a) => a.kind === "font" && typeof a.meta?.family === "string" && a.src.startsWith("data:")).map(async (asset) => {
    const family = String(asset.meta?.family);
    if (embedded.get(family) === asset.src) return;
    const key = `${family}|${asset.src}`;
    let pending = restored.get(key);
    if (!pending) {
      pending = fetch(asset.src).then((res) => res.arrayBuffer()).then((bytes) => registerFont(family, bytes));
      restored.set(key, pending);
      void pending.catch(() => restored.delete(key));
    }
    await pending;
  }));
  if (doc.networks.some((n) => n.nodes.some((x) => x.type === "Scene3D")) && doc.assets.some((a) => a.kind === "font")) {
    await (await import("./outlines")).loadOutlineFonts();
  }
}
