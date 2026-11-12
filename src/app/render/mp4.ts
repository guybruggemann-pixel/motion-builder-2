/**
 * H.264 MP4 via WebCodecs + mp4-muxer (the Nodal prototype's stack). No alpha in H.264: frames are
 * rendered over the comp background, or black. Frame-stepped: each frame gets its exact timestamp.
 */
import { ArrayBufferTarget, Muxer } from "mp4-muxer";

export const mp4Supported = () => typeof VideoEncoder !== "undefined";

/** Encode straight RGBA frames (already opaque) to an MP4 Blob. */
export async function encodeMp4(
  width: number,
  height: number,
  fps: number,
  frames: number,
  frame: (i: number) => Uint8ClampedArray,
  onProgress: (done: number) => void,
  cancelled: () => boolean,
): Promise<Blob | undefined> {
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: "avc", width, height, frameRate: fps }, fastStart: "in-memory" });
  let failure: unknown;
  const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => (failure = e) });
  const config: VideoEncoderConfig = {
    codec: width * height > 1920 * 1080 ? "avc1.640033" : "avc1.640028", // High profile, level 5.1 / 4.0
    width,
    height,
    bitrate: Math.round(width * height * fps * 0.25), // ~12 Mbit/s at 1080p25
    framerate: fps,
  };
  const support = await VideoEncoder.isConfigSupported(config);
  if (!support.supported) throw new Error(`this browser can't encode H.264 at ${width}×${height}`);
  encoder.configure(config);
  for (let i = 0; i < frames && !cancelled(); i++) {
    if (failure) throw failure;
    const data = frame(i);
    const vf = new VideoFrame(data, { format: "RGBA", codedWidth: width, codedHeight: height, timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
    encoder.encode(vf, { keyFrame: i % Math.round(fps * 2) === 0 });
    vf.close();
    onProgress(i + 1);
    while (encoder.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 1));
    if (i % 4 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  await encoder.flush();
  encoder.close();
  if (failure) throw failure;
  if (cancelled()) return undefined;
  muxer.finalize();
  return new Blob([muxer.target.buffer], { type: "video/mp4" });
}
