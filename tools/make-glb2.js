// PolyPeek sahnesi: logo + sırayla açılan 3 tanıtım paneli (animasyonlu) -> .glb
const fs = require('fs');
const path = require('path');
const DIR = __dirname;

// ---------- geometri ----------
function mesh(uv = false) { return { pos: [], nrm: [], uv: uv ? [] : null, idx: [] }; }
function addVert(m, p, n, t) { m.pos.push(...p); m.nrm.push(...n); if (m.uv) m.uv.push(...(t || [0, 0])); return m.pos.length / 3 - 1; }
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => mul(a, 1 / Math.hypot(a[0], a[1], a[2]));

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

function tube(m, a, b, r, seg = 20) {
  const d = norm(sub(b, a));
  const up = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = norm(cross(d, up)), v = cross(d, u);
  const base = m.pos.length / 3;
  for (let k = 0; k < 2; k++) {
    const c = k ? b : a;
    for (let j = 0; j <= seg; j++) {
      const t = (j / seg) * Math.PI * 2;
      addVert(m, add(c, mul(add(mul(u, Math.cos(t)), mul(v, Math.sin(t))), r)), add(mul(u, Math.cos(t)), mul(v, Math.sin(t))));
    }
  }
  for (let j = 0; j < seg; j++) {
    const a0 = base + j, b0 = base + seg + 1 + j;
    m.idx.push(a0, a0 + 1, b0, b0, a0 + 1, b0 + 1);
  }
}

// Yuvarlak köşeli, pahlı karo. hw/hh: yarı genişlik/yükseklik
function roundedTile(m, hw, hh, r, z0, z1, bevel) {
  const outline = (w, h, rr) => {
    const pts = [], cs = [[w - rr, h - rr, 0], [-(w - rr), h - rr, 90], [-(w - rr), -(h - rr), 180], [w - rr, -(h - rr), 270]];
    for (const [cx, cy, a0] of cs) for (let i = 0; i <= 8; i++) {
      const a = ((a0 + (i / 8) * 90) * Math.PI) / 180;
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    return pts;
  };
  const outer = outline(hw, hh, r), inner = outline(hw - bevel, hh - bevel, r - bevel);
  const N = outer.length;
  const bc = addVert(m, [0, 0, z0], [0, 0, -1]);
  const bs = outer.map((p) => addVert(m, [p[0], p[1], z0], [0, 0, -1]));
  for (let i = 0; i < N; i++) m.idx.push(bc, bs[(i + 1) % N], bs[i]);
  for (let i = 0; i < N; i++) {
    const p = outer[i], q = outer[(i + 1) % N];
    const n = norm([q[1] - p[1], -(q[0] - p[0]), 0]);
    const a = addVert(m, [p[0], p[1], z0], n), b = addVert(m, [q[0], q[1], z0], n);
    const c = addVert(m, [q[0], q[1], z1 - bevel], n), d = addVert(m, [p[0], p[1], z1 - bevel], n);
    m.idx.push(a, b, c, a, c, d);
  }
  for (let i = 0; i < N; i++) {
    const p = outer[i], q = outer[(i + 1) % N], pi = inner[i], qi = inner[(i + 1) % N];
    const n = norm(add(norm([q[1] - p[1], -(q[0] - p[0]), 0]), [0, 0, 1]));
    const a = addVert(m, [p[0], p[1], z1 - bevel], n), b = addVert(m, [q[0], q[1], z1 - bevel], n);
    const c = addVert(m, [qi[0], qi[1], z1], n), d = addVert(m, [pi[0], pi[1], z1], n);
    m.idx.push(a, b, c, a, c, d);
  }
  const fc = addVert(m, [0, 0, z1], [0, 0, 1]);
  const fs_ = inner.map((p) => addVert(m, [p[0], p[1], z1], [0, 0, 1]));
  for (let i = 0; i < N; i++) m.idx.push(fc, fs_[i], fs_[(i + 1) % N]);
}

function quad(m, hw, hh, z) {
  const n = [0, 0, 1];
  const a = addVert(m, [-hw, -hh, z], n, [0, 1]), b = addVert(m, [hw, -hh, z], n, [1, 1]);
  const c = addVert(m, [hw, hh, z], n, [1, 0]), d = addVert(m, [-hw, hh, z], n, [0, 0]);
  m.idx.push(a, b, c, a, c, d);
}

// ---------- renkler ----------
const stops = [[0, [0x34, 0xd3, 0x99]], [0.55, [0x8b, 0x5c, 0xf6]], [1, [0xec, 0x48, 0x99]]];
function grad(x) {
  const t = Math.min(1, Math.max(0, (x + 0.66) / 1.32));
  for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) {
    const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
    const k = (t - t0) / (t1 - t0);
    return c0.map((v, j) => (v + (c1[j] - v) * k) / 255);
  }
  return stops[2][1].map((v) => v / 255);
}
const lin = (c) => c.map((v) => Math.pow(v, 2.2));

