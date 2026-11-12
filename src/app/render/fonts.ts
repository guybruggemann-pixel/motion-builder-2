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
import monoLatin from "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?url";
import monoLatinExt from "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-ext-wght-normal.woff2?url";

const LATIN =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const LATIN_EXT =
  "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";

/** Family -> [url, unicode-range] per subset. All are variable fonts covering weights 100-900. */
const FAMILIES: Record<string, [string, string][]> = {
  Inter: [[interLatin, LATIN], [interLatinExt, LATIN_EXT]],
  "Inter Tight": [[tightLatin, LATIN], [tightLatinExt, LATIN_EXT]],
  "JetBrains Mono": [[monoLatin, LATIN], [monoLatinExt, LATIN_EXT]],
};

export const knownFamilies = () => Object.keys(FAMILIES);

/** The bundled WOFF2 files of a family, in subset order (latin first). For glyph outlines (3D text). */
export const fontFiles = (family: string): string[] => (FAMILIES[family] ?? []).map(([url]) => url);
export const missingFonts = (families: Iterable<string>) => [...new Set(families)].filter((f) => !(f in FAMILIES));

let ready: Promise<void> | undefined;

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
