// PolyPeek logosunun 3D hali -> .glb (bağımlılık yok)
const fs = require('fs');

// ---------- geometri yardımcıları ----------
function mesh() { return { pos: [], nrm: [], idx: [] }; }
function addVert(m, p, n) { m.pos.push(...p); m.nrm.push(...n); return m.pos.length / 3 - 1; }
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => mul(a, 1 / len(a));

function sphere(m, c, r, seg = 24, ring = 16) {
  const base = m.pos.length / 3;
  for (let i = 0; i <= ring; i++) {
    const th = (i / ring) * Math.PI;
    for (let j = 0; j <= seg; j++) {
      const ph = (j / seg) * Math.PI * 2;
      const n = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
      addVert(m, add(c, mul(n, r)), n);
    }
  }
  for (let i = 0; i < ring; i++) for (let j = 0; j < seg; j++) {
    const a = base + i * (seg + 1) + j, b = a + seg + 1;
    m.idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
}

// a -> b arası tüp (uçları kürelerle kapanacak)
function tube(m, a, b, r, seg = 20) {
  const d = norm(sub(b, a));
  const up = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = norm(cross(d, up)), v = cross(d, u);
  const base = m.pos.length / 3;
  for (let k = 0; k < 2; k++) {
    const c = k ? b : a;
    for (let j = 0; j <= seg; j++) {
      const t = (j / seg) * Math.PI * 2;
      const n = add(mul(u, Math.cos(t)), mul(v, Math.sin(t)));
      addVert(m, add(c, mul(n, r)), n);
    }
  }
  for (let j = 0; j < seg; j++) {
    const a0 = base + j, b0 = base + seg + 1 + j;
    m.idx.push(a0, a0 + 1, b0, b0, a0 + 1, b0 + 1);
  }
}

// Yuvarlak köşeli karo (z0..z1), hafif pahlı ön yüz
function roundedTile(m, half, r, z0, z1, bevel) {
  const outline = (h, rr) => {
    const pts = [], corners = [[h - rr, h - rr, 0], [-(h - rr), h - rr, 90], [-(h - rr), -(h - rr), 180], [h - rr, -(h - rr), 270]];
    for (const [cx, cy, a0] of corners) for (let i = 0; i <= 8; i++) {
      const a = ((a0 + (i / 8) * 90) * Math.PI) / 180;
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    return pts;
  };
  const outer = outline(half, r), inner = outline(half - bevel, r - bevel);
  const N = outer.length;
  // arka yüz
  const bc = addVert(m, [0, 0, z0], [0, 0, -1]);
  const bs = outer.map((p) => addVert(m, [p[0], p[1], z0], [0, 0, -1]));
  for (let i = 0; i < N; i++) m.idx.push(bc, bs[(i + 1) % N], bs[i]);
  // yan yüzler
  for (let i = 0; i < N; i++) {
    const p = outer[i], q = outer[(i + 1) % N];
    const n = norm([q[1] - p[1], -(q[0] - p[0]), 0]);
    const a = addVert(m, [p[0], p[1], z0], n), b = addVert(m, [q[0], q[1], z0], n);
    const c = addVert(m, [q[0], q[1], z1 - bevel], n), d = addVert(m, [p[0], p[1], z1 - bevel], n);
    m.idx.push(a, b, c, a, c, d);
  }
  // pah
  for (let i = 0; i < N; i++) {
    const p = outer[i], q = outer[(i + 1) % N], pi = inner[i], qi = inner[(i + 1) % N];
    const n = norm(add(norm([q[1] - p[1], -(q[0] - p[0]), 0]), [0, 0, 1]));
    const a = addVert(m, [p[0], p[1], z1 - bevel], n), b = addVert(m, [q[0], q[1], z1 - bevel], n);
    const c = addVert(m, [qi[0], qi[1], z1], n), d = addVert(m, [pi[0], pi[1], z1], n);
    m.idx.push(a, b, c, a, c, d);
  }
  // ön yüz
  const fc = addVert(m, [0, 0, z1], [0, 0, 1]);
  const fs_ = inner.map((p) => addVert(m, [p[0], p[1], z1], [0, 0, 1]));
  for (let i = 0; i < N; i++) m.idx.push(fc, fs_[i], fs_[(i + 1) % N]);
}

// Ön yüzde üçgenin hafif dolgusu
function triFill(m, a, b, c) {
  const n = [0, 0, 1];
  const i0 = addVert(m, a, n), i1 = addVert(m, b, n), i2 = addVert(m, c, n);
  m.idx.push(i0, i1, i2);
}

// ---------- sahne ----------
const Z = 0.16;
const top = [0, 0.6, Z], bl = [-0.66, -0.56, Z], br = [0.66, -0.56, Z];
const mid = (p, q) => mul(add(p, q), 0.5);
const ml = mid(top, bl), mr = mid(top, br), mb = mid(bl, br);
const edges = [
  [top, ml], [ml, bl], [bl, mb], [mb, br], [br, mr], [mr, top], // dış
  [ml, mr], [mr, mb], [mb, ml],                                   // iç
];

// Gradyan: sol alt yeşil -> mor -> sağ üst pembe (ikondaki gibi)
const stops = [[0, [0x34, 0xd3, 0x99]], [0.55, [0x8b, 0x5c, 0xf6]], [1, [0xec, 0x48, 0x99]]];
function grad(p) {
  let t = (p[0] + 0.66) / 1.32;
  t = Math.min(1, Math.max(0, t));
  for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) {
    const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
    const k = (t - t0) / (t1 - t0);
    return c0.map((v, j) => (v + (c1[j] - v) * k) / 255);
  }
  return stops[stops.length - 1][1].map((v) => v / 255);
}
const lin = (c) => c.map((v) => Math.pow(v, 2.2)); // glTF renkleri lineer

const nodes = [];
const materials = [];
const meshes = [];
function addPart(name, m, mat) {
  materials.push(mat);
  meshes.push({ name, m, mat: materials.length - 1 });
}

const tile = mesh();
roundedTile(tile, 1, 0.44, -0.22, 0.04, 0.05);
addPart('Tile', tile, { name: 'Tile', pbrMetallicRoughness: { baseColorFactor: [...lin([0.09, 0.08, 0.17]), 1], metallicFactor: 0.35, roughnessFactor: 0.32 } });

const fill = mesh();
triFill(fill, [top[0], top[1], 0.045], [bl[0], bl[1], 0.045], [br[0], br[1], 0.045]);
addPart('TriangleFill', fill, { name: 'TriangleFill', pbrMetallicRoughness: { baseColorFactor: [...lin([0.17, 0.11, 0.33]), 1], metallicFactor: 0, roughnessFactor: 0.7 }, emissiveFactor: lin([0.05, 0.03, 0.11]) });

edges.forEach(([a, b], i) => {
  const m = mesh();
  const outer = i < 6;
  tube(m, a, b, outer ? 0.05 : 0.032);
  const c = lin(grad(mid(a, b)));
  addPart(`Edge_${i + 1}`, m, { name: `Edge_${i + 1}`, pbrMetallicRoughness: { baseColorFactor: [...c, 1], metallicFactor: 0.1, roughnessFactor: 0.25 }, emissiveFactor: c });
});

const dots = mesh();
for (const p of [top, bl, br, ml, mr, mb]) sphere(dots, p, 0.085);
addPart('Vertices', dots, { name: 'Vertices', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.2 }, emissiveFactor: [0.9, 0.9, 0.95] });

