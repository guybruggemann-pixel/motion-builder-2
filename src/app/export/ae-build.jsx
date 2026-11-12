/*  Motion Builder 2.0 -> After Effects  (baked: native layers and keyframes, no expressions)
    File > Scripts > Run Script File... and pick this file. Builds the comps in a "Motion Builder"
    folder: one comp per comp, one precomp per motion asset instance, one layer per drawable.
    ES3 on purpose (ExtendScript). The plan below is generated; keyframe writing follows v1's importer. */
(function () {
  var PLAN = /*@PLAN@*/null;
  if (!PLAN) { alert("Motion Builder: this script has no export in it."); return; }

  function keyEase(speed, infl) { return new KeyframeEase(speed, Math.max(0.1, Math.min(100, infl))); }

  /* one baked channel onto a 1D property (or one dimension group with the same keys) */
  function apply(p, ch, dims) {
    if (!ch) return;
    var n = dims || 1, i, d, vals = [], times = [];
    if (ch.value !== undefined) { p.setValue(n === 1 ? ch.value : rep(ch.value, n)); return; }
    var keys = ch.keys;
    for (i = 0; i < keys.length; i++) { times.push(keys[i][0]); vals.push(n === 1 ? keys[i][1] : rep(keys[i][1], n)); }
    p.setValuesAtTimes(times, vals);
    for (i = 0; i < keys.length; i++) {
      var k = p.nearestKeyIndex(keys[i][0]), ein = [], eout = [];
      for (d = 0; d < n; d++) { ein.push(keyEase(keys[i][2], keys[i][3])); eout.push(keyEase(keys[i][4], keys[i][5])); }
      p.setInterpolationTypeAtKey(k, KeyframeInterpolationType.BEZIER, keys[i][6] ? KeyframeInterpolationType.HOLD : KeyframeInterpolationType.BEZIER);
      try { p.setTemporalEaseAtKey(k, ein, eout); } catch (e1) { try { p.setTemporalEaseAtKey(k, [ein[0]], [eout[0]]); } catch (e2) {} }
    }
  }
  function rep(v, n) { var a = [], i; for (i = 0; i < n; i++) a.push(v); return a; }
  function same(a, b) { return a && b && a.toSource ? a.toSource() === b.toSource() : JSON_like(a) === JSON_like(b); }
  function JSON_like(o) { if (o === null || typeof o !== "object") return String(o); var s = "", k; for (k in o) if (o.hasOwnProperty(k)) s += k + ":" + JSON_like(o[k]) + ";"; return "{" + s + "}"; }

  /* the value of a baked channel at time t (AE bezier segments), for channels AE can't key on their own */
  function bz(a, b, c, d, u) { var m = 1 - u; return m * m * m * a + 3 * m * m * u * b + 3 * m * u * u * c + u * u * u * d; }
  function valueAt(ch, t) {
    if (ch.value !== undefined) return ch.value;
    var K = ch.keys, n = K.length, i;
    if (t <= K[0][0]) return K[0][1];
    if (t >= K[n - 1][0]) return K[n - 1][1];
    for (i = 0; i < n - 1; i++) if (t < K[i + 1][0]) break;
    var a = K[i], b = K[i + 1], T = b[0] - a[0];
    if (a[6] || T <= 0) return a[1];
    var x1 = a[0] + a[5] / 100 * T, x2 = b[0] - b[3] / 100 * T, y1 = a[1] + a[4] * a[5] / 100 * T, y2 = b[1] - b[2] * b[3] / 100 * T, lo = 0, hi = 1, u, k;
    for (k = 0; k < 34; k++) { u = (lo + hi) / 2; if (bz(a[0], x1, x2, b[0], u) < t) lo = u; else hi = u; }
    return bz(a[1], y1, y2, b[1], (lo + hi) / 2);
  }
  function times(chs) {
    var seen = {}, out = [], i, j, t;
    for (i = 0; i < chs.length; i++) if (chs[i] && chs[i].keys) for (j = 0; j < chs[i].keys.length; j++) { t = chs[i].keys[j][0]; if (!seen[t]) { seen[t] = 1; out.push(t); } }
    out.sort(function (a, b) { return a - b; });
    return out;
  }
  /* two channels onto one 2D/3D property: shared keys when they match, else every key time of either (linear) */
  function apply2(p, cx, cy, extra) {
    if (!cx || !cy) return;
    var n = p.value.length;
    function v(t) { var a = [valueAt(cx, t), valueAt(cy, t)]; if (n > 2) a.push(extra === undefined ? 100 : extra); return a; }
    if (cx.value !== undefined && cy.value !== undefined) { p.setValue(v(0)); return; }
    if (same(cx, cy)) {
      var dims = [], i;
      if (cx.value !== undefined) { p.setValue(v(0)); return; }
      var keys = cx.keys, ts = [], vs = [];
      for (i = 0; i < keys.length; i++) { ts.push(keys[i][0]); vs.push(v(keys[i][0])); }
      p.setValuesAtTimes(ts, vs);
      for (i = 0; i < keys.length; i++) {
        var k = p.nearestKeyIndex(keys[i][0]), ein = [], eout = [], d;
        for (d = 0; d < n; d++) { ein.push(keyEase(d < 2 ? keys[i][2] : 0, keys[i][3])); eout.push(keyEase(d < 2 ? keys[i][4] : 0, keys[i][5])); }
        p.setInterpolationTypeAtKey(k, KeyframeInterpolationType.BEZIER, keys[i][6] ? KeyframeInterpolationType.HOLD : KeyframeInterpolationType.BEZIER);
        try { p.setTemporalEaseAtKey(k, ein, eout); } catch (e3) {}
      }
      return;
    }
    var all = times([cx, cy]), vals = [];
    for (var j = 0; j < all.length; j++) vals.push(v(all[j]));
    p.setValuesAtTimes(all, vals);
  }

  function textLayer(C, t) {
    var L = C.layers.addText(t.str), prop = L.property("ADBE Text Properties").property("ADBE Text Document"), td = prop.value;
    try { td.resetCharStyle(); } catch (e0) {}
    td.text = t.str; try { td.font = t.font; } catch (e1) {}
    td.fontSize = t.size; td.applyFill = true; td.fillColor = t.fill; td.applyStroke = false; td.tracking = t.tracking;
    td.justification = ParagraphJustification.LEFT_JUSTIFY;
    prop.setValue(td);
    return L;
  }

  function shapeLayer(C, s, l) {
    var L = C.layers.addShape(), root = L.property("ADBE Root Vectors Group"), g = root.addProperty("ADBE Vector Group"), V = g.property("ADBE Vectors Group");
    g.name = s.type === "ellipse" ? "Ellipse" : "Rectangle";
    var prim = V.addProperty(s.type === "ellipse" ? "ADBE Vector Shape - Ellipse" : "ADBE Vector Shape - Rect");
    var size = prim.property(s.type === "ellipse" ? "ADBE Vector Ellipse Size" : "ADBE Vector Rect Size");
    var pos = prim.property(s.type === "ellipse" ? "ADBE Vector Ellipse Position" : "ADBE Vector Rect Position");
    if (s.type !== "ellipse") prim.property("ADBE Vector Rect Roundness").setValue(s.radius);
    apply2(size, l.ch.w, l.ch.h);
    // drawn from the layer origin, like the doc: the shape's centre follows half its size
    apply2(pos, half(l.ch.w), half(l.ch.h));
    if (s.fill) { var f = V.addProperty("ADBE Vector Graphic - Fill"); f.property("ADBE Vector Fill Color").setValue(s.fill); f.property("ADBE Vector Fill Opacity").setValue(s.fillOpacity); }
    if (s.stroke) { var k = V.addProperty("ADBE Vector Graphic - Stroke"); k.property("ADBE Vector Stroke Color").setValue(s.stroke); k.property("ADBE Vector Stroke Width").setValue(s.strokeWidth); }
    return L;
  }
  function half(ch) {
    if (!ch) return ch;
    if (ch.value !== undefined) return { value: ch.value / 2 };
    var k = [], i;
    for (i = 0; i < ch.keys.length; i++) { var a = ch.keys[i]; k.push([a[0], a[1] / 2, a[2] / 2, a[3], a[4] / 2, a[5], a[6]]); }
    return { keys: k };
  }

  function mask(L, m) {
    var M = L.property("ADBE Mask Parade").addProperty("ADBE Mask Atom"), P = M.property("ADBE Mask Shape"), i;
    for (i = 0; i < m.length; i++) {
      var s = new Shape(); s.vertices = [[m[i][1], m[i][2]], [m[i][3], m[i][2]], [m[i][3], m[i][4]], [m[i][1], m[i][4]]]; s.closed = true;
      if (m.length === 1) P.setValue(s); else P.setValueAtTime(m[i][0], s);
    }
    if (m.length > 1) for (i = 1; i <= P.numKeys; i++) P.setInterpolationTypeAtKey(i, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
  }

  app.beginUndoGroup("Motion Builder import");
  var proj = app.project || app.newProject(), folder = proj.items.addFolder("Motion Builder"), made = {}, c, l, i, j, C;
  for (i = 0; i < PLAN.comps.length; i++) {
    c = PLAN.comps[i];
    C = proj.items.addComp(c.name, c.width, c.height, 1, c.duration, c.fps);
    C.parentFolder = folder;
    if (c.bg) C.bgColor = c.bg;
    made[c.id] = C;
    for (j = 0; j < c.layers.length; j++) {
      l = c.layers[j];
      var L = l.kind === "text" ? textLayer(C, l.text) : l.kind === "precomp" ? C.layers.add(made[l.precomp]) : shapeLayer(C, l.shape, l);
      L.name = l.name;
      if (l.kind === "precomp") L.startTime = l.start || 0;
      var tr = L.property("ADBE Transform Group");
      tr.property("ADBE Anchor Point").setValue([0, 0]);
      tr.property("ADBE Position").dimensionsSeparated = true;
      apply(tr.property("ADBE Position_0"), l.ch.x);
      apply(tr.property("ADBE Position_1"), l.ch.y);
      apply2(tr.property("ADBE Scale"), l.ch.sx, l.ch.sy, 100);
      apply(tr.property("ADBE Rotate Z"), l.ch.rot);
      apply(tr.property("ADBE Opacity"), l.ch.op);
      if (l.ch.blur && (l.ch.blur.keys || l.ch.blur.value > 0.01)) {
        var fx = L.property("ADBE Effect Parade").addProperty("ADBE Gaussian Blur 2");
        apply(fx.property("ADBE Gaussian Blur 2-0001"), l.ch.blur);
        try { fx.property("ADBE Gaussian Blur 2-0003").setValue(1); } catch (e5) {}   // repeat edge pixels off
      }
      if (l.mask) mask(L, l.mask);
      L.inPoint = Math.max(L.startTime, l["in"]);
      L.outPoint = Math.max(L.inPoint + C.frameDuration, l.out);
    }
  }
  app.endUndoGroup();
  try { C.openInViewer(); } catch (e6) {}
})();
