/** v1's ProRes 4444 encoder, as the app loads it: a real .mov that ffprobe/ffmpeg read back. */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { prores } from "@/render/prores/prores";

const hasFfprobe = spawnSync("ffprobe", ["-version"]).status === 0;

function frame(w: number, h: number, i: number) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      px[p] = (x * 4 + i * 20) & 255;
      px[p + 1] = y * 4;
      px[p + 2] = 128;
      px[p + 3] = x < w / 2 ? 255 : 64; // half opaque, half translucent
    }
  return px;
}

describe("ProRes 4444 encoder", () => {
  const W = 64, H = 32, N = 5, FPS = 25;
  const { Encoder, mov } = prores();
  const enc = new Encoder(W, H, { q: 2 });
  const frames = Array.from({ length: N }, (_, i) => enc.frame(frame(W, H, i)));

  it("writes ProRes frames ('icpf') and a QuickTime container", () => {
    for (const f of frames) expect(String.fromCharCode(...f.slice(4, 8))).toBe("icpf");
    const parts = mov(frames, W, H, FPS, true);
    expect(String.fromCharCode(...parts[0]!.slice(4, 8))).toBe("ftyp");
  });

  it.skipIf(!hasFfprobe)("is read back by ffprobe as ProRes 4444 with alpha, right size, rate and length", () => {
    const dir = mkdtempSync(join(tmpdir(), "mb-prores-"));
    const file = join(dir, "t.mov");
    writeFileSync(file, Buffer.concat(mov(frames, W, H, FPS, true)));
    const info = JSON.parse(
      execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=codec_name,profile,width,height,pix_fmt,r_frame_rate,nb_read_frames", "-of", "json", file]).toString(),
    ).streams[0];
    expect(info).toMatchObject({ codec_name: "prores", width: W, height: H, r_frame_rate: "25/1", nb_read_frames: String(N) });
    expect(info.pix_fmt).toMatch(/yuva444/);
    // decodes cleanly, every frame
    const dec = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-f", "null", "-"]);
    expect(dec.status).toBe(0);
    expect(dec.stderr.toString()).toBe("");
  });
});
