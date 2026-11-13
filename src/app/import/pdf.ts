/** Render the first page of a PDF to a PNG file (browser only; pdf.js loads on first use). */
export async function pdfToPng(f: File): Promise<File> {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(4, 1920 / Math.max(base.width, base.height)) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvasContext: canvas.getContext("2d")!, viewport, canvas } as never).promise;
  const blob = await new Promise<Blob>((r, j) => canvas.toBlob((b) => (b ? r(b) : j(new Error("Couldn't read this PDF."))), "image/png"));
  return new File([blob], f.name.replace(/\.pdf$/i, ".png"), { type: "image/png" });
}
