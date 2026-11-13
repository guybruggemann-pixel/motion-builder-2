import type { HeadlessOptions } from "../../src/app/headless/types";

export interface RenderArgs {
  doc: string;
  out?: string;
  /** png = a PNG per frame (or one, with --frame). */
  format: "mp4" | "prores" | "png";
  frame?: number;
  url: string;
  headed: boolean;
  options: Omit<HeadlessOptions, "format">;
}

export const USAGE = `Render a scene doc with the app's own renderer, in a background browser.

  bun run render <doc.json> [options]

  --out <path>           output file, or folder for a PNG sequence (default: next to the doc)
  --format <f>           mp4 (default) | prores (4444 with alpha) | png (a PNG per frame)
  --frame <n>            one frame as a PNG (implies --format png)
  --from <n> --to <n>    frame range [from, to) (from: png only)
  --width <px> --height <px>   output size (default: the comp size)
  --network <id>         network to render (default: the root comp)
  --no-motion-blur
  --instance <network>/<node>  Subnet instance that --set values go to
  --set <control>=<value>      a promoted control's value (repeatable)
  --url <url>            a running app (default http://localhost:8080; started if it isn't running)
  --headed               show the browser window (same renderer, for comparing)`;

const int = (flag: string, v: string | undefined): number => {
  const n = Number(v);
  if (v === undefined || !Number.isInteger(n) || n < 0) throw new Error(`${flag} needs a whole number, got "${v ?? ""}"`);
  return n;
};

/** Command-line arguments to a render request. Throws with a message for the user. */
export function parseArgs(argv: string[]): RenderArgs {
  const a: RenderArgs = { doc: "", format: "mp4", url: "http://localhost:8080", headed: false, options: {} };
  const values: Record<string, string> = {};
  let instance: string | undefined, formatSet = false;
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i]!;
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${f} needs a value`);
      return v;
    };
    if (f === "--out") a.out = next();
    else if (f === "--format") {
      const v = next();
      if (v !== "mp4" && v !== "prores" && v !== "png") throw new Error(`--format is mp4, prores or png, not "${v}"`);
      a.format = v;
      formatSet = true;
    } else if (f === "--frame") a.frame = int(f, next());
    else if (f === "--from") a.options.from = int(f, next());
    else if (f === "--to") a.options.to = int(f, next());
    else if (f === "--width") a.options.width = int(f, next());
    else if (f === "--height") a.options.height = int(f, next());
    else if (f === "--network") a.options.network = next();
    else if (f === "--no-motion-blur") a.options.motionBlur = false;
    else if (f === "--instance") instance = next();
    else if (f === "--set") {
      const v = next(), eq = v.indexOf("=");
      if (eq < 1) throw new Error(`--set needs control=value, got "${v}"`);
      values[v.slice(0, eq)] = v.slice(eq + 1);
    } else if (f === "--url") a.url = next().replace(/\/$/, "");
    else if (f === "--headed") a.headed = true;
    else if (f.startsWith("--")) throw new Error(`unknown option ${f}`);
    else if (!a.doc) a.doc = f;
    else throw new Error(`unexpected argument "${f}"`);
  }
  if (!a.doc) throw new Error("which doc? Give the path to a scene doc .json");
  if (a.frame !== undefined) {
    if (formatSet && a.format !== "png") throw new Error("--frame writes a PNG; drop --format or use --format png");
    a.format = "png";
    a.options.from = a.frame;
    a.options.to = a.frame + 1;
  }
  if (a.options.from !== undefined && a.format !== "png") throw new Error("--from only works with --format png (video files start at frame 0)");
  if (Object.keys(values).length) {
    const [network, node, ...rest] = (instance ?? "").split("/");
    if (!network || !node || rest.length) throw new Error("--set needs --instance <network>/<node> to say which Subnet instance the values go to");
    a.options.overrides = { network, instance: node, values };
  } else if (instance) throw new Error("--instance does nothing without --set");
  return a;
}
