/* Motion Builder v1 anime-ae bake (ES3), copied verbatim from reference/Motion Builder.html.
   Turns sampled motion into AE temporal-bezier keyframes. Loaded as text by bake.ts. Do not edit. */
/*  anime-ae bake  ·  v1.4
    Turns any motion the app can compute into plain After Effects keyframes: no expressions, no controllers.
    A channel (one number over time) is sampled per frame, cut at its natural break points (start/end of
    a phase) and every piece is fitted with AE's own temporal bezier (speed + influence per keyframe).
    When a piece does not fit within tolerance (springs, elastic, bounce, overlaps) it is split where the
    error is largest, so the result is the fewest keyframes that stay within `tol` of the real curve.
    AE model (checked against AE 2026): handles at (t0 + i0*T, v0 + s0*i0*T) and (t1 - i1*T, v1 - s1*i1*T),
    the curve is a cubic bezier in (time, value) space.  ES3: runs in the browser, node and ExtendScript. */
var AnimeAEBake = (function () {

  function bz(a, b, c, d, u) { var m = 1 - u; return m * m * m * a + 3 * m * m * u * b + 3 * m * u * u * c + u * u * u * d; }
  /* value of one AE bezier segment at time t */
  function segValue(t0, v0, s0, i0, t1, v1, s1, i1, t) {
    var T = t1 - t0;
    if (T <= 0) return v1;
    var x1 = t0 + i0 * T, x2 = t1 - i1 * T, y1 = v0 + s0 * i0 * T, y2 = v1 - s1 * i1 * T, lo = 0, hi = 1, u, k;
    if (t <= t0) return v0;
    if (t >= t1) return v1;
    for (k = 0; k < 34; k++) { u = (lo + hi) / 2; if (bz(t0, x1, x2, t1, u) < t) lo = u; else hi = u; }
    return bz(v0, y1, y2, v1, (lo + hi) / 2);
  }
  /* value of a baked key list at time t. key = [t, v, inSpeed, inInf%, outSpeed, outInf%, hold?] (hold = jump at the next key) */
  function valueAt(keys, t) {
    if (!keys.length) return 0;
    if (t <= keys[0][0]) return keys[0][1];
    var n = keys.length, i;
    if (t >= keys[n - 1][0]) return keys[n - 1][1];
    for (i = 0; i < n - 1; i++) if (t < keys[i + 1][0]) break;
    var a = keys[i], b = keys[i + 1];
    if (a[6]) return a[1];
    return segValue(a[0], a[1], a[4], a[5] / 100, b[0], b[1], b[2], b[3] / 100, t);
  }

  /* fit one segment: endpoints fixed, speeds from the curve, influences searched */
  function fitSeg(fn, ta, tb, va, vb, sa, sb, ts) {
    var best = { e: Infinity, i0: 1 / 3, i1: 1 / 3 }, i, j, a, b, e;
    function err(i0, i1) {
      var m = 0, k, d;
      for (k = 0; k < ts.length; k++) { d = Math.abs(segValue(ta, va, sa, i0, tb, vb, sb, i1, ts[k].t) - ts[k].v); if (d > m) m = d; if (m > best.e) return m; }
      return m;
    }
    for (i = 1; i <= 20; i++) for (j = 1; j <= 20; j++) {
      a = i * 0.05; b = j * 0.05; if (a + b > 1.0001) continue;
      e = err(a, b); if (e < best.e) best = { e: e, i0: a, i1: b };
    }
    var c0 = best.i0, c1 = best.i1;
    for (i = -5; i <= 5; i++) for (j = -5; j <= 5; j++) {
      a = c0 + i * 0.01; b = c1 + j * 0.01;
      if (a < 0.001 || b < 0.001 || a + b > 1.0001) continue;
      e = err(a, b); if (e < best.e) best = { e: e, i0: a, i1: b };
    }
    // the worst point, to split at when the fit is not good enough
    var worst = -1, wv = -1, k2, d2;
    for (k2 = 0; k2 < ts.length; k2++) { d2 = Math.abs(segValue(ta, va, sa, best.i0, tb, vb, sb, best.i1, ts[k2].t) - ts[k2].v); if (d2 > wv) { wv = d2; worst = ts[k2].t; } }
    best.e = wv; best.worst = worst;
    return best;
  }

  /* fn(tSeconds) -> number. Returns { value } for a constant channel or { keys: [...] }.
     opts: { t0, t1, fps, tol, breaks: [seconds], maxKeys } */
  function channel(fn, opts) {
    var fps = opts.fps || 30, dt = 1 / fps, t0 = opts.t0 || 0, t1 = opts.t1, tol = opts.tol || 0.1, h = dt / 64;
    var N = Math.max(1, Math.round((t1 - t0) * fps)), k, vals = [], mn = Infinity, mx = -Infinity;
    function snap(t) { return t0 + Math.round((t - t0) * fps) * dt; }
    for (k = 0; k <= N; k++) { vals[k] = fn(t0 + k * dt); if (vals[k] < mn) mn = vals[k]; if (vals[k] > mx) mx = vals[k]; }
    if (mx - mn <= tol * 0.5) return { value: vals[0] };
    // break points: requested phase boundaries + where the channel starts/stops moving
    var bk = {}, list = [], still = tol * 0.02;
    bk[0] = 1; bk[N] = 1;
    if (opts.breaks) for (k = 0; k < opts.breaks.length; k++) { var f = Math.round((opts.breaks[k] - t0) * fps); if (f > 0 && f < N) bk[f] = 1; }
    for (k = 1; k < N; k++) {
      var mvL = Math.abs(vals[k] - vals[k - 1]) > still, mvR = Math.abs(vals[k + 1] - vals[k]) > still;
      if (mvL !== mvR) bk[k] = 1;
    }
    for (k in bk) list.push(+k);
    list.sort(function (a, b) { return a - b; });
    var keysT = [];   // frame indices of keys, refined below
    function slope(t, side) { return side > 0 ? (fn(t + h) - fn(t)) / h : (fn(t) - fn(t - h)) / h; }
    var segs = [];
    for (k = 0; k < list.length - 1; k++) segs.push([list[k], list[k + 1]]);
    var out = [], guard = 0, maxKeys = opts.maxKeys || 400;
    while (segs.length && guard++ < maxKeys) {
      var s = segs.shift(), fa = s[0], fb = s[1], ta = t0 + fa * dt, tb = t0 + fb * dt;
      var va = vals[fa], vb = vals[fb], sa = slope(ta, 1), sb = slope(tb, -1);
      // a still piece: flat keys
      var flat = true, m;
      for (m = fa; m < fb; m++) if (Math.abs(vals[m + 1] - vals[m]) > still) { flat = false; break; }
      if (flat) { out.push({ fa: fa, fb: fb, sa: 0, sb: 0, i0: 1 / 6, i1: 1 / 6 }); continue; }
      var ts = [];
      for (m = fa; m < fb; m++) {
        if (m > fa) ts.push({ t: t0 + m * dt, v: vals[m] });
        ts.push({ t: t0 + (m + 0.5) * dt, v: fn(t0 + (m + 0.5) * dt) });
      }
      var r = fitSeg(fn, ta, tb, va, vb, sa, sb, ts);
      if (r.e > tol && fb - fa === 1 && Math.abs(vb - va) > tol) {
        // a real jump (steps ease): every sub-frame sample sits on one of the two values -> hold key
        var jump = true, z, zv;
        for (z = 1; z < 8; z++) { zv = fn(ta + z * dt / 8); if (Math.abs(zv - va) > tol && Math.abs(zv - vb) > tol) { jump = false; break; } }
        if (jump) { out.push({ fa: fa, fb: fb, sa: 0, sb: 0, i0: 1 / 6, i1: 1 / 6, hold: true }); continue; }
      }
      if (r.e > tol && fb - fa > 1) {
        var mid = Math.round((r.worst - t0) * fps);
        if (mid <= fa || mid >= fb) mid = Math.round((fa + fb) / 2);
        segs.unshift([mid, fb]); segs.unshift([fa, mid]);
        continue;
      }
      out.push({ fa: fa, fb: fb, sa: sa, sb: sb, i0: r.i0, i1: r.i1 });
    }
    out.sort(function (a, b) { return a.fa - b.fa; });
    // segments -> keys
    var keys = [], q;
    for (q = 0; q < out.length; q++) {
      var g = out[q];
      if (!keys.length || Math.round((keys[keys.length - 1][0] - t0) * fps) !== g.fa) keys.push([t0 + g.fa * dt, vals[g.fa], g.sa, g.i0 * 100, g.sa, g.i0 * 100]);
      var last = keys[keys.length - 1]; last[4] = g.sa; last[5] = g.i0 * 100; if (g.hold) last[6] = 1;
      keys.push([t0 + g.fb * dt, vals[g.fb], g.sb, g.i1 * 100, g.sb, g.i1 * 100]);
    }
    // drop keys in the middle of a still run (keep the run's ends)
    var clean = [];
    for (q = 0; q < keys.length; q++) {
      var p = clean[clean.length - 1], nx = keys[q + 1];
      if (p && nx && Math.abs(p[1] - keys[q][1]) < still && Math.abs(nx[1] - keys[q][1]) < still) continue;
      clean.push(keys[q]);
    }
    for (q = 0; q < clean.length; q++) for (k = 0; k < Math.min(6, clean[q].length); k++) clean[q][k] = Math.round(clean[q][k] * 1e5) / 1e5;
    return { keys: clean };
  }

  /* worst difference between the baked keys and the real curve (for tests) */
  function maxError(fn, res, t0, t1, fps) {
    var e = 0, t, d;
    for (t = t0; t <= t1 + 1e-9; t += 1 / (fps * 2)) { d = Math.abs((res.keys ? valueAt(res.keys, t) : res.value) - fn(t)); if (d > e) e = d; }
    return e;
  }

  /* per-channel tolerances (AE units) */
  var TOL = { x: 0.25, y: 0.25, scale: 0.15, rot: 0.05, op: 0.3, blur: 0.15, draw: 0.2, amount: 0.3 };

  return { channel: channel, valueAt: valueAt, segValue: segValue, maxError: maxError, TOL: TOL };
})();
if (typeof module !== 'undefined') module.exports = AnimeAEBake;