// ---------- sahne kurulumu ----------
const materials = [], meshes = [], nodes = [], images = [], textures = [];
const addMat = (m) => (materials.push(m), materials.length - 1);
const addMesh = (name, m, mat) => (meshes.push({ name, m, mat }), meshes.length - 1);
const addNode = (n) => (nodes.push(n), nodes.length - 1);

// Logo
const logoChildren = [];
{
  const tile = mesh();
  roundedTile(tile, 1, 1, 0.44, -0.22, 0.04, 0.05);
  logoChildren.push(addNode({ name: 'Tile', mesh: addMesh('Tile', tile, addMat({ name: 'Tile', pbrMetallicRoughness: { baseColorFactor: [...lin([0.09, 0.08, 0.17]), 1], metallicFactor: 0.35, roughnessFactor: 0.32 } })) }));

  const Z = 0.16;
  const top = [0, 0.6, Z], bl = [-0.66, -0.56, Z], br = [0.66, -0.56, Z];
  const mid = (p, q) => mul(add(p, q), 0.5);
  const ml = mid(top, bl), mr = mid(top, br), mb = mid(bl, br);

  const fill = mesh();
  const fz = 0.045, fn = [0, 0, 1];
  const f0 = addVert(fill, [top[0], top[1], fz], fn), f1 = addVert(fill, [bl[0], bl[1], fz], fn), f2 = addVert(fill, [br[0], br[1], fz], fn);
  fill.idx.push(f0, f1, f2);
  logoChildren.push(addNode({ name: 'TriangleFill', mesh: addMesh('TriangleFill', fill, addMat({ name: 'TriangleFill', pbrMetallicRoughness: { baseColorFactor: [...lin([0.17, 0.11, 0.33]), 1], metallicFactor: 0, roughnessFactor: 0.7 }, emissiveFactor: lin([0.05, 0.03, 0.11]) })) }));

  const edges = [[top, ml], [ml, bl], [bl, mb], [mb, br], [br, mr], [mr, top], [ml, mr], [mr, mb], [mb, ml]];
  edges.forEach(([a, b], i) => {
    const m = mesh();
    tube(m, a, b, i < 6 ? 0.05 : 0.032);
    const c = lin(grad(mid(a, b)[0]));
    logoChildren.push(addNode({ name: `Edge_${i + 1}`, mesh: addMesh(`Edge_${i + 1}`, m, addMat({ name: `Edge_${i + 1}`, pbrMetallicRoughness: { baseColorFactor: [...c, 1], metallicFactor: 0.1, roughnessFactor: 0.25 }, emissiveFactor: c })) }));
  });

  const dots = mesh();
  for (const p of [top, bl, br, ml, mr, mb]) sphere(dots, p, 0.085);
  logoChildren.push(addNode({ name: 'Vertices', mesh: addMesh('Vertices', dots, addMat({ name: 'Vertices', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.2 }, emissiveFactor: [0.9, 0.9, 0.95] })) }));
}
const LOGO_X = -2.1;
const logoNode = addNode({ name: 'PolyPeek_Logo', translation: [LOGO_X, 0, 0], children: logoChildren });

// Paneller
const PW = 2.3, PH = PW * 0.625; // 16:10
const PANEL_X = 1.75;
const frameMesh = (() => { const m = mesh(); roundedTile(m, PW + 0.09, PH + 0.09, 0.12, -0.08, 0.0, 0.03); return m; })();
const frameMat = addMat({ name: 'PanelFrame', pbrMetallicRoughness: { baseColorFactor: [...lin([0.07, 0.06, 0.13]), 1], metallicFactor: 0.4, roughnessFactor: 0.3 }, emissiveFactor: lin([0.04, 0.02, 0.08]) });
const frameMeshIdx = addMesh('PanelFrame', frameMesh, frameMat);
const screenMesh = (() => { const m = mesh(true); quad(m, PW, PH, 0.006); return m; })();

const panelNodes = [];
for (let i = 1; i <= 3; i++) {
  images.push({ file: path.join(DIR, `panel${i}.jpg`), name: `Panel_${i}` });
  textures.push({ sampler: 0, source: images.length - 1 });
  const tex = { index: textures.length - 1 };
  const mat = addMat({
    name: `Screen_${i}`,
    pbrMetallicRoughness: { baseColorTexture: tex, baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 },
    emissiveTexture: tex, emissiveFactor: [1, 1, 1],
    extensions: { KHR_materials_unlit: {} },
  });
  const screen = addNode({ name: `Screen_${i}`, mesh: addMesh(`Screen_${i}`, screenMesh, mat) });
  const frame = addNode({ name: `Frame_${i}`, mesh: frameMeshIdx });
  panelNodes.push(addNode({ name: `Panel_${i}`, translation: [PANEL_X, 0, 0.02 * i], scale: [0.001, 0.001, 0.001], children: [frame, screen] }));
}

const root = addNode({ name: 'PolyPeek', children: [logoNode, ...panelNodes] });

