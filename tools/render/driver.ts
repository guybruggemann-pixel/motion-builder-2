/**
 * Drives the app's /render page in a background browser (Playwright). The page renders with the
 * app's own renderer; this only passes the doc in and pulls the bytes out.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { chromium, type Browser, type Page } from "playwright-core";
import type { HeadlessOptions, HeadlessResult } from "../../src/app/headless/types";

export interface Renderer {
  /** Which browser is rendering, e.g. "chrome 142 (headless)". */
  browser: string;
  render(doc: unknown, options: HeadlessOptions, onProgress?: (done: number, total: number) => void): Promise<{ meta: HeadlessResult; bytes: Uint8Array }>;
  close(): Promise<void>;
}

const reachable = (url: string) => fetch(`${url}/render`, { signal: AbortSignal.timeout(3000) }).then((r) => r.ok, () => false);

/** The app at `url`, started with the dev server when it isn't running. Returns how to stop what was started. */
async function ensureApp(url: string): Promise<() => void> {
  if (await reachable(url)) return () => {};
  const port = new URL(url).port || "8080";
  const server: ChildProcess = spawn("bunx", ["vite", "dev", "--port", port, "--strictPort"], { stdio: "ignore", detached: true });
  const stop = () => {
    try {
      if (server.pid) process.kill(-server.pid);
    } catch {
      // already gone
    }
  };
  for (let i = 0; i < 120; i++) {
    if (server.exitCode !== null) throw new Error(`The app isn't running at ${url} and the dev server wouldn't start on port ${port}.`);
    if (await reachable(url)) return stop;
    await new Promise((r) => setTimeout(r, 500));
  }
  stop();
  throw new Error(`The app didn't come up at ${url} within a minute.`);
}

/** Google Chrome when it's installed (it can encode H.264), otherwise Playwright's Chromium. */
async function launch(headed: boolean): Promise<{ browser: Browser; name: string }> {
  const opts = { headless: !headed, args: ["--enable-gpu", "--ignore-gpu-blocklist"] };
  try {
    return { browser: await chromium.launch({ ...opts, channel: "chrome" }), name: "Chrome" };
  } catch {
    try {
      return { browser: await chromium.launch(opts), name: "Chromium (no H.264: mp4 won't work)" };
    } catch {
      throw new Error("No browser to render in. Install Google Chrome, or run: bunx playwright-core install chromium");
    }
  }
}

const CHUNK = 4 * 1024 * 1024;

export async function openRenderer(o: { url?: string; headed?: boolean } = {}): Promise<Renderer> {
  const url = (o.url ?? "http://localhost:8080").replace(/\/$/, "");
  const stopApp = await ensureApp(url);
  let browser: Browser | undefined;
  try {
    const launched = await launch(o.headed ?? false);
    browser = launched.browser;
    const page: Page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let progress: ((done: number, total: number) => void) | undefined;
    await page.exposeFunction("mbProgress", (done: number, total: number) => progress?.(done, total));
    await page.goto(`${url}/render`, { waitUntil: "load" });
    await page.waitForFunction(() => window.mbHeadless?.version === 1, undefined, { timeout: 60_000 }).catch(() => {
      throw new Error(`The render page at ${url}/render didn't load.${errors.length ? ` Page error: ${errors[0]}` : ""}`);
    });
    const b = browser;
    return {
      browser: `${launched.name} ${b.version()} (${o.headed ? "window" : "headless"})`,
      async render(doc, options, onProgress) {
        progress = onProgress;
        const meta = await page.evaluate(([d, opt]) => window.mbHeadless!.render(d, opt), [doc, options] as const);
        const bytes = new Uint8Array(meta.size);
        for (let off = 0; off < meta.size; off += CHUNK) {
          const b64 = await page.evaluate(([id, at, n]) => window.mbHeadless!.read(id, at, n), [meta.id, off, CHUNK] as const);
          bytes.set(Buffer.from(b64, "base64"), off);
        }
        await page.evaluate((id) => window.mbHeadless!.release(id), meta.id);
        progress = undefined;
        return { meta, bytes };
      },
      async close() {
        await b.close();
        stopApp();
      },
    };
  } catch (e) {
    await browser?.close();
    stopApp();
    throw e;
  }
}
