/* ─────────────────────────────────────────────────────────────────────────
   Point-cloud loading + normalization for the LiDAR portal.

   Supports (all parsed in-browser, no server):
     · .las / .laz   — ASPRS LiDAR  (loaders.gl)
     · .ply          — ascii/binary (loaders.gl)
     · .xyz/.pts/.csv/.txt — plain-text points (streaming parser)

   Large files (50–500 MB) are uniformly down-sampled to TARGET_POINTS on load
   so the browser stays responsive, while full bounds / counts are kept exact.
   ──────────────────────────────────────────────────────────────────────── */
import { parse } from "@loaders.gl/core";
import { LASLoader } from "@loaders.gl/las";
import { PLYLoader } from "@loaders.gl/ply";

export const TARGET_POINTS = 1_200_000;   // max points rendered
const TARGET_SPAN = 140;                  // scene units the cloud is fit to

/* ── ASPRS classification table (utility codes 13–16 matter for pole surveys) ── */
export const CLASSES = {
  0: { name: "Never classified", color: "#64748b" },
  1: { name: "Unclassified", color: "#94a3b8" },
  2: { name: "Ground", color: "#a1764e" },
  3: { name: "Low vegetation", color: "#86c34a" },
  4: { name: "Medium vegetation", color: "#5a9e34" },
  5: { name: "High vegetation", color: "#2e7d32" },
  6: { name: "Building", color: "#ef6c00" },
  7: { name: "Noise", color: "#e53935" },
  9: { name: "Water", color: "#1e88e5" },
  10: { name: "Rail", color: "#6d4c41" },
  11: { name: "Road surface", color: "#546e7a" },
  12: { name: "Overlap", color: "#9575cd" },
  13: { name: "Wire — guard", color: "#ffd600" },
  14: { name: "Wire — conductor", color: "#ffea00" },
  15: { name: "Transmission tower", color: "#22d3ee" },
  16: { name: "Wire connector", color: "#00e5ff" },
  17: { name: "Bridge deck", color: "#8e24aa" },
  18: { name: "High noise", color: "#ff1744" },
};
const classMeta = (c) => CLASSES[c] || { name: `Class ${c}`, color: "#22d3ee" };

function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
}

/* ───────────────────────────── colour ramps ──────────────────────────── */
function ramp(t, stops) {
  t = Math.min(1, Math.max(0, t));
  let a = stops[0], b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; break; }
  }
  const f = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
  return [0, 1, 2].map((k) => a[1][k] + (b[1][k] - a[1][k]) * f);
}
const ELEV = [[0, [0.10, 0.20, 0.5]], [0.5, [0.13, 0.78, 0.85]], [1, [0.95, 0.98, 1]]];
const INTENS = [[0, [0.06, 0.09, 0.14]], [0.5, [0.13, 0.6, 0.7]], [1, [0.85, 0.97, 1]]];