// ---------- animasyon ----------
const T = 12, SLOT = 4;
const anim = { name: 'PolyPeek_Showcase', channels: [], samplers: [] };
const animData = []; // {input:Float32Array, output:Float32Array, type}
function addChannel(node, pathName, times, values, type) {
  animData.push({ times: new Float32Array(times), values: new Float32Array(values.flat()), type });
  anim.samplers.push({ input: -1, output: -1, interpolation: 'LINEAR', _d: animData.length - 1 });
  anim.channels.push({ sampler: anim.samplers.length - 1, target: { node, path: pathName } });
}

// Panel ölçek animasyonu: 0 -> 1.06 -> 1 (bekle) -> 0
const S0 = 0.001;
panelNodes.forEach((node, k) => {
  const s = k * SLOT;
  const keys = [];
  if (s > 0) keys.push([0, S0]);
  keys.push([s, S0], [s + 0.35, 1.06], [s + 0.5, 1], [s + 3.45, 1], [s + 3.8, S0]);
  if (s + 3.8 < T) keys.push([T, S0]);
  addChannel(node, 'scale', keys.map((x) => x[0]), keys.map((x) => [x[1], x[1], x[1]]), 'VEC3');
});

// Logo: hafif sağa-sola dönme + yukarı-aşağı süzülme
const qY = (deg) => { const r = (deg * Math.PI) / 360; return [0, Math.sin(r), 0, Math.cos(r)]; };
const lt = [];
const lr = [], lp = [];
for (let i = 0; i <= 24; i++) {
  const t = (i / 24) * T;
  lt.push(t);
  lr.push(qY(18 * Math.sin((t / T) * Math.PI * 2)));
  lp.push([LOGO_X, 0.06 * Math.sin((t / T) * Math.PI * 4), 0]);
}
addChannel(logoNode, 'rotation', lt, lr, 'VEC4');
addChannel(logoNode, 'translation', lt, lp, 'VEC3');

// ---------- glTF yazıcı ----------
const bufs = [];
let offset = 0;
const bufferViews = [], accessors = [];
function pushBytes(b, target) {
  const pad = (4 - (b.length % 4)) % 4;
  const v = { buffer: 0, byteOffset: offset, byteLength: b.length };
  if (target) v.target = target;
  bufferViews.push(v);
  bufs.push(b, Buffer.alloc(pad));
  offset += b.length + pad;
  return bufferViews.length - 1;
}
const pushView = (arr, target) => pushBytes(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength), target);
function minmax(arr, comps) {
  const min = Array(comps).fill(Infinity), max = Array(comps).fill(-Infinity);
  for (let i = 0; i < arr.length; i += comps) for (let k = 0; k < comps; k++) { min[k] = Math.min(min[k], arr[i + k]); max[k] = Math.max(max[k], arr[i + k]); }
  return { min, max };
}

const gMeshes = meshes.map(({ name, m, mat }) => {
  const P = new Float32Array(m.pos), N = new Float32Array(m.nrm);
  const big = m.pos.length / 3 > 65535;
  const I = big ? new Uint32Array(m.idx) : new Uint16Array(m.idx);
  accessors.push({ bufferView: pushView(P, 34962), componentType: 5126, count: P.length / 3, type: 'VEC3', ...minmax(P, 3) });
  const attributes = { POSITION: accessors.length - 1 };
  accessors.push({ bufferView: pushView(N, 34962), componentType: 5126, count: N.length / 3, type: 'VEC3' });
  attributes.NORMAL = accessors.length - 1;
  if (m.uv) {
    const U = new Float32Array(m.uv);
    accessors.push({ bufferView: pushView(U, 34962), componentType: 5126, count: U.length / 2, type: 'VEC2' });
    attributes.TEXCOORD_0 = accessors.length - 1;
  }
  accessors.push({ bufferView: pushView(I, 34963), componentType: big ? 5125 : 5123, count: I.length, type: 'SCALAR' });
  return { name, primitives: [{ attributes, indices: accessors.length - 1, material: mat }] };
});

const gImages = images.map((im) => ({ name: im.name, mimeType: 'image/jpeg', bufferView: pushBytes(fs.readFileSync(im.file)) }));

for (const s of anim.samplers) {
  const d = animData[s._d];
  accessors.push({ bufferView: pushView(d.times), componentType: 5126, count: d.times.length, type: 'SCALAR', min: [d.times[0]], max: [d.times[d.times.length - 1]] });
  s.input = accessors.length - 1;
  accessors.push({ bufferView: pushView(d.values), componentType: 5126, count: d.times.length, type: d.type });
  s.output = accessors.length - 1;
  delete s._d;
}

const gltf = {
  asset: { version: '2.0', generator: 'PolyPeek scene generator' },
  extensionsUsed: ['KHR_materials_unlit'],
  scene: 0,
  scenes: [{ name: 'PolyPeek', nodes: [root] }],
  nodes, meshes: gMeshes, materials,
  samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
  images: gImages, textures,
  animations: [anim],
  accessors, bufferViews,
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
const out = process.argv[2] || 'polypeek-showcase.glb';
fs.writeFileSync(out, Buffer.concat([header, jh, json, bh, bin]));
console.log(out, 'KB:', Math.round((28 + json.length + bin.length) / 1024), 'triangles:', meshes.reduce((s, x) => s + x.m.idx.length / 3, 0));
