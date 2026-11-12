/*  Motion Builder 2.0 -> After Effects: passes and AOVs
    File > Scripts > Run Script File... with this script next to its .mov files.
    Builds the comp from rendered passes: one beauty layer per layer (in paint order, timed like
    in Motion Builder), and a hidden, shy "Mattes" precomp with alpha mattes, puzzle mattes and
    depth. The puzzle legend is in the comp comment. No keyframes, no expressions.
    ES3 on purpose (ExtendScript). The plan below is generated. */
(function () {
  var PLAN = /*@PLAN@*/null;
  if (!PLAN) { alert("Motion Builder: this script has no export in it."); return; }

  var BASE = (function () { try { return new File($.fileName).parent.fsName; } catch (e) { return ""; } })();
  var missing = [], imported = {};
  var proj = app.project || app.newProject();

  function footage(out, into) {
    var item = imported[out.file];
    if (!item) {
      var f = new File(BASE + "/" + out.file);
      if (!f.exists) { missing.push(out.file); return null; }
      item = imported[out.file] = proj.importFile(new ImportOptions(f));
      item.parentFolder = into;
    }
    return item;
  }
  function place(C, item, out, start) {
    var L = C.layers.add(item);
    L.name = out.name;
    L.startTime = start || 0;
    L.inPoint = Math.max(0, out["in"]);
    L.outPoint = Math.max(L.inPoint + C.frameDuration, Math.min(out.out, C.duration));
    return L;
  }

  app.beginUndoGroup("Motion Builder passes");
  var c = PLAN.comp;
  var folder = proj.items.addFolder("Motion Builder passes");
  var footageFolder = proj.items.addFolder("Footage");
  footageFolder.parentFolder = folder;
  var C = proj.items.addComp(c.name, c.width, c.height, 1, c.duration, c.fps);
  C.parentFolder = folder;
  if (c.bg) C.bgColor = c.bg;
  var M = proj.items.addComp(c.name + " · Mattes", c.width, c.height, 1, c.duration, c.fps);
  M.parentFolder = folder;

  var i, out, item, depthLayers = {}, beautyLayers = {}, legend = [];
  // mattes, puzzles and depth into the Mattes precomp (and depth also next to its beauty, hidden)
  for (i = 0; i < PLAN.outputs.length; i++) {
    out = PLAN.outputs[i];
    if (out.kind === "beauty") continue;
    item = footage(out, footageFolder);
    if (!item) continue;
    place(M, item, out, 0);
    if (out.kind === "puzzle") legend.push(out.name);
    if (out.kind === "depth") depthLayers[out.element] = { item: item, out: out };
  }
  // beauty layers bottom first: AE puts each new layer on top
  for (i = 0; i < PLAN.outputs.length; i++) {
    out = PLAN.outputs[i];
    if (out.kind !== "beauty") continue;
    item = footage(out, footageFolder);
    if (!item) continue;
    beautyLayers[out.element] = place(C, item, out, 0);
  }
  // depth of field ready to switch on: the depth map sits hidden under its 3D layer
  for (var el in depthLayers) {
    if (!depthLayers.hasOwnProperty(el) || !beautyLayers[el]) continue;
    var D = place(C, depthLayers[el].item, depthLayers[el].out, 0);
    D.enabled = false; D.shy = true;
    try { D.moveAfter(beautyLayers[el]); } catch (e1) {}
    try {
      var fx = beautyLayers[el].property("ADBE Effect Parade").addProperty("ADBE Camera Lens Blur");
      fx.enabled = false;
      try { fx.property("ADBE Camera Lens Blur-0002").setValue(D.index); } catch (e2) {}
      beautyLayers[el].comment = "Depth of field: switch on Camera Lens Blur; Blur Map Layer = " + D.name + " (white = near " + depthLayers[el].out.near + " px, black = far " + depthLayers[el].out.far + " px).";
    } catch (e3) {}
  }
  var ML = C.layers.add(M);
  ML.enabled = false; ML.shy = true; ML.name = "Mattes";
  C.comment = "Motion Builder passes. Puzzle mattes (R / G / B):\n" + legend.join("\n");
  app.endUndoGroup();
  try { C.openInViewer(); } catch (e4) {}
  if (missing.length) alert("Motion Builder: put these passes next to the script and run it again:\n" + missing.join("\n"));
})();