/* ── build a render-ready colour buffer for the requested mode ── */
export function computeCloudColors(ds, mode) {
  const n = ds.count;
  const col = new Float32Array(n * 3);
  if (mode === "rgb" && ds.rgb) return ds.rgb;
  if (mode === "classification" && ds.classification) {
    const lut = {};
    for (let i = 0; i < n; i++) {
      const c = ds.classification[i];
      const rgb = lut[c] || (lut[c] = hexRgb(classMeta(c).color));
      col[i * 3] = rgb[0]; col[i * 3 + 1] = rgb[1]; col[i * 3 + 2] = rgb[2];
    }
    return col;
  }
  if (mode === "intensity" && ds.intensity) {
    for (let i = 0; i < n; i++) {
      const c = ramp(ds.intensity[i], INTENS);
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    }
    return col;
  }
  // elevation (default / fallback)
  for (let i = 0; i < n; i++) {
    const c = ramp(ds.elevation[i], ELEV);
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  return col;
}

export function availableModes(ds) {
  const m = [];
  if (ds.hasRGB) m.push("rgb");
  if (ds.hasClass) m.push("classification");
  if (ds.hasIntensity) m.push("intensity");
  m.push("elevation");
  return m;
}

/* ───────────── turn parsed (file-coord) samples into a scene dataset ──────────── */
let _idc = 0;
function finalize(parsed, meta) {
  const { sx, sy, sz, rgb, intensity, classification, bounds, total, count } = parsed;
  const { minX, minY, minZ, maxX, maxY, maxZ } = bounds;
  const sizeX = maxX - minX, sizeY = maxY - minY, sizeZ = maxZ - minZ;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const scale = TARGET_SPAN / Math.max(1e-6, Math.max(sizeX, sizeY));

  // file axes: X east, Y north, Z up  →  scene axes: x = X, y = Z(up), z = Y
  const positions = new Float32Array(count * 3);
  const elevation = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (sx[i] - cx) * scale;
    positions[i * 3 + 1] = (sz[i] - minZ) * scale;
    positions[i * 3 + 2] = (sy[i] - cy) * scale;
    elevation[i] = sizeZ > 1e-6 ? (sz[i] - minZ) / sizeZ : 0;
  }

  // normalize intensity
  let intens = null, intensityRange = null;
  if (intensity) {
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < count; i++) { const v = intensity[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
    intensityRange = [mn, mx];
    intens = new Float32Array(count);
    const span = mx - mn || 1;
    for (let i = 0; i < count; i++) intens[i] = (intensity[i] - mn) / span;
  }

  // classification histogram
  let classHist = null;
  if (classification) {
    const h = {};
    for (let i = 0; i < count; i++) h[classification[i]] = (h[classification[i]] || 0) + 1;
    classHist = Object.entries(h)
      .map(([code, c]) => ({ code: +code, name: classMeta(+code).name, color: classMeta(+code).color, count: c }))
      .sort((a, b) => b.count - a.count);
  }

  return {
    id: meta.id ?? `ds-${++_idc}`,
    name: meta.name,
    ext: meta.ext,
    sizeBytes: meta.sizeBytes ?? 0,
    total,
    count,
    positions,
    elevation,
    rgb: rgb || null,
    intensity: intens,
    intensityRange,
    classification: classification || null,
    classHist,
    bounds: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ], size: [sizeX, sizeY, sizeZ], center: [cx, cy, (minZ + maxZ) / 2] },
    sceneSize: [sizeX * scale, sizeZ * scale, sizeY * scale],
    scale,
    hasRGB: !!rgb,
    hasIntensity: !!intens,
    hasClass: !!classification,
  };
}

/* ─────────────────── loaders.gl (LAS/LAZ + PLY) → parsed ──────────────────── */
function normColor(value, size) {
  if (!value) return null;
  const n = value.length / size;
  const out = new Float32Array(n * 3);
  let div = 1;
  if (value instanceof Uint8Array || value instanceof Uint8ClampedArray) div = 255;
  else if (value instanceof Uint16Array) div = 65535;
  else { // float — detect 0..1 vs 0..255
    let mx = 0; for (let i = 0; i < Math.min(value.length, 3000); i++) if (value[i] > mx) mx = value[i];
    div = mx > 1.5 ? 255 : 1;
  }
  for (let i = 0; i < n; i++) {
    out[i * 3] = value[i * size] / div;
    out[i * 3 + 1] = value[i * size + 1] / div;
    out[i * 3 + 2] = value[i * size + 2] / div;
  }
  return out;
}

async function parseLoaders(buffer, loader, onProgress) {
  onProgress?.(0.15);
  const data = await parse(buffer, loader, { worker: false, las: { colorDepth: 8, shape: "mesh-row-table" } }).catch(
    // some versions reject the `shape` option — retry plainly
    () => parse(buffer, loader, { worker: false })
  );
  onProgress?.(0.7);
  const A = data.attributes || {};
  const POS = A.POSITION?.value;
  if (!POS) throw new Error("No POSITION attribute found in file.");
  const total = POS.length / 3;

  const colRaw = A.COLOR_0?.value;
  const colSize = A.COLOR_0?.size || 3;
  const colors = colRaw ? normColor(colRaw, colSize) : null;     // full-res rgb 0..1
  const intensityFull = A.intensity?.value || null;
  const classFull = A.classification?.value || null;

  // bounds from header when present, else compute
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  const bb = data.header?.boundingBox;
  if (bb) {
    [minX, minY, minZ] = bb[0]; [maxX, maxY, maxZ] = bb[1];
  } else {
    for (let i = 0; i < total; i++) {
      const x = POS[i * 3], y = POS[i * 3 + 1], z = POS[i * 3 + 2];
      if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
    }
  }

  // uniform stride down-sample
  const stride = Math.max(1, Math.ceil(total / TARGET_POINTS));
  const count = Math.floor((total + stride - 1) / stride);
  const sx = new Float32Array(count), sy = new Float32Array(count), sz = new Float32Array(count);
  const rgb = colors ? new Float32Array(count * 3) : null;
  const intensity = intensityFull ? new Float32Array(count) : null;
  const classification = classFull ? new Uint8Array(count) : null;
  for (let i = 0, j = 0; j < count && i < total; i += stride, j++) {
    sx[j] = POS[i * 3]; sy[j] = POS[i * 3 + 1]; sz[j] = POS[i * 3 + 2];
    if (rgb) { rgb[j * 3] = colors[i * 3]; rgb[j * 3 + 1] = colors[i * 3 + 1]; rgb[j * 3 + 2] = colors[i * 3 + 2]; }
    if (intensity) intensity[j] = intensityFull[i];
    if (classification) classification[j] = classFull[i];
  }
  onProgress?.(0.92);
  return { sx, sy, sz, rgb, intensity, classification, bounds: { minX, minY, minZ, maxX, maxY, maxZ }, total, count };
}

