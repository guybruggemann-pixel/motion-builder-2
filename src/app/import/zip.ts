/** Unpack a zip on Import: fonts are registered for this session, other files go through the normal import. */
import JSZip from "jszip";
import { registerFont } from "@/app/render/fonts";

const MIME: Record<string, string> = { svg: "image/svg+xml", pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" };

/** "Gilroy-Black.otf" -> "Gilroy Black". */
export const familyOf = (file: string) => file.replace(/^.*\//, "").replace(/\.\w+$/, "").replace(/[-_]+/g, " ").trim();

export async function unzip(f: File): Promise<{ files: File[]; fonts: string[] }> {
  const zip = await JSZip.loadAsync(f);
  const files: File[] = [], fonts: string[] = [];
  for (const e of Object.values(zip.files)) {
    if (e.dir || /(^|\/)(__MACOSX|\.)/.test(e.name)) continue;
    const ext = e.name.split(".").pop()?.toLowerCase() ?? "";
    if (["ttf", "otf", "woff", "woff2"].includes(ext)) fonts.push(await registerFont(familyOf(e.name), await e.async("arraybuffer")));
    else if (MIME[ext]) files.push(new File([await e.async("blob")], e.name.replace(/^.*\//, ""), { type: MIME[ext] }));
  }
  return { files, fonts };
}
