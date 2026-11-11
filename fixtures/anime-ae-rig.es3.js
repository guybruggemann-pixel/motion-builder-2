/* Motion Builder v1 anime-ae rig (ES3), extracted verbatim from reference/Motion Builder.html.
   Fixture for test/phase-parity.test.ts: the Phase node must match AnimeAERig.compute. Do not edit. */
/*  anime-ae rig  ·  v1.1
    The animate-in / animate-out rig used for explainer work (pop-ups, bullets, UI).
    One spec drives three places, so they always agree:
      - the Motion Builder page (sliders + preview),
      - the AE expression library (controller null -> expressions),
      - the AE panel (creates the controller effects).
    ES3 on purpose. Needs AnimeAE (core) for the math.

    Timing in AE: the In animation starts at the layer's in point (+ its stagger delay);
    the Out animation finishes at the layer's out point (minus its stagger delay).
    Trim a layer in the timeline and the animation moves with it.

    v1.1 adds (ideas from GSAP / Motion, rebuilt on our own math):
      custom cubic-bezier ease, stagger "total" mode and "edges", draw-on (Trim Paths),
      text split by characters / words / lines, number count-up, ease-name import.     */
var AnimeAERig = (function () {
  var A = (typeof AnimeAE !== 'undefined') ? AnimeAE : null;
  var VERSION = 1.1;

  /* dropdown lists: APPEND ONLY. AE stores the 1-based index. */
  var EASES = ['linear', 'outQuad', 'outCubic', 'outQuart', 'outQuint', 'outExpo', 'outCirc', 'outSine',
    'outBack', 'outElastic', 'spring', 'outBounce',
    'inOutQuad', 'inOutCubic', 'inOutQuart', 'inOutExpo', 'inOutSine', 'inOutBack',
    'inQuad', 'inCubic', 'inQuart', 'inExpo', 'inSine', 'inCirc', 'inBack', 'custom'];
  var AMOUNT_EASES = { outBack: 1, outElastic: 1, spring: 1, inOutBack: 1, inBack: 1 };
  var FROM = ['first', 'last', 'center', 'random', 'edges'];
  var AXIS = ['both', 'x', 'y'];
  var STAGGER_MODE = ['each', 'total'];
  var SPLIT = ['layer', 'characters', 'words', 'lines'];

  /* per-phase controls. ae = effect name suffix (ASCII only, ExtendScript-safe). Order = effect order. */
  var CONTROLS = [
    { key: 'on', ae: 'On', type: 'checkbox', label: 'Enabled', def: [true, true] },
    { key: 'duration', ae: 'Duration (ms)', type: 'slider', min: 0, max: 3000, step: 10, label: 'Duration', def: [600, 400] },
    { key: 'ease', ae: 'Ease', type: 'dropdown', items: EASES, label: 'Ease', def: ['outExpo', 'inCubic'] },
    { key: 'amount', ae: 'Overshoot / Bounce', type: 'slider', min: 0, max: 100, step: 1, label: 'Overshoot / bounce', def: [40, 40] },
    { key: 'bx1', ae: 'Custom Ease X1', type: 'slider', min: 0, max: 1, step: 0.01, label: 'x1', def: [0.2, 0.4] },
    { key: 'by1', ae: 'Custom Ease Y1', type: 'slider', min: -1, max: 2, step: 0.01, label: 'y1', def: [0, 0] },
    { key: 'bx2', ae: 'Custom Ease X2', type: 'slider', min: 0, max: 1, step: 0.01, label: 'x2', def: [0, 1] },
    { key: 'by2', ae: 'Custom Ease Y2', type: 'slider', min: -1, max: 2, step: 0.01, label: 'y2', def: [1, 1] },
    { key: 'stagger', ae: 'Stagger (ms)', type: 'slider', min: 0, max: 2000, step: 5, label: 'Stagger', def: [0, 0] },
    { key: 'staggerMode', ae: 'Stagger Mode', type: 'dropdown', items: STAGGER_MODE, label: 'Stagger is', def: ['each', 'each'] },
    { key: 'from', ae: 'Stagger From', type: 'dropdown', items: FROM, label: 'Stagger from', def: ['first', 'first'] },
    { key: 'x', ae: 'Move X (px)', type: 'slider', min: -1200, max: 1200, step: 1, label: 'Move X', def: [0, 0] },
    { key: 'y', ae: 'Move Y (px)', type: 'slider', min: -1200, max: 1200, step: 1, label: 'Move Y', def: [40, 0] },
    { key: 'scale', ae: 'Scale (%)', type: 'slider', min: 0, max: 300, step: 1, label: 'Scale', def: [100, 100] },
    { key: 'axis', ae: 'Scale Axis', type: 'dropdown', items: AXIS, label: 'Scale axis', def: ['both', 'both'] },
    { key: 'rotate', ae: 'Rotate (deg)', type: 'slider', min: -360, max: 360, step: 1, label: 'Rotate', def: [0, 0] },
    { key: 'opacity', ae: 'Opacity (%)', type: 'slider', min: 0, max: 100, step: 1, label: 'Opacity', def: [0, 0] },
    { key: 'blur', ae: 'Blur (px)', type: 'slider', min: 0, max: 120, step: 1, label: 'Blur', def: [0, 0] },
    { key: 'draw', ae: 'Draw (%)', type: 'slider', min: 0, max: 100, step: 1, label: 'Draw', def: [100, 100] }
  ];
  /* controls that belong to the whole rig, not to In or Out */
  var GLOBALS = [
    { key: 'split', ae: 'Text: Split By', type: 'dropdown', items: SPLIT, label: 'Split text by', def: 'layer' },
    { key: 'count', ae: 'Text: Count Up', type: 'checkbox', label: 'Count numbers up', def: false },
    { key: 'countFrom', ae: 'Text: Count From', type: 'slider', min: -100000, max: 100000, step: 1, label: 'Count from', def: 0 }
  ];
  var PHASES = [{ key: 'in', ae: 'In' }, { key: 'out', ae: 'Out' }];
  var NAMES = { controller: 'AA Controller', index: 'AA Index', count: 'AA Count', blur: 'AA Blur', trim: 'AA Draw',
    animIn: 'AA In', animOut: 'AA Out' };
  function effectName(phase, ctl) { return phase ? phase.ae + ': ' + ctl.ae : ctl.ae; }

  function defaults() {
    var p = { 'in': {}, out: {} }, i, c;
    for (i = 0; i < CONTROLS.length; i++) { c = CONTROLS[i]; p['in'][c.key] = c.def[0]; p.out[c.key] = c.def[1]; }
    for (i = 0; i < GLOBALS.length; i++) p[GLOBALS[i].key] = GLOBALS[i].def;
    return p;
  }
  /* fill missing keys (older presets) */
  function normalize(src) {
    var p = defaults(), k, ph;
    src = src || {};
    p.name = src.name || 'Rig';
    for (var i = 0; i < PHASES.length; i++) {
      ph = PHASES[i].key;
      if (src[ph]) for (k in src[ph]) if (src[ph].hasOwnProperty(k)) p[ph][k] = src[ph][k];
      if (p[ph].ease && indexOf(EASES, p[ph].ease) === -1) {
        var conv = importEase(p[ph].ease);
        for (k in conv) p[ph][k] = conv[k];
      }
    }
    for (i = 0; i < GLOBALS.length; i++) if (src[GLOBALS[i].key] !== undefined) p[GLOBALS[i].key] = src[GLOBALS[i].key];
    if (src.picker) p.picker = src.picker;   // scroll-wheel settings (see anime-ae-picker.js)
    return p;
  }
  function indexOf(a, v) { for (var i = 0; i < a.length; i++) if (a[i] === v) return i; return -1; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ease name + params -> anime ease string */
  function easeString(ph) {
    var name = ph.ease, a = ph.amount === undefined ? 40 : +ph.amount;
    if (name === 'outBack' || name === 'inBack' || name === 'inOutBack') return name + '(' + (a / 25).toFixed(3) + ')';
    if (name === 'outElastic') return 'outElastic(1,' + (0.6 - 0.45 * a / 100).toFixed(3) + ')';
    if (name === 'spring') return 'spring(' + (a / 100).toFixed(3) + ',628)';
    if (name === 'custom') return 'cubicBezier(' + [ph.bx1, ph.by1, ph.bx2, ph.by2].join(',') + ')';
    return name;
  }

  /* GSAP / Motion / CSS ease names -> rig fields. Returns null when it is not recognised. */
  function importEase(s) {
    var str = String(s).replace(/\s+/g, ''), m, k;
    var bez = function (a, b, c, d) { return { ease: 'custom', bx1: +a, by1: +b, bx2: +c, by2: +d }; };
    if ((m = /^cubic-?bezier\(([^,]+),([^,]+),([^,]+),([^)]+)\)$/i.exec(str))) return bez(m[1], m[2], m[3], m[4]);
    if ((m = /^\[?([\d.\-]+),([\d.\-]+),([\d.\-]+),([\d.\-]+)\]?$/.exec(str))) return bez(m[1], m[2], m[3], m[4]);
    var css = { ease: [0.25, 0.1, 0.25, 1], 'ease-in': [0.42, 0, 1, 1], 'ease-out': [0, 0, 0.58, 1], 'ease-in-out': [0.42, 0, 0.58, 1],
      easeIn: [0.42, 0, 1, 1], easeOut: [0, 0, 0.58, 1], easeInOut: [0.42, 0, 0.58, 1] };
    if (css[str]) return bez(css[str][0], css[str][1], css[str][2], css[str][3]);
    if (str === 'linear' || str === 'none' || str === 'power0' || /^power0\./.test(str)) return { ease: 'linear' };
    // GSAP: power1-4 / quad cubic quart quint / sine circ expo back elastic bounce, with .in .out .inOut
    var fam = { power1: 'Quad', quad: 'Quad', power2: 'Cubic', cubic: 'Cubic', power3: 'Quart', quart: 'Quart', power4: 'Quint', quint: 'Quint', strong: 'Quint',
      sine: 'Sine', circ: 'Circ', expo: 'Expo', back: 'Back', elastic: 'Elastic', bounce: 'Bounce' };
    if ((m = /^([a-z]+\d?)(?:\.(in|out|inOut))?(?:\(([^)]*)\))?$/.exec(str)) && fam[m[1]]) {
      var dir = m[2] || 'out', F = fam[m[1]], args = m[3] ? m[3].split(',') : [];
      if (F === 'Bounce') return { ease: dir === 'out' ? 'outBounce' : 'outBounce' };
      if (F === 'Elastic') return { ease: 'outElastic', amount: Math.round(clamp((0.6 - (args[1] ? +args[1] : 0.3)) / 0.45 * 100, 0, 100)) };
      if (F === 'Back') return { ease: dir === 'in' ? 'inBack' : dir === 'inOut' ? 'inOutBack' : 'outBack', amount: Math.round(clamp((args[0] ? +args[0] : 1.7) * 25, 0, 100)) };
      if (F === 'Circ' && dir === 'inOut') return bez(0.85, 0, 0.15, 1);
      k = dir + F;
      var near = { inOutQuint: 'inOutQuart', inQuint: 'inQuart', inOutCirc: null, outIn: null };
      if (indexOf(EASES, k) !== -1) return { ease: k };
      if (near[k]) return { ease: near[k] };
      if (k === 'inOutCirc') return bez(0.85, 0, 0.15, 1);
      return null;
    }
    // Motion / anime style: circInOut, backOut, easeOutExpo, outExpo, anticipate
    if (str === 'anticipate') return { ease: 'inOutBack', amount: 50 };
    if ((m = /^(?:ease)?(in|out|inOut)?(Quad|Cubic|Quart|Quint|Sine|Circ|Expo|Back|Elastic|Bounce)(In|Out|InOut)?$/i.exec(str))) {
      var d2 = (m[1] || (m[3] ? m[3].charAt(0).toLowerCase() + m[3].slice(1) : 'out')), F2 = m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase();
      if (F2 === 'Back') return { ease: d2 === 'in' ? 'inBack' : d2 === 'inOut' ? 'inOutBack' : 'outBack', amount: 42 };
      if (F2 === 'Elastic') return { ease: 'outElastic', amount: 67 };
      if (F2 === 'Bounce') return { ease: 'outBounce' };
      k = d2 + F2;
      return indexOf(EASES, k) !== -1 ? { ease: k } : (F2 === 'Circ' ? bez(0.85, 0, 0.15, 1) : null);
    }
    // Motion physical spring: "spring(stiffness,damping,mass)"
    if ((m = /^spring\(([\d.]+),([\d.]+),?([\d.]*)\)$/.exec(str)) && +m[1] > 5) return springToRig(+m[1], +m[2], m[3] ? +m[3] : 1);
    return null;
  }
  /* Motion / Framer physical spring (stiffness, damping, mass) -> rig spring bounce + a sensible duration */
  function springToRig(k, d, m) {
    var zeta = d / (2 * Math.sqrt(k * m)), bounce = zeta <= 1 ? 1 - zeta : 0;
    var f = A ? A.spring({ stiffness: k, damping: d, mass: m }) : null;
    return { ease: 'spring', amount: Math.round(clamp(bounce, 0, 1) * 100), duration: f ? Math.min(3000, f.settlingDuration) : 800 };
  }

  /* stagger delays (ms) for every index */
  function delays(ph, n) {
    var out = [], i, v = +ph.stagger || 0, total = ph.staggerMode === 'total';
    if (ph.from === 'edges') {
      var mx = Math.floor((n - 1) / 2) || 1;
      for (i = 0; i < n; i++) { var e = Math.min(i, n - 1 - i); out.push(total ? v * e / mx : v * e); }
      return out;
    }
    var st = total ? A.stagger([0, v], { from: ph.from }) : A.stagger(v, { from: ph.from });
    for (i = 0; i < n; i++) out.push(n > 1 ? st(i, n) : 0);
    return out;
  }

  /* raw phase factors at time t: kin = remaining in (1 -> 0), kout = progress out (0 -> 1) */
  function factors(p, idx, n, t, inPt, outPt) {
    var f = { kin: 0, kout: 0, pin: 1 }, ph, d, start, u, e;
    ph = p['in'];
    if (ph && ph.on) {
      d = delays(ph, n)[idx] || 0; start = inPt + d;
      u = ph.duration > 0 ? clamp((t - start) / ph.duration, 0, 1) : (t >= start ? 1 : 0);
      e = A.ease(easeString(ph))(u); f.kin = 1 - e; f.pin = e;
    }
    ph = p.out;
    if (ph && ph.on) {
      var ds = delays(ph, n), maxD = 0, i;
      for (i = 0; i < n; i++) maxD = Math.max(maxD, ds[i]);
      var end = outPt - (maxD - (ds[idx] || 0));
      start = end - ph.duration;
      u = ph.duration > 0 ? clamp((t - start) / ph.duration, 0, 1) : (t >= end ? 1 : 0);
      f.kout = A.ease(easeString(ph))(u);
    }
    return f;
  }

  /* the layer state at time t (ms) */
  function compute(p, idx, n, t, inPt, outPt) {
    var f = factors(p, idx, n, t, inPt, outPt), r = { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, op: 1, blur: 0, draw: 1, pin: f.pin, kin: f.kin, kout: f.kout }, s, ph;
    ph = p['in'];
    if (ph && ph.on) {
      var k = f.kin, e = 1 - k;
      r.dx += k * ph.x; r.dy += k * ph.y; r.rot += k * ph.rotate;
      s = ph.scale / 100 + (1 - ph.scale / 100) * e;
      if (ph.axis !== 'y') r.sx *= s;
      if (ph.axis !== 'x') r.sy *= s;
      r.op *= clamp(ph.opacity / 100 + (1 - ph.opacity / 100) * e, 0, 1);
      r.blur += Math.max(0, k) * ph.blur;
      r.draw = (ph.draw === undefined ? 100 : ph.draw) / 100 * k + e;
    }
    ph = p.out;
    if (ph && ph.on) {
      var o = f.kout;
      r.dx += o * ph.x; r.dy += o * ph.y; r.rot += o * ph.rotate;
      s = 1 + (ph.scale / 100 - 1) * o;
      if (ph.axis !== 'y') r.sx *= s;
      if (ph.axis !== 'x') r.sy *= s;
      r.op *= clamp(1 + (ph.opacity / 100 - 1) * o, 0, 1);
      r.blur += Math.max(0, o) * ph.blur;
      r.draw *= 1 + ((ph.draw === undefined ? 100 : ph.draw) / 100 - 1) * o;
    }
    r.draw = clamp(r.draw, 0, 1);
    return r;
  }

  /* timing summary for timelines: [{inStart,inEnd,outStart,outEnd}] in ms */
  function timing(p, n, inPt, outPt) {
    var out = [], i, dIn = delays(p['in'], n), dOut = delays(p.out, n), maxD = 0;
    for (i = 0; i < n; i++) maxD = Math.max(maxD, dOut[i]);
    for (i = 0; i < n; i++) {
      var a = inPt + dIn[i], b = outPt - (maxD - dOut[i]);
      out.push({ inStart: a, inEnd: a + (p['in'].on ? p['in'].duration : 0), outStart: b - (p.out.on ? p.out.duration : 0), outEnd: b, inOn: !!p['in'].on, outOn: !!p.out.on });
    }
    return out;
  }

  /* ---------- count-up: "€ 2,400.50 /mo" counts from `from` to 2400.50, keeping prefix, suffix and format ---------- */
  function parseNumber(text) {
    var str = String(text), re = /-?\d{1,3}(?:[\u00a0 .,]\d{3}(?!\d))+(?:[.,]\d+)?|-?\d+(?:[.,]\d+)?/g, m = null, mm;
    while ((mm = re.exec(str))) if (!m || mm[0].replace(/\D/g, '').length > m[0].replace(/\D/g, '').length) m = mm;
    if (!m) return null;
    var raw = m[0], body = raw.replace(/^-/, ''), hasDot = body.indexOf('.') !== -1, hasComma = body.indexOf(',') !== -1;
    var dec = '', thou = '', decimals = 0;
    if (/[\u00a0 ]/.test(body)) thou = /[\u00a0 ]/.exec(body)[0];
    if (hasDot && hasComma) {
      dec = body.lastIndexOf('.') > body.lastIndexOf(',') ? '.' : ',';
      thou = dec === '.' ? ',' : '.';
    } else if (hasDot || hasComma) {
      var c = hasDot ? '.' : ',', parts = body.split(c);
      if (parts.length === 2 && parts[1].length !== 3) dec = c; else thou = c;
    }
    if (dec) decimals = body.length - body.lastIndexOf(dec) - 1;
    var clean = body.split(thou || '\u0000').join('').replace(/[\u00a0 ]/g, '');
    if (dec) clean = clean.replace(dec, '.');
    var v = parseFloat(clean) * (raw.charAt(0) === '-' ? -1 : 1);
    return { value: v, prefix: str.slice(0, m.index), suffix: str.slice(m.index + raw.length), dec: dec, thou: thou, decimals: decimals };
  }
  function formatNumber(v, f) {
    var neg = v < 0, s = Math.abs(v).toFixed(f.decimals), parts = s.split('.'), i = parts[0], out = '';
    if (f.thou) { while (i.length > 3) { out = f.thou + i.slice(-3) + out; i = i.slice(0, -3); } }
    out = i + out;
    if (f.decimals) out += (f.dec || '.') + parts[1];
    return f.prefix + (neg ? '-' : '') + out + f.suffix;
  }
  function countText(text, from, progress) {
    var f = parseNumber(text);
    if (!f || isNaN(f.value)) return text;
    return formatNumber(from + (f.value - from) * progress, f);
  }

  return { VERSION: VERSION, EASES: EASES, AMOUNT_EASES: AMOUNT_EASES, FROM: FROM, AXIS: AXIS, STAGGER_MODE: STAGGER_MODE, SPLIT: SPLIT,
    CONTROLS: CONTROLS, GLOBALS: GLOBALS, PHASES: PHASES, NAMES: NAMES, effectName: effectName, defaults: defaults, normalize: normalize,
    easeString: easeString, importEase: importEase, delays: delays, factors: factors, compute: compute, timing: timing,
    parseNumber: parseNumber, formatNumber: formatNumber, countText: countText,
    bind: function (core) { A = core; } };
})();
if (typeof module !== 'undefined') module.exports = AnimeAERig;
