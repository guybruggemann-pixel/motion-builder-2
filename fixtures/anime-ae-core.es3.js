/*  anime-ae core  ·  v0.1
    Easing + stagger math ported from anime.js v4.5 (MIT, Julian Garnier).
    Written in ES3 on purpose: the same file runs in
      - the browser (preview page),
      - After Effects expressions (embedded by the compiler),
      - ExtendScript (if you ever run it as a .jsx).
    Times are in milliseconds, like anime.js. Divide by 1000 for AE seconds.
*/
var AnimeAE = (function () {
  var PI = Math.PI, HALF_PI = PI / 2, TAU = PI * 2, MIN = 1e-11;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v, d) { return (v === undefined || v === null || v === '') ? d : +v; }
  function linear(t) { return t; }

  /* ---------- ease-in building blocks (anime.js parser.js) ---------- */
  function powerIn(p) { p = num(p, 1.68); return function (t) { return Math.pow(t, p); }; }
  var IN = {
    Quad: powerIn(2), Cubic: powerIn(3), Quart: powerIn(4), Quint: powerIn(5),
    Sine: function (t) { return 1 - Math.cos(t * HALF_PI); },
    Circ: function (t) { return 1 - Math.sqrt(1 - t * t); },
    Expo: function (t) { return t ? Math.pow(2, 10 * t - 10) : 0; },
    Bounce: function (t) {
      var p2, b = 4;
      while (t < ((p2 = Math.pow(2, --b)) - 1) / 11) {}
      return 1 / Math.pow(4, 3 - b) - 7.5625 * Math.pow((p2 * 3 - 2) / 22 - t, 2);
    }
  };
  var IN_PARAM = {
    '': function (p) { return powerIn(p); },
    Back: function (o) { o = num(o, 1.7); return function (t) { return (o + 1) * t * t * t - o * t * t; }; },
    Elastic: function (amp, per) {
      var a = clamp(num(amp, 1), 1, 10), p = clamp(num(per, 0.3), MIN, 2);
      var s = (p / TAU) * Math.asin(1 / a), e = TAU / p;
      return function (t) { return t === 0 || t === 1 ? t : -a * Math.pow(2, -10 * (1 - t)) * Math.sin(((1 - t) - s) * e); };
    }
  };
  var TYPES = {
    'in': function (f) { return function (t) { return f(t); }; },
    out: function (f) { return function (t) { return 1 - f(1 - t); }; },
    inOut: function (f) { return function (t) { return t < 0.5 ? f(t * 2) / 2 : 1 - f(t * -2 + 2) / 2; }; },
    outIn: function (f) { return function (t) { return t < 0.5 ? (1 - f(1 - t * 2)) / 2 : (f(t * 2 - 1) + 1) / 2; }; }
  };

  /* ---------- cubicBezier (anime.js cubic-bezier) ---------- */
  function cubicBezier(x1, y1, x2, y2) {
    x1 = num(x1, 0.5); y1 = num(y1, 0); x2 = num(x2, 0.5); y2 = num(y2, 1);
    if (x1 === y1 && x2 === y2) return linear;
    function calc(t, a1, a2) { return (((1 - 3 * a2 + 3 * a1) * t + (3 * a2 - 6 * a1)) * t + (3 * a1)) * t; }
    return function (x) {
      if (x === 0 || x === 1) return x;
      var a = 0, b = 1, cx, ct, i = 0;
      do { ct = a + (b - a) / 2; cx = calc(ct, x1, x2) - x; if (cx > 0) b = ct; else a = ct; }
      while (Math.abs(cx) > 1e-7 && ++i < 100);
      return calc(ct, y1, y2);
    };
  }

  /* ---------- steps ---------- */
  function steps(n, fromStart) {
    n = num(n, 10);
    return function (t) { var v = clamp(t, 0, 1) * n; return (fromStart ? Math.ceil(v) : Math.floor(v)) / n; };
  }

  /* ---------- spring (anime.js Spring class, perceived-duration mode) ---------- */
  function spring(o) {
    o = o || {};
    var m = num(o.mass, 1), s = num(o.stiffness, 100), d = num(o.damping, 10), v = num(o.velocity, 0);
    if (o.bounce !== undefined || o.duration !== undefined) {
      var bn = clamp(num(o.bounce, 0.5), -1, 1), pds = num(o.duration, 628) / 1000;
      m = 1; v = 0; s = Math.pow(TAU / pds, 2);
      d = bn >= 0 ? ((1 - bn) * 4 * PI) / pds : (4 * PI) / (pds * (1 + bn));
      s = Math.round(clamp(s, MIN, 10000) * 1000) / 1000;
      d = Math.round(clamp(d, MIN, 300) * 1000) / 1000;
    }
    var w0 = clamp(Math.sqrt(s / m), MIN, 1000), z = d / (2 * Math.sqrt(s * m)), wd, b;
    if (z < 1) { wd = w0 * Math.sqrt(1 - z * z); b = (z * w0 - v) / wd; }
    else if (z === 1) { wd = 0; b = -v + w0; }
    else { wd = w0 * Math.sqrt(z * z - 1); b = (z * w0 - v) / wd; }
    function solve(t) {
      var r;
      if (z < 1) r = Math.exp(-t * z * w0) * (Math.cos(wd * t) + b * Math.sin(wd * t));
      else if (z === 1) r = (1 + b * t) * Math.exp(-t * w0);
      else r = ((1 + b) * Math.exp((-z * w0 + wd) * t) + (1 - b) * Math.exp((-z * w0 - wd) * t)) / 2;
      return 1 - r;
    }
    var st = 0, rest = 0, it = 0, sd = 0;
    while (rest <= 10 && it <= 3000000) {
      if (Math.abs(1 - solve(st)) < 0.0005) rest++; else rest = 0;
      sd = st; st += 0.02; it++;
    }
    var f = function (t) { return t === 0 || t === 1 ? t : solve(t * sd); };
    f.settlingDuration = Math.round(sd * 1000); // ms — anime.js uses this as the tween duration
    return f;
  }

  /* ---------- string parser: "outElastic(1, .5)", "cubicBezier(.2,0,0,1)", "spring(.5, 600)" ---------- */
  var cache = {};
  function ease(name) {
    if (typeof name === 'function') return name;
    if (!name || name === 'linear' || name === 'none') return linear;
    if (name === 'hold') return function () { return 0; };
    if (cache[name]) return cache[name];
    var str = String(name).replace(/\s+/g, ''), args = [], base = str, p = str.indexOf('(');
    if (p !== -1) { base = str.slice(0, p); args = str.slice(p + 1, -1).split(','); }
    var fn = null;
    if (base === 'cubicBezier') fn = cubicBezier(args[0], args[1], args[2], args[3]);
    else if (base === 'steps') fn = steps(args[0], args[1] === 'true' || args[1] === '1');
    else if (base === 'spring') fn = spring({ bounce: num(args[0], 0.5), duration: num(args[1], 628) });
    else {
      var types = ['inOut', 'outIn', 'in', 'out'];
      for (var i = 0; i < types.length && !fn; i++) {
        var ty = types[i];
        if (base.indexOf(ty) === 0) {
          var key = base.slice(ty.length);
          if (IN[key]) fn = TYPES[ty](IN[key]);
          else if (IN_PARAM[key]) fn = TYPES[ty](IN_PARAM[key](args[0], args[1]));
        }
      }
    }
    if (!fn) fn = linear;
    cache[name] = fn;
    return fn;
  }

  /* ---------- stagger (anime.js utils/stagger.js, index + grid modes) ----------
     stagger(value | [from, to], { start, from: 'first'|'center'|'last'|'random'|index|[fx,fy],
                                   reversed, ease, grid: [cols, rows], axis: 'x'|'y', seed })
     returns function (index, total) -> ms                                              */
  function stagger(val, o) {
    o = o || {};
    var isRange = val instanceof Array, v1 = isRange ? +val[0] : +val, v2 = isRange ? +val[1] : 0;
    var start = o.start ? +o.start : (isRange ? v1 : 0), from = o.from === undefined ? 'first' : o.from;
    var grid = o.grid, axis = o.axis, sEase = o.ease ? ease(o.ease) : null;
    return function (i, total) {
      var fromIndex = from === 'center' ? (total - 1) / 2 : from === 'last' ? total - 1 : (typeof from === 'number' ? from : 0);
      var values = [], k, maxV;
      for (k = 0; k < total; k++) {
        if (!grid) { values.push(Math.abs(fromIndex - k)); continue; }
        var fx, fy;
        if (from instanceof Array) { fx = from[0] * (grid[0] - 1); fy = from[1] * (grid[1] - 1); }
        else if (from === 'center') { fx = (grid[0] - 1) / 2; fy = (grid[1] - 1) / 2; }
        else { fx = fromIndex % grid[0]; fy = Math.floor(fromIndex / grid[0]) % grid[1]; }
        var dx = fx - k % grid[0], dy = fy - Math.floor(k / grid[0]) % grid[1];
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (axis === 'x') dist = -dx;
        if (axis === 'y') dist = -dy;
        values.push(dist);
      }
      maxV = values[0];
      for (k = 1; k < total; k++) if (values[k] > maxV) maxV = values[k];
      for (k = 0; k < total; k++) {
        var x = values[k];
        if (sEase && maxV) x = sEase(x / maxV) * maxV;
        if (o.reversed) x = axis ? -x : Math.abs(maxV - x);
        values[k] = x;
      }
      if (from === 'random') { // deterministic shuffle so AE and preview match
        var seed = num(o.seed, 1);
        for (k = values.length - 1; k > 0; k--) {
          seed = (seed * 16807) % 2147483647;
          var j = seed % (k + 1), tmp = values[k]; values[k] = values[j]; values[j] = tmp;
        }
      }
      var spacing = isRange ? (v2 - v1) / (maxV || 1) : v1;
      return start + spacing * (Math.round(values[i] * 100) / 100);
    };
  }

  /* ---------- timeline position parser ('+=200', '-=200', '<', '<<', '<<+=100', 500) ---------- */
  function position(pos, prevStart, prevEnd, tlEnd) {
    if (pos === undefined || pos === null) return tlEnd;
    if (typeof pos === 'number') return pos;
    var s = String(pos), base = tlEnd, rest = s;
    if (s.indexOf('<<') === 0) { base = prevStart; rest = s.slice(2); }
    else if (s.indexOf('<') === 0) { base = prevEnd; rest = s.slice(1); }
    if (rest.indexOf('+=') === 0) return base + +rest.slice(2);
    if (rest.indexOf('-=') === 0) return base - +rest.slice(2);
    if (rest === '') return base;
    return +rest;
  }

  var NAMES = [];
  (function () {
    var ty = ['in', 'out', 'inOut', 'outIn'], k = ['Quad', 'Cubic', 'Quart', 'Quint', 'Sine', 'Circ', 'Expo', 'Back', 'Elastic', 'Bounce'];
    for (var a = 0; a < k.length; a++) for (var b = 0; b < ty.length; b++) NAMES.push(ty[b] + k[a]);
  })();

  return { ease: ease, cubicBezier: cubicBezier, steps: steps, spring: spring, stagger: stagger, position: position, names: NAMES };
})();
