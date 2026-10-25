/**
 * Génère les icônes PNG de la PWA à partir de l'icône SVG.
 * Aucune dépendance externe : encodeur PNG minimal basé sur zlib (natif Node).
 *
 *   node scripts/make-icons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'public', 'icons');

/* ── Encodage PNG ── */
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ── Rendu de l'icône ── */
function lerp(a, b, t) { return a + (b - a) * t; }
const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

function renderIcon(size, maskable) {
  const buf = Buffer.alloc(size * size * 4);
  const bgA = hex('#0f172a');
  const bgB = hex('#164e63');
  const scale = maskable ? 0.72 : 1;
  const c = size / 2;

  // Tracé du pouls (coordonnées 0..512, recentrées selon l'échelle)
  const pts0 = [
    [120, 240], [190, 240], [214, 196], [244, 300],
    [272, 168], [300, 240], [392, 240],
  ];
  const map = ([x, y]) => [c + (x - 256) * (size / 512) * scale, c + (y - 256) * (size / 512) * scale];
  const pts = pts0.map(map);
  const strokeW = (18 / 512) * size * scale;
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    segs.push({ a: pts[i], b: pts[i + 1], t: (i / (pts.length - 2)) });
  }

  const distToSeg = (px, py, a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy || 1;
    let t = ((px - a[0]) * dx + (py - a[1]) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const qx = a[0] + t * dx;
    const qy = a[1] + t * dy;
    return Math.hypot(px - qx, py - qy);
  };

  const pulseA = hex('#22d3ee');
  const pulseB = hex('#facc15');

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const t = (x / size + y / size) / 2;
      let r = lerp(bgA[0], bgB[0], t);
      let g = lerp(bgA[1], bgB[1], t);
      let b = lerp(bgA[2], bgB[2], t);

      const d = Math.hypot(x - c, y - c);
      const radius = (size / 2) * scale;

      // Anneaux concentriques
      for (const [rr, op] of [[0.96, 0.35], [0.72, 0.55]]) {
        const ringR = radius * rr;
        if (Math.abs(d - ringR) < strokeW * 0.35) {
          r = lerp(r, hex('#0e7490')[0], op * 0.5);
          g = lerp(g, hex('#0e7490')[1], op * 0.5);
          b = lerp(b, hex('#0e7490')[2], op * 0.5);
        }
      }

      // Ligne de pouls
      let best = Infinity;
      let bestT = 0;
      for (const s of segs) {
        const dd = distToSeg(x + 0.5, y + 0.5, s.a, s.b);
        if (dd < best) { best = dd; bestT = s.t; }
      }
      if (best < strokeW / 2) {
        const edge = Math.max(0, Math.min(1, (strokeW / 2 - best) / 1.5));
        const gr = lerp(pulseA[0], pulseB[0], bestT);
        const gg = lerp(pulseA[1], pulseB[1], bestT);
        const gb = lerp(pulseA[2], pulseB[2], bestT);
        r = lerp(r, gr, edge);
        g = lerp(g, gg, edge);
        b = lerp(b, gb, edge);
      }

      // Coins arrondis (sauf maskable)
      let alpha = 255;
      if (!maskable) {
        const rad = size * 0.22;
        const cx = Math.min(Math.max(x, rad), size - rad);
        const cy = Math.min(Math.max(y, rad), size - rad);
        const dd = Math.hypot(x - cx, y - cy);
        if (dd > rad) alpha = Math.max(0, Math.round(255 * (1 - (dd - rad) / 1.5)));
      }

      buf[i] = Math.round(r);
      buf[i + 1] = Math.round(g);
      buf[i + 2] = Math.round(b);
      buf[i + 3] = alpha;
    }
  }
  return encodePng(size, size, buf);
}

fs.mkdirSync(OUT, { recursive: true });
for (const [name, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, false],
]) {
  fs.writeFileSync(path.join(OUT, name), renderIcon(size, maskable));
  console.log('✓', name, `${size}x${size}`);
}
