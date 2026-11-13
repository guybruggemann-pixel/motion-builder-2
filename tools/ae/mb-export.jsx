/*  Motion Builder 2.0 · After Effects asset dumper · v0.2 (untested in AE: check the first runs)
    Writes the raw data of one comp (and every precomp it uses) to ae.json, for the app's importer.
    No conversion happens here: values, keyframes and temporal eases are written as AE reports them.

    Use: set MB_COMP_NAME and MB_OUT_FOLDER below (or leave them empty to use the active comp and
    pick a folder), then File > Scripts > Run Script File. ES3 only: no JSON object, no let/const.   */

var MB_COMP_NAME = "";      // exact comp name; "" = active comp
var MB_OUT_FOLDER = "";     // absolute folder path; "" = ask

(function () {
  var VERSION = "mb-ae-dump/0.2";

  /* ---------- tiny JSON writer (ExtendScript has no JSON) ---------- */
  function q(s) {
    s = String(s);
    var out = '"', c, code;
    for (var i = 0; i < s.length; i++) {
      c = s.charAt(i); code = s.charCodeAt(i);
      if (c === '"') out += '\\"';
      else if (c === '\\') out += '\\\\';
      else if (c === '\n') out += '\\n';
      else if (c === '\r') out += '\\r';
      else if (c === '\t') out += '\\t';
      else if (code < 32) out += '\\u' + ('0000' + code.toString(16)).slice(-4);
      else out += c;
    }
    return out + '"';
  }
  function num(n) { return isFinite(n) ? String(Math.round(n * 1e6) / 1e6) : "null"; }
  function json(v) {
    if (v === null || v === undefined) return "null";
    var t = typeof v;
    if (t === "number") return num(v);
    if (t === "boolean") return v ? "true" : "false";
    if (t === "string") return q(v);
    if (v instanceof Array) {
      var a = [];
      for (var i = 0; i < v.length; i++) a.push(json(v[i]));
      return "[" + a.join(",") + "]";
    }
    var parts = [];
    for (var k in v) if (v.hasOwnProperty(k) && v[k] !== undefined) parts.push(q(k) + ":" + json(v[k]));
    return "{" + parts.join(",") + "}";
  }

  /* ---------- enums as words (String() of an AE enum is a bare number) ---------- */
  function blendName(m) { try { if (m === BlendingMode.NORMAL) return "normal"; } catch (e) {} return String(m); }
  function matteName(m) { try { if (m === TrackMatteType.NO_TRACK_MATTE) return "none"; } catch (e) {} return String(m); }
  function justName(j) {
    try {
      if (j === ParagraphJustification.LEFT_JUSTIFY) return "left";
      if (j === ParagraphJustification.CENTER_JUSTIFY) return "center";
      if (j === ParagraphJustification.RIGHT_JUSTIFY) return "right";
    } catch (e) {}
    return String(j);
  }

  /* ---------- values ---------- */
  function colorOf(c) { return c ? [c[0], c[1], c[2]] : null; }

  function textDoc(td) {
    var o = { text: td.text };
    try { o.font = td.font; } catch (e) {}
    try { o.fontSize = td.fontSize; } catch (e) {}
    try { o.tracking = td.tracking; } catch (e) {}
    try { o.leading = td.leading; } catch (e) {}
    try { o.autoLeading = td.autoLeading; } catch (e) {}
    try { o.justification = justName(td.justification); } catch (e) {}
    try { o.applyFill = td.applyFill; if (td.applyFill) o.fillColor = colorOf(td.fillColor); } catch (e) {}
    try { o.applyStroke = td.applyStroke; if (td.applyStroke) { o.strokeColor = colorOf(td.strokeColor); o.strokeWidth = td.strokeWidth; } } catch (e) {}
    try { o.allCaps = td.allCaps; } catch (e) {}
    try { if (td.boxText) { o.boxTextSize = td.boxTextSize; } } catch (e) {}
    return o;
  }

  function shapeVal(s) {
    return { vertices: s.vertices, inTangents: s.inTangents, outTangents: s.outTangents, closed: s.closed };
  }

  function valueOf(prop, v) {
    var T = prop.propertyValueType;
    if (T === PropertyValueType.TEXT_DOCUMENT) return textDoc(v);
    if (T === PropertyValueType.SHAPE) return shapeVal(v);
    if (T === PropertyValueType.MARKER || T === PropertyValueType.LAYER_INDEX || T === PropertyValueType.MASK_INDEX) return v ? String(v) : null;
    if (T === PropertyValueType.CUSTOM_VALUE || T === PropertyValueType.NO_VALUE) return null;
    return v; // number or array
  }

  function interp(t) {
    if (t === KeyframeInterpolationType.HOLD) return "hold";
    if (t === KeyframeInterpolationType.LINEAR) return "linear";
    return "bezier";
  }

  function eases(arr) {
    var out = [];
    for (var i = 0; i < arr.length; i++) out.push({ speed: arr[i].speed, influence: arr[i].influence });
    return out;
  }

  function keysOf(prop) {
    var keys = [];
    for (var k = 1; k <= prop.numKeys; k++) {
      var key = {
        t: prop.keyTime(k),
        v: valueOf(prop, prop.keyValue(k)),
        inInterp: interp(prop.keyInInterpolationType(k)),
        outInterp: interp(prop.keyOutInterpolationType(k))
      };
      try { key.easeIn = eases(prop.keyInTemporalEase(k)); key.easeOut = eases(prop.keyOutTemporalEase(k)); } catch (e) {}
      try {
        if (prop.isSpatial) {
          key.spatialIn = prop.keyInSpatialTangent(k);
          key.spatialOut = prop.keyOutSpatialTangent(k);
          key.roving = prop.keyRoving(k);
        }
      } catch (e) {}
      try { key.continuous = prop.keyTemporalContinuous(k); } catch (e) {}
      keys.push(key);
    }
    return keys;
  }

  /* ---------- property tree ---------- */
  function walk(group, depth) {
    var out = [];
    if (depth > 24) return out;
    for (var i = 1; i <= group.numProperties; i++) {
      var p = group.property(i);
      if (!p) continue;
      var node = { name: p.name, matchName: p.matchName };
      try { if (p.enabled === false) node.enabled = false; } catch (e) {}
      if (p.propertyType === PropertyType.PROPERTY) {
        if (p.propertyValueType === PropertyValueType.NO_VALUE) continue;
        try { if (!p.canVaryOverTime && p.propertyValueType === PropertyValueType.CUSTOM_VALUE) continue; } catch (e) {}
        try { node.value = valueOf(p, p.value); } catch (e) { node.value = null; }
        try { if (p.expressionEnabled) node.expression = p.expression; } catch (e) {}
        try { if (p.numKeys > 0) { node.keys = keysOf(p); try { node.dimensionsSeparated = p.dimensionsSeparated; } catch (e2) {} } } catch (e) {}
        out.push(node);
      } else {
        node.children = walk(p, depth + 1);
        if (node.children.length) out.push(node);
      }
    }
    return out;
  }

  /* ---------- layers and comps ---------- */
  var comps = {}, order = [];

  function layerType(l) {
    if (l instanceof TextLayer) return "text";
    if (l instanceof ShapeLayer) return "shape";
    if (l instanceof CameraLayer) return "camera";
    if (l instanceof LightLayer) return "light";
    if (l instanceof AVLayer) {
      if (l.nullLayer) return "null";
      if (l.source instanceof CompItem) return "precomp";
      if (l.source && l.source.mainSource instanceof SolidSource) return "solid";
      return "footage";
    }
    return "other";
  }

  function dumpLayer(l) {
    var o = {
      index: l.index, name: l.name, type: layerType(l),
      inPoint: l.inPoint, outPoint: l.outPoint, startTime: l.startTime,
      enabled: l.enabled, parent: l.parent ? l.parent.index : null, label: l.label
    };
    try { o.threeD = l.threeDLayer; } catch (e) {}
    try { o.blendingMode = blendName(l.blendingMode); } catch (e) {}
    try { o.trackMatteType = matteName(l.trackMatteType); } catch (e) {}
    try { o.stretch = l.stretch; } catch (e) {}
    try { o.motionBlur = l.motionBlur; } catch (e) {}
    try { o.timeRemapEnabled = l.timeRemapEnabled; } catch (e) {}
    if (o.type === "precomp") { o.source = "comp:" + l.source.id; dumpComp(l.source); }
    if (o.type === "footage" && l.source) { try { o.file = l.source.file ? l.source.file.fsName : l.source.name; } catch (e) {} }
    if (o.type === "solid") { try { o.solidColor = colorOf(l.source.mainSource.color); o.width = l.source.width; o.height = l.source.height; } catch (e) {} }
    try { var mk = l.property("Marker"); if (mk && mk.numKeys) { o.markers = []; for (var m = 1; m <= mk.numKeys; m++) o.markers.push({ t: mk.keyTime(m), comment: mk.keyValue(m).comment }); } } catch (e) {}
    o.properties = walk(l, 0);
    return o;
  }

  function dumpComp(c) {
    var key = "comp:" + c.id;
    if (comps[key]) return;
    comps[key] = { pending: true };
    var o = {
      id: key, name: c.name, width: c.width, height: c.height, pixelAspect: c.pixelAspect,
      fps: c.frameRate, duration: c.duration, displayStartTime: c.displayStartTime,
      bgColor: colorOf(c.bgColor), motionBlur: c.motionBlur,
      shutterAngle: c.shutterAngle, shutterPhase: c.shutterPhase, layers: []
    };
    for (var i = 1; i <= c.numLayers; i++) o.layers.push(dumpLayer(c.layer(i)));
    comps[key] = o;
    order.push(key);
  }

  /* ---------- run ---------- */
  var comp = null;
  if (MB_COMP_NAME) {
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      if (it instanceof CompItem && it.name === MB_COMP_NAME) { comp = it; break; }
    }
  } else if (app.project.activeItem instanceof CompItem) comp = app.project.activeItem;
  if (!comp) { alert("Motion Builder export: comp not found. Set MB_COMP_NAME or open the comp."); return; }

  var folder = MB_OUT_FOLDER ? new Folder(MB_OUT_FOLDER) : Folder.selectDialog("Folder for ae.json");
  if (!folder) return;
  if (!folder.exists) folder.create();

  dumpComp(comp);
  var list = [];
  for (var k = 0; k < order.length; k++) list.push(comps[order[k]]);
  var doc = {
    format: VERSION, exportedAt: new Date().toString(),
    aeVersion: app.version, project: app.project.file ? app.project.file.fsName : null,
    root: "comp:" + comp.id, comps: list
  };

  var f = new File(folder.fsName + "/ae.json");
  f.encoding = "UTF-8";
  f.open("w");
  f.write(json(doc));
  f.close();
  // No alert when driven by an MCP: leave a result string for the caller.
  $.writeln("mb-export: wrote " + f.fsName + " (" + list.length + " comps)");
})();