/* ─────────────────────── streaming text parser ───────────────────────── */
async function parseText(file, onProgress) {
  const reader = file.stream().getReader();
  const dec = new TextDecoder("utf-8");
  const cap = TARGET_POINTS;
  const sx = new Float32Array(cap), sy = new Float32Array(cap), sz = new Float32Array(cap);
  let rgb = null, intensity = null, classification = null;
  let map = null, delim = null;             // column mapping + delimiter
  let seen = 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let buf = "", read = 0;
  const size = file.size || 1;

  const detect = (line) => {
    delim = line.includes(",") ? "," : line.includes(";") ? ";" : line.includes("\t") ? "\t" : /\s+/;
    const parts = line.trim().split(delim).filter((p) => p !== "");
    const nc = parts.length;
    const m = { x: 0, y: 1, z: 2, i: -1, r: -1, g: -1, b: -1 };
    if (nc === 4) m.i = 3;
    else if (nc === 6) { m.r = 3; m.g = 4; m.b = 5; }
    else if (nc >= 7) { m.i = 3; m.r = 4; m.g = 5; m.b = 6; }
    else if (nc === 5) m.i = 3;
    if (m.i >= 0) intensity = new Float32Array(cap);
    if (m.r >= 0) rgb = new Float32Array(cap * 3);
    return m;
  };

  const handleLine = (line) => {
    if (!line) return;
    const t = line.trim();
    if (!t || t[0] === "#" || t[0] === "/") return;
    if (!map) {
      // header row? first token not a finite number → skip and wait for data
      const probe = t.split(t.includes(",") ? "," : t.includes(";") ? ";" : /\s+/)[0];
      if (!isFinite(parseFloat(probe))) return;
      map = detect(t);
    }
    const p = t.split(delim);
    const x = +p[map.x], y = +p[map.y], z = +p[map.z];
    if (!isFinite(x) || !isFinite(y) || !isFinite(z)) return;
    if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
    if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;

    // reservoir sampling into fixed buffers
    let slot = -1;
    if (seen < cap) slot = seen;
    else { const j = Math.floor(Math.random() * (seen + 1)); if (j < cap) slot = j; }
    if (slot >= 0) {
      sx[slot] = x; sy[slot] = y; sz[slot] = z;
      if (intensity && map.i >= 0) intensity[slot] = +p[map.i] || 0;
      if (rgb && map.r >= 0) { rgb[slot * 3] = +p[map.r] || 0; rgb[slot * 3 + 1] = +p[map.g] || 0; rgb[slot * 3 + 2] = +p[map.b] || 0; }
    }
    seen++;
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    read += value.byteLength;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      handleLine(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
    }
    onProgress?.(Math.min(0.95, read / size));
  }
  handleLine(buf);

  const count = Math.min(seen, cap);
  // normalize rgb if it looks like 0..255
  if (rgb) {
    let mx = 0; for (let i = 0; i < Math.min(rgb.length, 9000); i++) if (rgb[i] > mx) mx = rgb[i];
    if (mx > 1.5) for (let i = 0; i < count * 3; i++) rgb[i] /= 255;
  }
  const slice = (a, w = 1) => (a && count < cap ? a.slice(0, count * w) : a);
  return {
    sx: slice(sx), sy: slice(sy), sz: slice(sz),
    rgb: slice(rgb, 3), intensity: slice(intensity), classification,
    bounds: { minX, minY, minZ, maxX, maxY, maxZ }, total: seen, count,
  };
}

/* ─────────────────────────────── public API ──────────────────────────── */
export async function loadPointCloud(file, { onProgress } = {}) {
  const name = file.name || "cloud";
  const ext = (name.split(".").pop() || "").toLowerCase();
  const meta = { name, ext, sizeBytes: file.size };

  let parsed;
  if (ext === "las" || ext === "laz") {
    const buf = await file.arrayBuffer();
    parsed = await parseLoaders(buf, LASLoader, onProgress);
  } else if (ext === "ply") {
    const buf = await file.arrayBuffer();
    parsed = await parseLoaders(buf, PLYLoader, onProgress);
  } else if (["xyz", "pts", "csv", "txt", "asc"].includes(ext)) {
    parsed = await parseText(file, onProgress);
  } else {
    throw new Error(`Unsupported file type ".${ext}". Use LAS/LAZ, PLY, or XYZ/PTS/CSV.`);
  }
  if (!parsed.count) throw new Error("No valid points found in file.");
  onProgress?.(1);
  return finalize(parsed, meta);
}

