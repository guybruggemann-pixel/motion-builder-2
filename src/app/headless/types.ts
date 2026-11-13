/**
 * The contract between the headless render page (`/render`, `api.ts`) and whatever drives it
 * (`tools/render/`). Types only, so Node can import this file.
 */

/** Values for promoted controls on one Subnet instance, like a batch row. */
export interface HeadlessOverrides {
  network: string;
  instance: string;
  values: Record<string, string>;
}

export interface HeadlessOptions {
  /**
   * prores: ProRes 4444 .mov with alpha. mp4: H.264 over the comp background (needs a browser
   * with an H.264 encoder: Chrome, not plain Chromium). frames: raw straight RGBA, 4 bytes per
   * pixel, frames one after another, alpha kept.
   */
  format: "prores" | "mp4" | "frames";
  /** Network to render; defaults to the doc's root comp. */
  network?: string;
  /** Output size; defaults to the comp size. */
  width?: number;
  height?: number;
  /** Default true (uses the comp's motion blur when it has it). */
  motionBlur?: boolean;
  /** Frames [from, to); defaults to the whole comp. `from` only applies to "frames". */
  from?: number;
  to?: number;
  overrides?: HeadlessOverrides;
}

export interface HeadlessResult {
  /** Handle for `read` / `release`. */
  id: string;
  /** Bytes in the result. */
  size: number;
  ext: "mov" | "mp4" | "rgba";
  width: number;
  height: number;
  fps: number;
  frames: number;
}

export interface HeadlessApi {
  version: 1;
  /** Validates the doc, applies overrides, loads fonts, images and 3D, then renders. Throws with a readable message. */
  render(doc: unknown, options: HeadlessOptions): Promise<HeadlessResult>;
  /** Base64 of bytes [offset, offset + length) of a result (results can be too big for one message). */
  read(id: string, offset: number, length: number): Promise<string>;
  release(id: string): void;
}

declare global {
  interface Window {
    mbHeadless?: HeadlessApi;
    /** Set by the driver to follow progress. */
    mbProgress?: (done: number, total: number) => void;
  }
}
