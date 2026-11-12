import { describe, expect, it } from "vitest";
import { applyRow, fileName, parseCsv, qcRows, type BatchTarget } from "@core/batch";
import { evaluateFrame, lowerThirdFit, type TextDrawable } from "@core/scene";

const target: BatchTarget = { network: "main", instance: "lt", mapping: { name: "Naam", title: "Functie" } };

describe("csv", () => {
  it("parses quotes, commas, newlines and a BOM", () => {
    const { headers, rows } = parseCsv('﻿Naam,Functie\r\n"Doe, Jane","Head of ""Ops"""\nJan Jansen,"Motion\ndesigner"\n\n');
    expect(headers).toEqual(["Naam", "Functie"]);
    expect(rows).toEqual([
      { Naam: "Doe, Jane", Functie: 'Head of "Ops"' },
      { Naam: "Jan Jansen", Functie: "Motion\ndesigner" },
    ]);
  });
});

describe("rows into the template", () => {
  it("sets the promoted controls on the instance and nothing else", () => {
    const d = applyRow(lowerThirdFit, target, { Naam: "Jane Doe", Functie: "Producer" });
    const texts = evaluateFrame(d, "main", 3).filter((x): x is TextDrawable => x.kind === "text").map((x) => x.text);
    expect(texts).toEqual(["Jane", "Doe", "Producer"]);
    expect(lowerThirdFit.networks[0]!.nodes[0]!.params.name).toBeUndefined(); // template untouched
  });

  it("keeps the template value for an empty cell", () => {
    const d = applyRow(lowerThirdFit, target, { Naam: "Jane Doe", Functie: "" });
    expect(evaluateFrame(d, "main", 3).some((x) => x.kind === "text" && x.text === "Motion designer")).toBe(true);
  });

  it("builds safe file names", () => {
    expect(fileName("{Naam}_LT", { Naam: "Jane/Doe: CEO?" }, 0)).toBe("Jane_Doe_ CEO_LT");
    expect(fileName("{#}_{Naam}", { Naam: "Jo" }, 41)).toBe("0042_Jo");
    expect(fileName("{Missing}", {}, 2)).toBe("row_0003");
  });
});

describe("QC before rendering", () => {
  const rows = [
    { Naam: "Jane Doe", Functie: "Producer" },
    { Naam: "", Functie: "Editor" },
    { Naam: "Jane Doe", Functie: "Director" },
  ];

  it("flags empty cells and duplicate file names", () => {
    const issues = qcRows(lowerThirdFit, target, rows, { at: 3, fileTemplate: "{Naam}_LT" });
    expect(issues.filter((i) => i.kind === "empty").map((i) => i.row)).toEqual([1]);
    expect(issues.filter((i) => i.kind === "duplicate-name").map((i) => i.row)).toEqual([2]);
  });

  it("flags layouts that leave the safe area", () => {
    const ok = qcRows(lowerThirdFit, target, [{ Naam: "Jane Doe", Functie: "Producer" }], { at: 3 });
    expect(ok.filter((i) => i.kind === "outside-safe")).toEqual([]);
    // a title with no width limit runs off the frame
    const long = { Naam: "Jane", Functie: "Chief Executive Officer, Founding Partner and Chair of the Supervisory Board of the Very Long Company Name Group International" };
    const bad = qcRows(lowerThirdFit, target, [long], { at: 3 });
    expect(bad.some((i) => i.kind === "outside-safe" && i.message.includes("title"))).toBe(true);
  });
});

describe("sheet links", () => {
  it("turns share and publish links into CSV addresses", async () => {
    const { sheetCsvUrl } = await import("@core/batch");
    expect(sheetCsvUrl("https://docs.google.com/spreadsheets/d/1AbC_d-9/edit#gid=123")).toBe("https://docs.google.com/spreadsheets/d/1AbC_d-9/gviz/tq?tqx=out:csv&gid=123");
    expect(sheetCsvUrl("https://docs.google.com/spreadsheets/d/1AbC/edit?usp=sharing")).toBe("https://docs.google.com/spreadsheets/d/1AbC/gviz/tq?tqx=out:csv");
    expect(sheetCsvUrl("https://docs.google.com/spreadsheets/d/e/2PACX-1x/pubhtml?gid=7")).toBe("https://docs.google.com/spreadsheets/d/e/2PACX-1x/pub?output=csv&gid=7");
    expect(sheetCsvUrl("https://example.com/names.csv")).toBeUndefined();
    expect(sheetCsvUrl("not a link")).toBeUndefined();
  });

  it("hashes rows stably", async () => {
    const { hash } = await import("@core/batch");
    expect(hash("Jane Doe|Producer")).toBe(hash("Jane Doe|Producer"));
    expect(hash("Jane Doe|Producer")).not.toBe(hash("Jane Doe|Director"));
  });
});