/* ───────────── synthetic demo corridor (same dataset shape) ───────────── */
function makeRng(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}

export function demoDataset() {
  const r = makeRng("powertek-demo");
  const X = [], Y = [], Z = [], CL = [];
  const push = (x, y, z, c) => { X.push(x); Y.push(y); Z.push(z); CL.push(c); };

  // ground
  for (let i = 0; i < 9000; i++) {
    const x = -74 + r() * 148, y = -22 + r() * 44;
    push(x, y, Math.sin(x * 0.05) * 0.6 + Math.cos(y * 0.08) * 0.5 + (r() - 0.5) * 0.5, 2);
  }
  // towers (class 15)
  const towers = [-60, -36, -12, 12, 36, 60];
  towers.forEach((tx) => {
    for (let k = 0; k <= 170; k++) {
      const t = k / 170, w = 2.6 * (1 - t) + 0.9 * t, z = t * 20;
      for (const sxn of [-1, 1]) for (const syn of [-1, 1]) push(tx + sxn * w + (r() - 0.5) * 0.18, syn * w + (r() - 0.5) * 0.18, z, 15);
    }
    for (const az of [15.4, 18]) for (let s = 0; s <= 46; s++) push(tx + (r() - 0.5) * 0.4, -8 + (s / 46) * 16, az + (r() - 0.5) * 0.25, 15);
  });
  // conductors (class 14)
  const wire = (yoff, h, sag) => {
    for (let i = 0; i < towers.length - 1; i++) {
      const x0 = towers[i], x1 = towers[i + 1];
      for (let s = 0; s <= 240; s++) { const tt = s / 240; push(x0 + (x1 - x0) * tt + (r() - 0.5) * 0.1, yoff + (r() - 0.5) * 0.12, h - sag * 4 * tt * (1 - tt) + (r() - 0.5) * 0.08, 14); }
    }
  };
  [-7, 0, 7].forEach((y) => wire(y, 16, 3));
  wire(0, 19.6, 2);
  // vegetation (class 5)
  for (let c = 0; c < 16; c++) {
    const enc = c % 5 === 0, cx = -66 + r() * 132, cy = enc ? -7 + r() * 14 : (r() > 0.5 ? 1 : -1) * (12 + r() * 9), top = enc ? 9 + r() * 5 : 3 + r() * 4, rad = 2.6 + r() * 2.4;
    for (let i = 0; i < 340; i++) { const a = r() * Math.PI * 2, rr = Math.pow(r(), 0.5) * rad; push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, Math.pow(r(), 0.7) * top, 5); }
  }

  const n = X.length;
  const sx = Float32Array.from(X), sy = Float32Array.from(Y), sz = Float32Array.from(Z);
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i++) { if (sx[i] < minX) minX = sx[i]; if (sy[i] < minY) minY = sy[i]; if (sz[i] < minZ) minZ = sz[i]; if (sx[i] > maxX) maxX = sx[i]; if (sy[i] > maxY) maxY = sy[i]; if (sz[i] > maxZ) maxZ = sz[i]; }

  return finalize(
    { sx, sy, sz, rgb: null, intensity: null, classification: Uint8Array.from(CL), bounds: { minX, minY, minZ, maxX, maxY, maxZ }, total: n, count: n },
    { id: "demo", name: "Sample corridor (demo)", ext: "demo", sizeBytes: 0 }
  );
}

/* ── small formatting helpers ── */
export const fmtInt = (n) => (n ?? 0).toLocaleString("en-US");
export const fmtBytes = (b) => {
  if (!b) return "—";
  const u = ["B", "KB", "MB", "GB"]; let i = 0, v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
};
export const fmtNum = (n, d = 1) => (n == null || !isFinite(n) ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: d }));

/* histogram of a normalized attribute (0..1) mapped back to a real range */
export function histogram(values, count, bins, realMin, realMax) {
  const h = new Array(bins).fill(0);
  for (let i = 0; i < count; i++) { let b = Math.floor(values[i] * bins); if (b >= bins) b = bins - 1; if (b < 0) b = 0; h[b]++; }
  const span = (realMax - realMin) / bins;
  return h.map((c, i) => ({ bin: realMin + span * (i + 0.5), label: (realMin + span * (i + 0.5)).toFixed(1), count: c }));
}
