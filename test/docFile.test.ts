import { describe, expect, it } from "vitest";
import { lowerThird } from "@core/scene";
import { fileAccessProblem, fileNameFor, parseDocFile, serializeDoc } from "@/app/file/docFile";

describe("scene files", () => {
  it("a saved scene opens as the same doc", () => {
    const first = parseDocFile(JSON.stringify(lowerThird));
    if (!first.ok) throw new Error(first.errors.join());
    const again = parseDocFile(serializeDoc(first.doc));
    expect(again.ok && serializeDoc(again.doc)).toBe(serializeDoc(first.doc));
  });
  it("rejects files that aren't JSON or aren't scenes", () => {
    expect(parseDocFile("not json").ok).toBe(false);
    expect(parseDocFile('{"hello":1}').ok).toBe(false);
  });
  it("names files after the scene, without characters an OS refuses", () => {
    expect(fileNameFor({ ...(lowerThird as never as object), name: 'Lower third / a:b' } as never)).toBe("Lower-third-a-b.mb.json");
  });
  it("folder export inside the preview frame says to open its own tab", () => {
    expect(fileAccessProblem({ self: 1, top: 2, showDirectoryPicker: () => {} })).toMatch(/own tab/);
    expect(fileAccessProblem({ self: 1, top: 1 })).toMatch(/Chrome or Edge/);
    expect(fileAccessProblem({ self: 1, top: 1, showDirectoryPicker: () => {} })).toBeUndefined();
  });
});