// ---------- glTF yazıcı ----------
const bufs = [];
let offset = 0;
const bufferViews = [], accessors = [];
function pushView(arr, target) {
  const b = Buffer.from(arr.buffer);
  const pad = (4 - (b.length % 4)) % 4;
  bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: b.length, target });
  bufs.push(b, Buffer.alloc(pad));
  offset += b.length + pad;
  return bufferViews.length - 1;
}
const gMeshes = [];
for (const { name, m, mat } of meshes) {
  const P = new Float32Array(m.pos), N = new Float32Array(m.nrm);
  const big = m.pos.length / 3 > 65535;
  const I = big ? new Uint32Array(m.idx) : new Uint16Array(m.idx);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], P[i + k]); max[k] = Math.max(max[k], P[i + k]); }
  accessors.push({ bufferView: pushView(P, 34962), componentType: 5126, count: P.length / 3, type: 'VEC3', min, max });
  const pa = accessors.length - 1;
  accessors.push({ bufferView: pushView(N, 34962), componentType: 5126, count: N.length / 3, type: 'VEC3' });
  const na = accessors.length - 1;
  accessors.push({ bufferView: pushView(I, 34963), componentType: big ? 5125 : 5123, count: I.length, type: 'SCALAR' });
  const ia = accessors.length - 1;
  gMeshes.push({ name, primitives: [{ attributes: { POSITION: pa, NORMAL: na }, indices: ia, material: mat }] });
  nodes.push({ name, mesh: gMeshes.length - 1 });
}
nodes.push({ name: 'PolyPeek', children: nodes.map((_, i) => i) });

const gltf = {
  asset: { version: '2.0', generator: 'PolyPeek logo generator' },
  scene: 0,
  scenes: [{ name: 'PolyPeek', nodes: [nodes.length - 1] }],
  nodes, meshes: gMeshes, materials, accessors, bufferViews,
  buffers: [{ byteLength: offset }],
};

const bin = Buffer.concat(bufs);
let json = Buffer.from(JSON.stringify(gltf));
json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(json.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
const out = process.argv[2] || 'polypeek-logo.glb';
fs.writeFileSync(out, Buffer.concat([header, jh, json, bh, bin]));
const tris = meshes.reduce((s, x) => s + x.m.idx.length / 3, 0);
console.log(out, 'bytes:', 12 + 16 + json.length + bin.length, 'triangles:', tris);
