/*
 * btc.js - Bitcoin-avainten johtaminen ilman ulkoisia kirjastoja.
 *
 * Sisaltaa: SHA-256, RIPEMD-160, secp256k1 (Jacobian-koordinaatit, BigInt),
 * Base58Check, Bech32 (BIP173) ja WIF-koodauksen.
 *
 * Kaikki toiminnot ovat synkronisia ja toimivat seka selaimessa etta Nodessa
 * (module.exports maaritellaan lopussa testausta varten).
 */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Apurit                                                              *
   * ------------------------------------------------------------------ */

  var HEX = '0123456789abcdef';

  function bytesToHex(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) {
      s += HEX[bytes[i] >> 4] + HEX[bytes[i] & 15];
    }
    return s;
  }

  function hexToBytes(hex) {
    var out = new Uint8Array(hex.length / 2);
    for (var i = 0; i < out.length; i++) {
      out[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return out;
  }

  function bytesToBigInt(bytes) {
    var n = 0n;
    for (var i = 0; i < bytes.length; i++) n = (n << 8n) | BigInt(bytes[i]);
    return n;
  }

  function bigIntTo32Bytes(n) {
    var out = new Uint8Array(32);
    for (var i = 31; i >= 0; i--) {
      out[i] = Number(n & 0xffn);
      n >>= 8n;
    }
    return out;
  }

  function concat() {
    var parts = Array.prototype.slice.call(arguments);
    var len = 0, i;
    for (i = 0; i < parts.length; i++) len += parts[i].length;
    var out = new Uint8Array(len), off = 0;
    for (i = 0; i < parts.length; i++) {
      out.set(parts[i], off);
      off += parts[i].length;
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * SHA-256                                                             *
   * ------------------------------------------------------------------ */

  var K256 = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);

  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

  function sha256(bytes) {
    var h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a,
        h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    var l = bytes.length;
    var buf = new Uint8Array(((((l + 8) >> 6) + 1) << 6));
    buf.set(bytes);
    buf[l] = 0x80;
    var dv = new DataView(buf.buffer);
    dv.setUint32(buf.length - 8, Math.floor(l / 536870912));
    dv.setUint32(buf.length - 4, (l << 3) >>> 0);

    var w = new Uint32Array(64);
    for (var off = 0; off < buf.length; off += 64) {
      var i;
      for (i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
      for (i = 16; i < 64; i++) {
        var x = w[i - 15], y = w[i - 2];
        var s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
        var s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (i = 0; i < 64; i++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K256[i] + w[i]) | 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0;
        d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
      h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
    }
    var out = new Uint8Array(32), odv = new DataView(out.buffer);
    var hs = [h0, h1, h2, h3, h4, h5, h6, h7];
    for (var j = 0; j < 8; j++) odv.setUint32(j * 4, hs[j] >>> 0);
    return out;
  }

  /* ------------------------------------------------------------------ *
   * RIPEMD-160                                                          *
   * ------------------------------------------------------------------ */

  var RL = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8,
    3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12,
    1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2,
    4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13
  ];
  var RR = [
    5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12,
    6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2,
    15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13,
    8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14,
    12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11
  ];
  var SL = [
    11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8,
    7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12,
    11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5,
    11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12,
    9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6
  ];
  var SR = [
    8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6,
    9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11,
    9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5,
    15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8,
    8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11
  ];
  var KL = [0x00000000, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e];
  var KR = [0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0x00000000];

  function rotl(x, n) { return (x << n) | (x >>> (32 - n)); }

  function rmdF(j, x, y, z) {
    if (j < 16) return x ^ y ^ z;
    if (j < 32) return (x & y) | (~x & z);
    if (j < 48) return (x | ~y) ^ z;
    if (j < 64) return (x & z) | (y & ~z);
    return x ^ (y | ~z);
  }

  function ripemd160(bytes) {
    var h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe,
        h3 = 0x10325476, h4 = 0xc3d2e1f0;
    var l = bytes.length;
    var buf = new Uint8Array(((((l + 8) >> 6) + 1) << 6));
    buf.set(bytes);
    buf[l] = 0x80;
    var dv = new DataView(buf.buffer);
    dv.setUint32(buf.length - 8, (l << 3) >>> 0, true);
    dv.setUint32(buf.length - 4, Math.floor(l / 536870912), true);

    var X = new Uint32Array(16);
    for (var off = 0; off < buf.length; off += 64) {
      var i;
      for (i = 0; i < 16; i++) X[i] = dv.getUint32(off + i * 4, true);
      var al = h0, bl = h1, cl = h2, dl = h3, el = h4;
      var ar = h0, br = h1, cr = h2, dr = h3, er = h4;
      for (var j = 0; j < 80; j++) {
        var rnd = (j / 16) | 0, t;
        t = (al + rmdF(j, bl, cl, dl) + X[RL[j]] + KL[rnd]) | 0;
        t = (rotl(t, SL[j]) + el) | 0;
        al = el; el = dl; dl = rotl(cl, 10); cl = bl; bl = t;
        t = (ar + rmdF(79 - j, br, cr, dr) + X[RR[j]] + KR[rnd]) | 0;
        t = (rotl(t, SR[j]) + er) | 0;
        ar = er; er = dr; dr = rotl(cr, 10); cr = br; br = t;
      }
      var tmp = (h1 + cl + dr) | 0;
      h1 = (h2 + dl + er) | 0;
      h2 = (h3 + el + ar) | 0;
      h3 = (h4 + al + br) | 0;
      h4 = (h0 + bl + cr) | 0;
      h0 = tmp;
    }
    var out = new Uint8Array(20), odv = new DataView(out.buffer);
    var hs = [h0, h1, h2, h3, h4];
    for (var k = 0; k < 5; k++) odv.setUint32(k * 4, hs[k] >>> 0, true);
    return out;
  }

  function hash160(bytes) { return ripemd160(sha256(bytes)); }
  function hash256(bytes) { return sha256(sha256(bytes)); }

  /* ------------------------------------------------------------------ *
   * secp256k1                                                           *
   * ------------------------------------------------------------------ */

  var P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
  var N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  var Gx = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
  var Gy = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;
  var G = { x: Gx, y: Gy, z: 1n };
  var ZERO = { x: 0n, y: 1n, z: 0n };

  function mod(a) { var r = a % P; return r >= 0n ? r : r + P; }

  function inv(a) {
    var oldR = mod(a), r = P, oldS = 1n, s = 0n, q, tmp;
    while (r !== 0n) {
      q = oldR / r;
      tmp = oldR - q * r; oldR = r; r = tmp;
      tmp = oldS - q * s; oldS = s; s = tmp;
    }
    return mod(oldS);
  }

  function jDouble(p) {
    var X1 = p.x, Y1 = p.y, Z1 = p.z;
    if (Y1 === 0n || Z1 === 0n) return ZERO;
    var A = mod(X1 * X1);
    var B = mod(Y1 * Y1);
    var C = mod(B * B);
    var D = mod(2n * (mod((X1 + B) * (X1 + B)) - A - C));
    var E = mod(3n * A);
    var F = mod(E * E);
    var X3 = mod(F - 2n * D);
    var Y3 = mod(E * (D - X3) - 8n * C);
    var Z3 = mod(2n * Y1 * Z1);
    return { x: X3, y: Y3, z: Z3 };
  }

  function jAdd(p, q) {
    if (p.z === 0n) return q;
    if (q.z === 0n) return p;
    var X1 = p.x, Y1 = p.y, Z1 = p.z, X2 = q.x, Y2 = q.y, Z2 = q.z;
    var Z1Z1 = mod(Z1 * Z1);
    var Z2Z2 = mod(Z2 * Z2);
    var U1 = mod(X1 * Z2Z2);
    var U2 = mod(X2 * Z1Z1);
    var S1 = mod(mod(Y1 * Z2) * Z2Z2);
    var S2 = mod(mod(Y2 * Z1) * Z1Z1);
    var H = mod(U2 - U1);
    var r = mod(2n * (S2 - S1));
    if (H === 0n) return r === 0n ? jDouble(p) : ZERO;
    var I = mod(mod(2n * H) * mod(2n * H));
    var J = mod(H * I);
    var V = mod(U1 * I);
    var X3 = mod(r * r - J - 2n * V);
    var Y3 = mod(r * (V - X3) - 2n * S1 * J);
    var Z3 = mod(mod(mod((Z1 + Z2) * (Z1 + Z2)) - Z1Z1 - Z2Z2) * H);
    return { x: X3, y: Y3, z: Z3 };
  }

  function jMul(k, p) {
    var R = ZERO, Q = p;
    while (k > 0n) {
      if (k & 1n) R = jAdd(R, Q);
      Q = jDouble(Q);
      k >>= 1n;
    }
    return R;
  }

  function toAffine(p) {
    if (p.z === 0n) throw new Error('point at infinity');
    var zi = inv(p.z);
    var zi2 = mod(zi * zi);
    return { x: mod(p.x * zi2), y: mod(mod(p.y * zi2) * zi) };
  }

  /** Julkinen avain (33 tavua, pakattu) yksityisavaimesta. */
  function publicKey(k) {
    var pt = toAffine(jMul(k, G));
    var out = new Uint8Array(33);
    out[0] = (pt.y & 1n) === 1n ? 0x03 : 0x02;
    out.set(bigIntTo32Bytes(pt.x), 1);
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Base58Check                                                         *
   * ------------------------------------------------------------------ */

  var B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

  function base58Encode(bytes) {
    var num = bytesToBigInt(bytes), s = '';
    while (num > 0n) {
      s = B58[Number(num % 58n)] + s;
      num /= 58n;
    }
    for (var i = 0; i < bytes.length && bytes[i] === 0; i++) s = '1' + s;
    return s || '1';
  }

  function base58Check(payload) {
    return base58Encode(concat(payload, hash256(payload).slice(0, 4)));
  }

  /* ------------------------------------------------------------------ *
   * Bech32 (BIP173)                                                     *
   * ------------------------------------------------------------------ */

  var B32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  var B32GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

  function bech32Polymod(values) {
    var chk = 1;
    for (var i = 0; i < values.length; i++) {
      var b = chk >> 25;
      chk = ((chk & 0x1ffffff) << 5) ^ values[i];
      for (var j = 0; j < 5; j++) if ((b >> j) & 1) chk ^= B32GEN[j];
    }
    return chk;
  }

  function bech32Expand(hrp) {
    var out = [], i;
    for (i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >> 5);
    out.push(0);
    for (i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31);
    return out;
  }

  function bech32Encode(hrp, data) {
    var values = bech32Expand(hrp).concat(data, [0, 0, 0, 0, 0, 0]);
    var polymod = bech32Polymod(values) ^ 1;
    var combined = data.slice();
    for (var i = 0; i < 6; i++) combined.push((polymod >> (5 * (5 - i))) & 31);
    var s = hrp + '1';
    for (var j = 0; j < combined.length; j++) s += B32[combined[j]];
    return s;
  }

  function convertBits(data, from, to, pad) {
    var acc = 0, bits = 0, out = [], maxv = (1 << to) - 1;
    for (var i = 0; i < data.length; i++) {
      acc = (acc << from) | data[i];
      bits += from;
      while (bits >= to) { bits -= to; out.push((acc >> bits) & maxv); }
    }
    if (pad && bits > 0) out.push((acc << (to - bits)) & maxv);
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Osoitteet ja avaimet                                                *
   * ------------------------------------------------------------------ */

  /** P2PKH pubkey-hashista -> "1..." */
  function p2pkhAddress(h160) {
    return base58Check(concat(new Uint8Array([0x00]), h160));
  }

  /** P2WPKH (SegWit v0) pubkey-hashista -> "bc1q..." */
  function p2wpkhAddress(h160) {
    return bech32Encode('bc', [0].concat(convertBits(h160, 8, 5, true)));
  }

  /** WIF, mainnet, pakattu julkinen avain. */
  function toWIF(privBytes) {
    return base58Check(concat(new Uint8Array([0x80]), privBytes, new Uint8Array([0x01])));
  }

  var getRandomValues = (function () {
    var g = typeof globalThis !== 'undefined' ? globalThis : root;
    if (g.crypto && g.crypto.getRandomValues) {
      return g.crypto.getRandomValues.bind(g.crypto);
    }
    var wc = require('crypto').webcrypto;
    return wc.getRandomValues.bind(wc);
  })();

  /** Kryptografisesti vahva satunnainen yksityisavain valilta [1, n-1]. */
  function randomPrivateKey() {
    var b = new Uint8Array(32);
    for (;;) {
      getRandomValues(b);
      var k = bytesToBigInt(b);
      if (k > 0n && k < N) return k;
    }
  }

  /**
   * Johtaa yhdesta yksityisavaimesta koko setin: hex, WIF, legacy-osoitteen ja
   * bech32-osoitteen.
   */
  function deriveKey(k) {
    if (k === undefined) k = randomPrivateKey();
    var priv = bigIntTo32Bytes(k);
    var pub = publicKey(k);
    var h = hash160(pub);
    return {
      priv: k,
      privHex: bytesToHex(priv),
      wif: toWIF(priv),
      pubHex: bytesToHex(pub),
      hash160: bytesToHex(h),
      legacy: p2pkhAddress(h),
      bech32: p2wpkhAddress(h)
    };
  }

  root.BTC = {
    sha256: sha256,
    ripemd160: ripemd160,
    hash160: hash160,
    hash256: hash256,
    publicKey: publicKey,
    base58Encode: base58Encode,
    base58Check: base58Check,
    bech32Encode: bech32Encode,
    convertBits: convertBits,
    p2pkhAddress: p2pkhAddress,
    p2wpkhAddress: p2wpkhAddress,
    toWIF: toWIF,
    randomPrivateKey: randomPrivateKey,
    deriveKey: deriveKey,
    bytesToHex: bytesToHex,
    hexToBytes: hexToBytes,
    N: N
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.BTC;
})(typeof globalThis !== 'undefined' ? globalThis : this);
