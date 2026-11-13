import { describe, expect, it } from "vitest";
import { produce } from "immer";
import { lowerThird } from "@core/scene";
import { fullPath } from "@/app/store";
import { saveAsNewVersion } from "@/app/file/versions";

describe("composition ancestry", () => {
  it("rejects existing subnets belonging to an earlier version", () => {
    const doc = produce(lowerThird, saveAsNewVersion);
    expect(fullPath(doc, [{ network: "lower-third", node: "lt" }])).toEqual([{ network: doc.root }]);
  });
  it("truncates the entire path after a missing instance", () => {
    expect(fullPath(lowerThird, [{ network: "lower-third", node: "missing" }, { network: "main" }])).toEqual([{ network: lowerThird.root }]);
  });
});