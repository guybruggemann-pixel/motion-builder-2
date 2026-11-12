/**
 * Typed access to v1's ProRes 4444 encoder (`anime-ae-prores.es3.js`, unchanged). The ES3 source is
 * imported as text and evaluated, so the exact same code runs on the page, in workers and in tests.
 */
import source from "./anime-ae-prores.es3.js?raw";

export interface ProResEncoder {
  /** One ProRes frame from straight (unpremultiplied) RGBA bytes, w*h*4. */
  frame(rgba: Uint8Array | Uint8ClampedArray): Uint8Array;
}

export interface ProResModule {
  /** opts.q: base quantiser 1..8 (2 = near lossless, v1's setting). */
  Encoder: new (w: number, h: number, opts?: { q?: number }) => ProResEncoder;
  /** QuickTime .mov parts (ftyp, wide, mdat header, frames..., moov) for a Blob. */
  mov(frames: Uint8Array[], w: number, h: number, fps: number, alpha: boolean): Uint8Array[];
}

let mod: ProResModule | undefined;

export function prores(): ProResModule {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- deliberate: run the verbatim ES3 file
  mod ??= new Function(`${source}; return AnimeAEProRes;`)() as ProResModule;
  return mod;
}

/** The encoder source, for building workers that encode frames in parallel. */
export const proresSource = source;
