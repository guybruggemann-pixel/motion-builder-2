/**
 * Reference input for the AI rebuild: a picture as one downscaled JPEG, a video as a few frames
 * spread over its length. Browser only; nothing here is stored in the doc.
 */
const MAX = 1024;

function toJpeg(src: CanvasImageSource, w: number, h: number): string {
  const s = Math.min(1, MAX / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * s);
  c.height = Math.round(h * s);
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Couldn't read the reference image.");
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}

export async function pictureFrames(dataUrl: string): Promise<{ width: number; height: number; frames: { t: number; image: string }[] }> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  return { width: img.naturalWidth, height: img.naturalHeight, frames: [{ t: 0, image: toJpeg(img, img.naturalWidth, img.naturalHeight) }] };
}

/** Timestamped samples include short transitions as well as the opening and last visible frame. */
export async function videoFrames(file: File): Promise<{ width: number; height: number; duration: number; frames: { t: number; image: string }[] }> {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  try {
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    // Attached media receives decoder/seek events reliably in Chromium and embedded previews.
    v.style.position = "fixed";
    v.style.width = "1px";
    v.style.height = "1px";
    v.style.opacity = "0";
    v.style.pointerEvents = "none";
    document.body.append(v);
    v.src = url;
    await new Promise<void>((res, rej) => {
      const timer = setTimeout(() => rej(new Error("The video took too long to load. Try an MP4 (H.264).")), 15000);
      v.onloadeddata = () => { clearTimeout(timer); res(); };
      v.onerror = () => { clearTimeout(timer); rej(new Error("This video can't be read in the browser. Try an MP4 (H.264) or WebM.")); };
    });
    const duration = Number.isFinite(v.duration) ? v.duration : 5;
    const frames: { t: number; image: string }[] = [];
    const n = 20;
    for (let i = 0; i < n; i++) {
      // Stay within the last decoded frame, not the container's trailing audio/rounding tail.
      const t = Math.max(0, Math.min(duration - Math.min(0.1, duration / 20), (duration * i) / (n - 1)));
      if (Math.abs(v.currentTime - t) > 0.0001) await new Promise<void>((res, rej) => {
        const timer = setTimeout(() => {
          if (!v.seeking && v.readyState >= 2 && Math.abs(v.currentTime - t) < 0.05) res();
          else rej(new Error(`Couldn't read the video frame at ${t.toFixed(2)}s. Try an MP4 (H.264).`));
        }, 10000);
        v.onseeked = () => { clearTimeout(timer); res(); };
        v.onerror = () => { clearTimeout(timer); rej(new Error("Couldn't decode this video frame.")); };
        v.currentTime = t;
      });
      frames.push({ t, image: toJpeg(v, v.videoWidth, v.videoHeight) });
    }
    return { width: v.videoWidth, height: v.videoHeight, duration, frames };
  } finally {
    v.pause();
    v.removeAttribute("src");
    v.load();
    v.remove();
    URL.revokeObjectURL(url);
  }
}
