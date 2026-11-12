/* Motion Builder v1 ProRes 4444 encoder + .mov writer (ES3), copied verbatim from reference/Motion Builder.html.
   Loaded as text and evaluated by prores.ts, so the same file runs on the page, in workers and in tests. */
/*  ProRes 4444 (with 16-bit alpha) encoder + QuickTime .mov writer, plain JS, no dependencies.
    Bitstream follows FFmpeg's prores_ks encoder (proresenc_kostya.c): same slice layout, codebooks,
    scan order and alpha run coding, with a fixed quantiser per slice (raised only if a slice gets too big).
    Input frames are straight (unpremultiplied) RGBA bytes, as canvas getImageData returns them.          */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AnimeAEProRes = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SCAN = [0, 1, 8, 9, 2, 3, 10, 11, 16, 17, 24, 25, 18, 19, 26, 27, 4, 5, 12, 20, 13, 6, 7, 14, 21, 28, 29, 22, 15, 23, 30, 31,
    32, 33, 40, 48, 41, 34, 35, 42, 49, 56, 57, 50, 43, 36, 37, 44, 51, 58, 59, 52, 45, 38, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63];
  var DC_CB = [0x04, 0x28, 0x28, 0x4D, 0x4D, 0x70, 0x70], FIRST_DC_CB = 0xB8;
  var RUN_CB = [0x06, 0x06, 0x05, 0x05, 0x04, 0x29, 0x29, 0x29, 0x29, 0x28, 0x28, 0x28, 0x28, 0x28, 0x28, 0x4C];
  var LEV_CB = [0x04, 0x0A, 0x05, 0x06, 0x04, 0x28, 0x28, 0x28, 0x28, 0x4C];
  var QMAT_HQ = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5,
    4, 4, 4, 4, 4, 4, 5, 5, 4, 4, 4, 4, 4, 5, 5, 6, 4, 4, 4, 4, 5, 5, 6, 7, 4, 4, 4, 4, 5, 6, 7, 7];
  var MPS = 8, MAX_SLICE = 60000;

  /* DCT basis: coefficients are 4x the orthonormal 2-D DCT-II, so a flat 10-bit 512 block has DC 0x4000 */
  var COS = new Float64Array(64);
  for (var u = 0; u < 8; u++) for (var x = 0; x < 8; x++) COS[u * 8 + x] = (u ? 0.5 : Math.SQRT1_2 * 0.5) * Math.cos((2 * x + 1) * u * Math.PI / 16);
  var tmp = new Float64Array(64);
  function fdct(src, off, stride, out, o) {
    var i, j, k, s, v0 = src[off], flat = true;
    for (i = 0; i < 8 && flat; i++) for (j = 0; j < 8; j++) if (src[off + i * stride + j] !== v0) { flat = false; break; }
    if (flat) { for (i = 1; i < 64; i++) out[o + i] = 0; out[o] = v0 * 32; return; }   // constant block: DC only
    for (i = 0; i < 8; i++) for (u = 0; u < 8; u++) {       // rows
      s = 0; for (k = 0; k < 8; k++) s += COS[u * 8 + k] * src[off + i * stride + k]; tmp[i * 8 + u] = s;
    }
    for (u = 0; u < 8; u++) for (j = 0; j < 8; j++) {       // columns
      s = 0; for (k = 0; k < 8; k++) s += COS[j * 8 + k] * tmp[k * 8 + u]; out[o + j * 8 + u] = Math.round(s * 4);
    }
  }

  /* big-endian bit writer */
  function Bits(cap) { this.buf = new Uint8Array(cap); this.pos = 0; this.acc = 0; this.n = 0; }
  Bits.prototype.put = function (n, v) {
    if (n > 16) { this.put(n - 16, Math.floor(v / 65536) & 0xFFFF); n = 16; }
    v &= (1 << n) - 1;
    this.acc = (this.acc << n) | v; this.n += n;
    while (this.n >= 8) { this.n -= 8; this.byte((this.acc >>> this.n) & 255); }
    this.acc &= (1 << this.n) - 1;
  };
  Bits.prototype.byte = function (b) {
    if (this.pos >= this.buf.length) { var nb = new Uint8Array(this.buf.length * 2); nb.set(this.buf); this.buf = nb; }
    this.buf[this.pos++] = b;
  };
  Bits.prototype.flush = function () { if (this.n) this.put(8 - this.n, 0); return this.pos; };
  function log2(v) { return 31 - Math.clz32(v); }

  function vlc(pb, cb, val) {
    var sw = (cb & 3) + 1, rice = cb >> 5, ex = (cb >> 2) & 7, swv = sw << rice, e;
    if (val >= swv) {
      val -= swv - (1 << ex); e = log2(val);
      pb.put(e - ex + sw, 0); pb.put(e + 1, val);
    } else {
      e = val >> rice; if (e) pb.put(e, 0); pb.put(1, 1); if (rice) pb.put(rice, val);
    }
  }
  function code(x) { return (x * 2) ^ (x >> 31); }
  function q(v, d) { return (v / d) | 0; }   // C integer division (truncate toward zero)

  function encDCs(pb, bl, nb, scale) {
    var cb = 5, prev = q(bl[0] - 0x4000, scale), sign = 0, i, dc, d, ns, c;
    vlc(pb, FIRST_DC_CB, code(prev));
    for (i = 1; i < nb; i++) {
      dc = q(bl[i * 64] - 0x4000, scale); d = dc - prev; ns = d >> 31;
      d = (d ^ sign) - sign; c = code(d);
      vlc(pb, DC_CB[cb], c); cb = Math.min(c, 6); sign = ns; prev = dc;
    }
  }
  function encACs(pb, bl, nb, qm) {
    var prun = 4, plev = 2, run = 0, max = nb << 6, i, idx, lev, a, s;
    for (i = 1; i < 64; i++) {
      s = SCAN[i];
      for (idx = s; idx < max; idx += 64) {
        lev = q(bl[idx], qm[s]);
        if (lev) {
          a = lev < 0 ? -lev : lev;
          vlc(pb, RUN_CB[prun], run); vlc(pb, LEV_CB[plev], a - 1); pb.put(1, lev < 0 ? 1 : 0);
          prun = Math.min(run, 15); plev = Math.min(a, 9); run = 0;
        } else run++;
      }
    }
  }
  function alphaDiff(pb, cur, prev) {        // 16-bit alpha
    var d = (cur - prev) & 0xFFFF;
    if (d >= 0x10000 - 64) d -= 0x10000;
    if (d < -64 || d > 64 || !d) { pb.put(1, 1); pb.put(16, d & 0xFFFF); }
    else { pb.put(1, 0); pb.put(6, Math.abs(d) - 1); pb.put(1, d < 0 ? 1 : 0); }
  }
  function alphaRun(pb, run) {
    if (run) { pb.put(1, 0); if (run < 16) pb.put(4, run); else pb.put(15, run); } else pb.put(1, 1);
  }

  /*  rgba: Uint8ClampedArray/Uint8Array (w*h*4, straight alpha). opts.q: base quantiser 1..8 (2 = near lossless).
      Returns one ProRes frame (Uint8Array), starting with its size and 'icpf'.                                  */
  function Encoder(w, h, opts) {
    opts = opts || {};
    this.w = w; this.h = h; this.q = Math.max(1, Math.min(16, opts.q || 2)); this.alpha = opts.alpha !== false;
    this.mbw = (w + 15) >> 4; this.mbh = (h + 15) >> 4;
    // padded planes (replicate edges), 10-bit YCbCr Rec.709 video range + 16-bit alpha
    this.pw = this.mbw * 16; this.ph = this.mbh * 16;
    var n = this.pw * this.ph;
    this.P = [new Int32Array(n), new Int32Array(n), new Int32Array(n), new Int32Array(n)];
    this.blocks = new Int32Array(64 * 4 * MPS);
    this.qm = {}; this.pb = new Bits(1 << 20);
  }
  Encoder.prototype.qmat = function (qq) {
    if (!this.qm[qq]) { var m = new Int32Array(64); for (var i = 0; i < 64; i++) m[i] = QMAT_HQ[i] * qq; this.qm[qq] = m; }
    return this.qm[qq];
  };
  Encoder.prototype.load = function (rgba) {
    var w = this.w, h = this.h, pw = this.pw, ph = this.ph, Y = this.P[0], U = this.P[1], V = this.P[2], A = this.P[3], x, y, i, o, r, g, b;
    for (y = 0; y < ph; y++) {
      var sy = y < h ? y : h - 1;
      for (x = 0; x < pw; x++) {
        i = (sy * w + (x < w ? x : w - 1)) * 4; o = y * pw + x;
        r = rgba[i] / 255; g = rgba[i + 1] / 255; b = rgba[i + 2] / 255;
        var yy = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        Y[o] = Math.round(64 + 876 * yy);
        U[o] = Math.round(512 + 896 * (b - yy) / 1.8556);
        V[o] = Math.round(512 + 896 * (r - yy) / 1.5748);
        A[o] = rgba[i + 3] * 257;
      }
    }
  };
  Encoder.prototype.slice = function (pb, mx, my, mps, qq) {
    var sizes = [], start = pb.pos, p, m, bl = this.blocks, pw = this.pw, qm = this.qmat(qq), nb = mps * 4;
    for (p = 0; p < 3; p++) {
      var src = this.P[p], k = 0;
      for (m = 0; m < mps; m++) {
        var o = (my * 16) * pw + (mx + m) * 16;
        if (p === 0) { fdct(src, o, pw, bl, k); fdct(src, o + 8, pw, bl, k + 64); fdct(src, o + 8 * pw, pw, bl, k + 128); fdct(src, o + 8 * pw + 8, pw, bl, k + 192); }
        else { fdct(src, o, pw, bl, k); fdct(src, o + 8 * pw, pw, bl, k + 64); fdct(src, o + 8, pw, bl, k + 128); fdct(src, o + 8 * pw + 8, pw, bl, k + 192); }
        k += 256;
      }
      encDCs(pb, bl, nb, qm[0]); encACs(pb, bl, nb, qm);
      pb.flush(); sizes.push(pb.pos - start); start = pb.pos;
    }
    if (this.alpha) {
      var A = this.P[3], sw = mps * 16, row0 = my * 16 * pw + mx * 16, prev = 0xFFFF, run = 0, cur, first = true, yy, xx;
      for (yy = 0; yy < 16; yy++) for (xx = 0; xx < sw; xx++) {
        cur = A[row0 + yy * pw + xx];
        if (first) { alphaDiff(pb, cur, prev); prev = cur; first = false; continue; }
        if (cur !== prev) { alphaRun(pb, run); alphaDiff(pb, cur, prev); prev = cur; run = 0; } else run++;
      }
      alphaRun(pb, run);
      pb.flush(); sizes.push(pb.pos - start);
    }
    return sizes;
  };
  Encoder.prototype.frame = function (rgba) {
    this.load(rgba);
    var np = this.alpha ? 4 : 3, hs = 2 + 2 * (np - 1), slicesW = 0, mps, x, out = new Bits(1 << 20), i;
    var plan = [];   // slices per row: [mx, mps]
    for (x = 0, mps = MPS; x < this.mbw; x += mps) { while (this.mbw - x < mps) mps >>= 1; plan.push([x, mps]); }
    slicesW = plan.length;
    var nSlices = slicesW * this.mbh;
    // frame header
    var hdr = [];
    function be16(a, v) { a.push((v >> 8) & 255, v & 255); }
    be16(hdr, 0); be16(hdr, 1);                              // header size (patched), version 1 (4:4:4 / alpha)
    hdr.push(76, 97, 118, 99);                               // vendor 'Lavc'
    be16(hdr, this.w); be16(hdr, this.h);
    hdr.push(3 << 6, 0, 1, 1, 1, this.alpha ? 2 : 0, 0, 3);   // 4:4:4 progressive, reserved, BT.709 x3, 16-bit alpha, reserved, both matrices
    for (i = 0; i < 64; i++) hdr.push(QMAT_HQ[i]);
    for (i = 0; i < 64; i++) hdr.push(QMAT_HQ[i]);
    hdr[0] = (hdr.length >> 8) & 255; hdr[1] = hdr.length & 255;
    // slices
    var pb = this.pb, slices = [], my, s;
    for (my = 0; my < this.mbh; my++) for (s = 0; s < slicesW; s++) {
      var qq = this.q, sz, tot;
      for (;;) {
        pb.pos = 0; pb.acc = 0; pb.n = 0;
        sz = this.slice(pb, plan[s][0], my, plan[s][1], qq);
        tot = pb.pos + hs;
        if (tot <= MAX_SLICE || qq >= 128) break;
        qq = Math.min(128, qq * 2);
      }
      var sh = [hs << 3, qq]; for (i = 0; i < np - 1; i++) be16(sh, sz[i]);
      var sl = new Uint8Array(tot); sl.set(sh, 0); sl.set(pb.buf.subarray(0, pb.pos), hs);
      slices.push(sl);
    }
    var picHdr = 8, table = nSlices * 2, data = 0;
    for (i = 0; i < nSlices; i++) data += slices[i].length;
    var picSize = picHdr + table + data, total = 8 + hdr.length + picSize;
    var f = new Uint8Array(total), dv = new DataView(f.buffer), p = 0;
    dv.setUint32(0, total); f.set([105, 99, 112, 102], 4); p = 8;   // 'icpf'
    f.set(hdr, p); p += hdr.length;
    f[p] = 0x40; dv.setUint32(p + 1, picSize); dv.setUint16(p + 5, nSlices); f[p + 7] = log2(MPS) << 4; p += 8;
    for (i = 0; i < nSlices; i++) { dv.setUint16(p, slices[i].length); p += 2; }
    for (i = 0; i < nSlices; i++) { f.set(slices[i], p); p += slices[i].length; }
    return f;
  };

  /* ---------- QuickTime .mov writer ---------- */
  function box(type, parts) {
    var len = 8, i; for (i = 0; i < parts.length; i++) len += parts[i].length;
    var b = new Uint8Array(len), dv = new DataView(b.buffer), p = 8;
    dv.setUint32(0, len); for (i = 0; i < 4; i++) b[4 + i] = type.charCodeAt(i);
    for (i = 0; i < parts.length; i++) { b.set(parts[i], p); p += parts[i].length; }
    return b;
  }
  function bytes(spec) {   // [['u32',v],['u16',v],['u8',v],['str','abcd'],['fix',v],['pstr',s,len]]
    var out = [];
    spec.forEach(function (s) {
      var v = s[1];
      if (s[0] === 'u32') out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
      else if (s[0] === 'u16') out.push((v >> 8) & 255, v & 255);
      else if (s[0] === 'u8') out.push(v & 255);
      else if (s[0] === 'str') for (var i = 0; i < v.length; i++) out.push(v.charCodeAt(i));
      else if (s[0] === 'pstr') { var n = s[2]; out.push(v.length); for (var j = 0; j < n - 1; j++) out.push(j < v.length ? v.charCodeAt(j) : 0); }
      else if (s[0] === 'zero') for (var k = 0; k < v; k++) out.push(0);
    });
    return new Uint8Array(out);
  }
  var MATRIX = [['u32', 0x10000], ['u32', 0], ['u32', 0], ['u32', 0], ['u32', 0x10000], ['u32', 0], ['u32', 0], ['u32', 0], ['u32', 0x40000000]];

  /*  frames: array of Uint8Array (ProRes frames). Returns array of parts for a Blob (ftyp, mdat header, frames..., moov). */
  function mov(frames, w, h, fps, alpha) {
    var ts = Math.round(fps * 100), delta = 100, n = frames.length, dur = n * delta;
    var ftyp = box('ftyp', [bytes([['str', 'qt  '], ['u32', 0x200], ['str', 'qt  ']])]);
    var wide = box('wide', []);
    var mdatLen = 8; frames.forEach(function (f) { mdatLen += f.length; });
    var mdatHdr = bytes([['u32', mdatLen], ['str', 'mdat']]);
    var off = ftyp.length + wide.length + 8, offs = [];
    frames.forEach(function (f) { offs.push(off); off += f.length; });
    var mvhd = box('mvhd', [bytes([['u32', 0], ['u32', 0], ['u32', 0], ['u32', ts], ['u32', dur], ['u32', 0x10000], ['u16', 0x100], ['zero', 10]].concat(MATRIX).concat([['zero', 24], ['u32', 2]]))]);
    var tkhd = box('tkhd', [bytes([['u32', 0xF], ['u32', 0], ['u32', 0], ['u32', 1], ['u32', 0], ['u32', dur], ['zero', 8], ['u16', 0], ['u16', 0], ['u16', 0], ['u16', 0]].concat(MATRIX).concat([['u32', w * 65536], ['u32', h * 65536]]))]);
    var mdhd = box('mdhd', [bytes([['u32', 0], ['u32', 0], ['u32', 0], ['u32', ts], ['u32', dur], ['u16', 0], ['u16', 0]])]);
    var hdlrM = box('hdlr', [bytes([['u32', 0], ['str', 'mhlr'], ['str', 'vide'], ['str', 'appl'], ['u32', 0], ['u32', 0], ['pstr', 'VideoHandler', 13]])]);
    var vmhd = box('vmhd', [bytes([['u32', 1], ['u16', 0x40], ['u16', 0x8000], ['u16', 0x8000], ['u16', 0x8000]])]);
    var hdlrD = box('hdlr', [bytes([['u32', 0], ['str', 'dhlr'], ['str', 'alis'], ['str', 'appl'], ['u32', 0], ['u32', 0], ['pstr', 'DataHandler', 12]])]);
    var dinf = box('dinf', [box('dref', [bytes([['u32', 0], ['u32', 1]]), box('alis', [bytes([['u32', 1]])])])]);
    var name = alpha ? 'Apple ProRes 4444' : 'Apple ProRes 4444';
    var entry = box('ap4h', [bytes([['zero', 6], ['u16', 1], ['u16', 0], ['u16', 0], ['str', 'appl'], ['u32', 0], ['u32', 0x200], ['u16', w], ['u16', h],
      ['u32', 72 * 65536], ['u32', 72 * 65536], ['u32', 0], ['u16', 1], ['pstr', name, 32], ['u16', alpha ? 32 : 24], ['u16', 0xFFFF]]),
      box('colr', [bytes([['str', 'nclc'], ['u16', 1], ['u16', 1], ['u16', 1]])]),
      box('fiel', [bytes([['u8', 1], ['u8', 0]])]),
      box('pasp', [bytes([['u32', 1], ['u32', 1]])])]);
    var stsd = box('stsd', [bytes([['u32', 0], ['u32', 1]]), entry]);
    var stts = box('stts', [bytes([['u32', 0], ['u32', 1], ['u32', n], ['u32', delta]])]);
    var stsc = box('stsc', [bytes([['u32', 0], ['u32', 1], ['u32', 1], ['u32', 1], ['u32', 1]])]);
    var szs = [['u32', 0], ['u32', 0], ['u32', n]]; frames.forEach(function (f) { szs.push(['u32', f.length]); });
    var stsz = box('stsz', [bytes(szs)]);
    var co = [['u32', 0], ['u32', n]]; offs.forEach(function (o) { co.push(['u32', o]); });
    var stco = box('stco', [bytes(co)]);
    var stbl = box('stbl', [stsd, stts, stsc, stsz, stco]);
    var minf = box('minf', [vmhd, hdlrD, dinf, stbl]);
    var mdia = box('mdia', [mdhd, hdlrM, minf]);
    var trak = box('trak', [tkhd, mdia]);
    var moov = box('moov', [mvhd, trak]);
    return [ftyp, wide, mdatHdr].concat(frames, [moov]);
  }

  return { Encoder: Encoder, mov: mov };
});
