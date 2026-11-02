import * as THREE from 'three';
import { makeProblem } from './math.js';
import { Sound } from './audio.js';

const $ = (s) => document.querySelector(s);
const { clamp, lerp, smoothstep } = THREE.MathUtils;

// ---------------------------------------------------------------- constants
const R = 130;        // a new land every 130 units
const CH = 44;        // prop chunk size
const VIEW = 2;       // chunks around the player (5x5)
const SAVE = 'emmaworld.v2';
const TYPES = ['wood', 'stone', 'bloom', 'spark'];
const LABEL = { wood: 'Wood', stone: 'Stone', bloom: 'Bloom', spark: 'Spark' };
const ICON = { wood: 'Wood', stone: 'Stone', bloom: 'Bloom', spark: 'Spark' };
const GATHER = { tree: 'wood', rock: 'stone', flower: 'bloom', crystal: 'spark' };
const TAKEDOWN = 8000; // a node regrows after 8s

// ---------------------------------------------------------------- state
const store = JSON.parse(localStorage.getItem(SAVE) || '{}');
const save = Object.assign(
  { seed: (Math.random() * 1e9) | 0, x: R / 2, z: R / 2, gates: [], restored: [], res: { wood: 0, stone: 0, bloom: 0, spark: 0 }, stickers: 0 },
  store,
);
if (save.x === 0 && save.z === 0) { save.x = R / 2; save.z = R / 2; }
if (!save.gates.length) save.gates.push(regionKey(save.x, save.z));
save.friends ||= []; save.camps ||= []; save.fireflies ||= false;
save.journal ||= []; save.badges ||= []; save.catches ||= []; save.notes ||= [];
save.garden ||= []; save.gifts ||= 0; save.names ||= {}; save.postcards ||= [];
save.caves ||= []; save.treasure ||= [];
  save.mathLvl ||= 0; save.mStreak ||= 0; save.quests ||= {}; save.giant ||= false; save.decor ||= [];
save.crossed ||= 0; save.bestSkip ||= 0; save.boat ||= false;
save.painting ||= ''; save.giftDay ||= '';
const persist = () => { save.lastSeen = Date.now(); localStorage.setItem(SAVE, JSON.stringify(save)); };

function regionKey(x, z) { return `${Math.floor(x / R)},${Math.floor(z / R)}`; }
function mulberry(a) {
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash2 = (x, z, s) => {
  let h = Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(s, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};

// smooth value noise + a coordinate warp: the world is laid out on a grid, this
// bends the grid so nothing lines up. Cheap, pure, and stable for a given seed.
const vnoise = (x, z, s) => {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const h = (a, b) => hash2(a, b, s) / 4294967296;
  return lerp(lerp(h(xi, zi), h(xi + 1, zi), u), lerp(h(xi, zi + 1), h(xi + 1, zi + 1), u), v);
};
const warp = (x, z) => {
  const s = save.seed;
  return [
    x + (vnoise(x / 190, z / 190, s + 11) - 0.5) * 74 + (vnoise(x / 62, z / 62, s + 13) - 0.5) * 20,
    z + (vnoise(x / 190, z / 190, s + 12) - 0.5) * 74 + (vnoise(x / 62, z / 62, s + 14) - 0.5) * 20,
  ];
};

// ---------------------------------------------------------------- renderer
window.__errs = [];
{
  const ce = console.error.bind(console);
  console.error = (...a) => { window.__errs.push(String(a[0]).slice(0, 300)); ce(...a); };
}
const renderer = new THREE.WebGLRenderer({ canvas: $('#c'), antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 500);
scene.fog = new THREE.Fog(0x9ec6d8, 38, 135);

const hemi = new THREE.HemisphereLight(0xdfefff, 0x5b7a45, 0.8);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff3d6, 1.15);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 160 });
sun.shadow.bias = -0.0018;
scene.add(sun, sun.target);

const moon = new THREE.DirectionalLight(0xa8c4ff, 0);
scene.add(moon);

// ---------------------------------------------------------------- ground
// One plane that follows the player; the colour comes from world-space noise,
// so the meadow never repeats and never seams.
const MONTH = new Date().getMonth();
const SEASON = MONTH < 2 || MONTH === 11 ? 'winter' : MONTH < 5 ? 'spring' : MONTH < 8 ? 'summer' : 'autumn';
const snowU = { value: SEASON === 'winter' ? 0.5 : 0 };
const seasonTint = { value: new THREE.Color(SEASON === 'autumn' ? 0xa8813a : SEASON === 'spring' ? 0x7fc46a : 0xffffff) };
const seasonAmt = { value: SEASON === 'autumn' ? 0.2 : SEASON === 'spring' ? 0.1 : 0 };
const groundMat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
groundMat.onBeforeCompile = (sh) => {
  sh.uniforms.uSnow = snowU;
  sh.uniforms.uTint = seasonTint;
  sh.uniforms.uTintAmt = seasonAmt;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vW;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = (modelMatrix * vec4(position,1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>
      uniform float uSnow;
      uniform vec3 uTint;
      uniform float uTintAmt;
      varying vec3 vW;
      float gh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float gn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(gh(i), gh(i+vec2(1,0)), f.x), mix(gh(i+vec2(0,1)), gh(i+vec2(1,1)), f.x), f.y); }
      float gf(vec2 p){ float s=0.0, a=0.55; for(int i=0;i<4;i++){ s+=gn(p)*a; p*=2.07; a*=0.5; } return s; }`)
    .replace('#include <color_fragment>', `#include <color_fragment>
      vec2 gp = vW.xz * 0.045;
      float f1 = gf(gp);
      float f2 = gf(gp * 0.33 + 17.0);
      vec3 cA = vec3(0.15,0.33,0.16);
      vec3 cB = vec3(0.26,0.47,0.21);
      vec3 cC = vec3(0.45,0.61,0.26);
      vec3 col = mix(cA, cB, smoothstep(0.28,0.74,f1));
      col = mix(col, cC, smoothstep(0.58,0.95,f2)*0.65);
      float dots = smoothstep(0.72, 0.95, gn(vW.xz * 1.7 + 5.0));
      col = mix(col, vec3(0.86,0.82,0.60), dots * 0.28);
      col = mix(col, uTint, uTintAmt);
      float worn = smoothstep(0.60, 0.9, gf(vW.xz * 0.09 + 41.0));
      col = mix(col, vec3(0.52,0.48,0.31), worn * 0.30);
      float pxw = vW.x + sin(vW.z * 0.019) * 11.0 + sin(vW.z * 0.047 + 1.7) * 4.0;
      float dxp = mod(pxw - 50.0, 47.0) - 15.0;
      float px = abs(dxp + 4.0 * sin(vW.z * 0.06) + 1.5 * sin(vW.z * 0.017));
      float path = 1.0 - smoothstep(1.9, 3.4, px);
      float grit = 0.82 + 0.18 * gn(vW.xz * 9.0);
      col = mix(col, vec3(0.50, 0.42, 0.30) * grit, path * 0.9);
      col = mix(col, vec3(0.44, 0.36, 0.26), (1.0 - smoothstep(1.0, 1.5, px)) * 0.35);
      col = mix(col, vec3(0.88, 0.92, 0.99), uSnow * 0.72);
      diffuseColor.rgb *= col * 1.05;`);
};
const ground = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// a soft round dot, shared by stars, fireflies and sparkles (points are square by default)
const dotTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, '#fff');
  grd.addColorStop(0.45, 'rgba(255,255,255,.85)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
})();

// ---------------------------------------------------------------- sky
const stars = (() => {
  const n = 420, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, y = Math.random() * 0.9 + 0.05, r = 190;
    const rr = Math.sqrt(1 - y * y) * r;
    pos.set([Math.cos(a) * rr, y * r, Math.sin(a) * rr], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ map: dotTex, color: 0xffffff, size: 1.4, transparent: true, opacity: 0, depthWrite: false });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  scene.add(p);
  return p;
})();

// ---------------------------------------------------------------- sky dome
const skyTop = new THREE.Color(0x0a1430), skyBot = new THREE.Color(0x8fc4dd);
const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(260, 20, 14),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: skyTop }, bot: { value: skyBot } },
    vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying float h; void main(){ gl_FragColor = vec4(mix(bot, top, smoothstep(-0.05, 0.55, h)), 1.0); }',
  }),
);
skyDome.frustumCulled = false;
scene.add(skyDome);

// ---------------------------------------------------------------- sky props
const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, fog: false, depthWrite: false });
const clouds = [];
for (let i = 0; i < 16; i++) {
  const g = new THREE.Group();
  const puffs = 3 + Math.floor(Math.random() * 4);
  for (let j = 0; j < puffs; j++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(5 + Math.random() * 7, 6, 4), cloudMat);
    m.position.set((Math.random() - 0.5) * 24, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 12);
    m.scale.y = 0.4;
    g.add(m);
  }
  g.position.set(save.x + (Math.random() - 0.5) * 300, 15 + Math.random() * 13, save.z + (Math.random() - 0.5) * 300);
  scene.add(g);
  clouds.push(g);
}
const discMat = (hex, op) => new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: op, fog: false, depthWrite: false });
const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(11, 22), discMat(0xfff3c8, 0.95));
const moonDisc = new THREE.Mesh(new THREE.CircleGeometry(7, 18), discMat(0xe6efff, 0.9));
{
  // the real moon: a dark disc slides across the face, new moon anchored to
  // 2000-01-06 18:14 UTC, so tonight's sky matches the one out the window
  const SYN = 29.530588853, NEW_MOON = 10962.76;   // unix days
  const age = (((Date.now() / 864e5 - NEW_MOON) % SYN) + SYN) % SYN;
  const lit = (1 - Math.cos((age / SYN) * Math.PI * 2)) / 2;   // 0 new, 1 full
  const R = 7, waxing = age < SYN / 2;
  const shade = new THREE.Mesh(new THREE.CircleGeometry(R, 18), discMat(0x0b1226, 0.94));
  shade.position.set((waxing ? -1 : 1) * 2 * R * lit, 0, 0.3);   // waxing lit on the right
  moonDisc.add(shade);
  // new moon is a dark disc with a steady faint glow around it
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: dotTex, color: 0xdfe9ff, transparent: true, opacity: 0.55 * (1 - lit) ** 3,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.scale.set(32, 32, 1);
  moonDisc.add(halo);
}
scene.add(sunDisc, moonDisc);

// ---------------------------------------------------------------- props
const wind = { value: 0 };

// props fade out when they get between the camera and the player
const nearCut = (m) => {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying vec3 vW;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       #ifdef USE_INSTANCING
         vW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
       #else
         vW = (modelMatrix * vec4(transformed, 1.0)).xyz;
       #endif`,
    );
    sh.fragmentShader = 'varying vec3 vW;\n' + sh.fragmentShader.replace(
      'void main() {',
      'void main() {\n  if (distance(vW, cameraPosition) < 1.7) discard;',
    );
  };
  return m;
};

const windify = (m, amp) => {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uWind = wind;
    sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float phase = uWind * 1.6 + position.y * 1.4;
       #ifdef USE_INSTANCING
         phase += instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.27;
       #endif
       transformed.x += sin(phase) * ${amp} * max(position.y, 0.0);`,
    );
  };
  return m;
};
const mat = (o) => nearCut(new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.92, ...o }));

// three-step cel ramp: shadow / mid / light, no smoothing between bands
const toonRamp = (() => {
  const c = [0, 0, 0], m = [150, 150, 150], l = [255, 255, 255];
  const d = new Uint8Array([...c, 255, ...m, 255, ...l, 255]);
  const tex = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
})();
const toon = (o) => {
  const m = new THREE.MeshToonMaterial({ gradientMap: toonRamp, flatShading: true, ...o });
  // a pink rim on the terminator: turns flat bands into an illustrated look
  m.onBeforeCompile = (sh) => {
    if (m.userData.rim === false) return;
    sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>',
      `float rim = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.2);
       gl_FragColor.rgb += vec3(1.0, 0.76, 0.92) * rim * 0.95;
       #include <dithering_fragment>`);
  };
  return m;
};
const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x1a1224, side: THREE.BackSide });
function outline(root, k = 1.06) {
  root.traverse((m) => {
    if (!m.isMesh || m.userData.outline || !m.material?.isMeshToonMaterial) return;
    const o = new THREE.Mesh(m.geometry, OUTLINE);
    o.userData.outline = true;
    o.scale.setScalar(k);
    m.add(o);
  });
}
function shadowBlob(size) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({
    map: dotTex, color: 0x1a1020, transparent: true, opacity: 0.42, depthWrite: false,
  }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  m.renderOrder = 1;
  scene.add(m);
  return m;
}
const geo = {
  trunk: new THREE.CylinderGeometry(0.15, 0.26, 1.7, 6).translate(0, 0.85, 0),
  canopy: new THREE.ConeGeometry(1.45, 3.1, 7).translate(0, 3.0, 0),
  canopy2: new THREE.IcosahedronGeometry(1.3, 1).translate(0, 2.55, 0),
  rock: new THREE.IcosahedronGeometry(0.85, 0).translate(0, 0.42, 0),
  flower: new THREE.OctahedronGeometry(0.19, 0).translate(0, 0.3, 0),
  crystal: new THREE.OctahedronGeometry(0.44, 0).scale(1, 1.9, 1).translate(0, 0.7, 0),
  bush: new THREE.IcosahedronGeometry(0.72, 0).translate(0, 0.52, 0),
  tuft: new THREE.ConeGeometry(0.09, 0.42, 3).translate(0, 0.21, 0),
  mush: new THREE.ConeGeometry(0.15, 0.2, 7).translate(0, 0.26, 0),
};

function pool(g, m, cap) {
  const mesh = new THREE.InstancedMesh(g, m, cap);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.count = 0;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}
const pools = {
  trunk: pool(geo.trunk, mat({ color: 0x7a4b2a }), 260),
  canopy: pool(geo.canopy, windify(mat({ color: 0x4f9a46 }), '0.035'), 260),
  canopy2: pool(geo.canopy2, windify(mat({ color: 0x4f9a46 }), '0.035'), 260),
  rock: pool(geo.rock, mat({ color: 0x9198a2 }), 400),
  flower: pool(geo.flower, mat({ color: 0xf2a0c8 }), 700),
  crystal: pool(geo.crystal, mat({ color: 0xa06be0, emissive: 0x3a1b6b, emissiveIntensity: 1 }), 200),
  bush: pool(geo.bush, mat({ color: 0x3f8a3c }), 400),
  tuft: (() => { const m = pool(geo.tuft, windify(mat({ color: 0x5aa04a }), '0.10'), 1400); m.castShadow = false; return m; })(),
  mush: pool(geo.mush, mat({ color: 0xe06a7a }), 90),
};

// ---------------------------------------------------------------- chunks
const chunks = new Map();
const camps = [];
const takenAt = new Map();
const dummy = new THREE.Object3D();
const col = new THREE.Color();

function genChunk(cx, cz) {
  const rnd = mulberry(hash2(cx, cz, save.seed));
  const nodes = [];
  const add = (type, n, min, max) => {
    for (let i = 0; i < n; i++) {
      const [wx, wz] = warp(cx * CH + 3 + rnd() * (CH - 6), cz * CH + 3 + rnd() * (CH - 6));
      nodes.push({
        id: `${cx},${cz},${type},${i}`,
        type,
        x: wx,
        z: wz,
        s: min + rnd() * (max - min),
        r: rnd() * Math.PI * 2,
        tone: rnd(),
      });
    }
  };
  // groves and clearings: density comes from noise, so some chunks are bare
  const dens = vnoise(cx * 0.42, cz * 0.42, save.seed + 21);
  add('tree', Math.round(dens * dens * 7), 0.8, 1.3);
  if (rnd() < 0.12) add('tree', 1, 2.0, 2.7);
  add('rock', 2 + Math.floor(rnd() * 3), 0.7, 1.4);
  add('flower', 4 + Math.floor(rnd() * 5), 0.8, 1.3);
  if (rnd() < 0.55) add('crystal', 1, 0.8, 1.25);
  if (rnd() < 0.7) add('bush', 1, 0.8, 1.3);
  add('tuft', 18 + Math.floor(rnd() * 14), 0.7, 1.5);
  if (rnd() < 0.5) add('mush', 1 + Math.floor(rnd() * 3), 0.8, 1.3);
  return { cx, cz, nodes };
}

function rebuild() {
  const now = performance.now();
  const n = { trunk: 0, canopy: 0, canopy2: 0, rock: 0, flower: 0, crystal: 0, bush: 0, tuft: 0, mush: 0 };
  for (const c of chunks.values()) {
    for (const p of c.nodes) {
      const t = takenAt.get(p.id);
      if (t && now - t < TAKEDOWN) continue;
      if (inWater(p.x, p.z, p.type === 'tree' ? 2.5 * p.s : p.type === 'rock' ? 1.0 * p.s : 0.3)) continue;
      if (camps.some((c) => Math.hypot(p.x - c.x, p.z - c.z) < 5.2)) continue;
      dummy.rotation.set(0, p.r, 0);
      const put = (key, sx, sy, sz, y = 0) => {
        dummy.position.set(p.x, y, p.z);
        dummy.scale.set(sx, sy, sz);
        dummy.updateMatrix();
        pools[key].setMatrixAt(n[key], dummy.matrix);
        pools[key].setColorAt(n[key], col);
        n[key]++;
      };
      if (p.type === 'tree') {
        // four silhouettes: spruce, round, spire, wide umbrella
        const v = Math.min(3, Math.floor(p.tone * 4));
        const S = { spring: [0.34, 0.52, 0.44], summer: [0.28, 0.46, 0.32], autumn: [0.07, 0.62, 0.44], winter: [0.4, 0.14, 0.44] }[SEASON];
        col.setHSL(0.09, 0.42, 0.2 + p.tone * 0.06);
        put('trunk', p.s * (v === 3 ? 1.15 : 1), p.s * [1, 0.7, 1.4, 0.6][v], p.s * (v === 3 ? 1.15 : 1));
        col.setHSL(S[0] + p.tone * 0.05, S[1] + p.tone * 0.14, S[2] + p.tone * 0.1);
        if (v === 1) put('canopy2', p.s * 1.05, p.s * 0.95, p.s * 1.05);
        else if (v === 2) put('canopy', p.s * 0.66, p.s * 1.55, p.s * 0.66);
        else if (v === 3) put('canopy2', p.s * 1.4, p.s * 0.55, p.s * 1.4);
        else put('canopy', p.s, p.s * (0.9 + p.tone * 0.3), p.s);
      } else if (p.type === 'rock') {
        // three tiers: pebble-grey, warm boulder, mossy outcrop
        const tier = p.tone < 0.45 ? 0 : p.tone < 0.8 ? 1 : 2;
        const rs = p.s * [0.5, 1.0, 1.7][tier];
        col.setHSL([0.58, 0.07, 0.31][tier], [0.05, 0.24, 0.16][tier], [0.6, 0.42, 0.33][tier] + p.tone * 0.05);
        put('rock', rs, rs * (0.72 + p.tone * 0.5), rs, -0.06 * rs);
      } else if (p.type === 'flower') {
        col.setHSL([0.9, 0.13, 0.75, 0.55][Math.floor(p.tone * 4)], 0.62, 0.62);
        put('flower', p.s, p.s, p.s);
      } else if (p.type === 'crystal') {
        col.setHSL(0.76, 0.5, 0.58);
        put('crystal', p.s, p.s, p.s);
      } else if (p.type === 'bush') {
        col.setHSL(0.3, 0.4, 0.2 + p.tone * 0.08);
        put('bush', p.s, p.s, p.s);
      } else {
        col.setHSL(0.26 + p.tone * 0.06, 0.42, 0.28 + p.tone * 0.1);
        put('tuft', p.s, p.s * (0.7 + p.tone * 0.7), p.s);
      }
    }
  }
  for (const k of Object.keys(pools)) {
    pools[k].count = n[k];
    pools[k].instanceMatrix.needsUpdate = true;
    if (pools[k].instanceColor) pools[k].instanceColor.needsUpdate = true;
  }
}

function refreshChunks(px, pz, force = false) {
  const cx = Math.floor(px / CH), cz = Math.floor(pz / CH);
  let changed = force;
  for (let dz = -VIEW; dz <= VIEW; dz++) {
    for (let dx = -VIEW; dx <= VIEW; dx++) {
      const k = `${cx + dx},${cz + dz}`;
      if (!chunks.has(k)) { chunks.set(k, genChunk(cx + dx, cz + dz)); changed = true; }
    }
  }
  for (const [k, c] of chunks) {
    if (Math.abs(c.cx - cx) > VIEW + 1 || Math.abs(c.cz - cz) > VIEW + 1) { chunks.delete(k); changed = true; }
  }
  if (changed) rebuild();
}

// ---------------------------------------------------------------- player
const skin = 0xac7c58;
const player = new THREE.Group();
{
  const dress = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.88, 8), toon({ color: 0x8e5fd0 }));
  dress.position.y = 0.94;
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.24, 0.36, 8), toon({ color: 0x7a4ec0 }));
  torso.position.y = 1.34;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.31, 12, 9), toon({ color: skin }));
  head.position.y = 1.72;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.33, 12, 9), toon({ color: 0x2b1b12 }));
  hair.position.set(0, 1.76, -0.03);
  hair.scale.set(1, 1, 1.02);
  for (const sx of [-1, 1]) {
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.15, 9, 7), toon({ color: 0x2b1b12 }));
    tail.position.set(sx * 0.3, 1.6, -0.05);
    tail.scale.set(0.85, 1.55, 0.85);
    const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.055, 8), toon({ color: 0xf2a0c8 }));
    tie.position.set(sx * 0.265, 1.78, -0.05);
    tie.rotation.z = Math.PI / 2;
    player.add(tail, tie);
  }
  const bow = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), toon({ color: 0xf2a0c8 }));
  bow.position.set(0.24, 1.94, 0);
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x241509 });
  for (const sx of [-0.11, 0.11]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 7, 6), eyeM);
    eye.position.set(sx, 1.75, 0.285);
    player.add(eye);
  }
  const armM = toon({ color: skin });
  const arms = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.27, 1.42, 0.02);
    pivot.rotation.z = sx * 0.18;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.42, 6).translate(0, -0.21, 0), armM);
    arm.castShadow = true;
    pivot.add(arm);
    player.add(pivot);
    arms.push(pivot);
  }
  const legs = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.14, 0.5, 0);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.5, 6).translate(0, -0.25, 0), toon({ color: skin }));
    leg.castShadow = true;
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.25), toon({ color: 0x6d45b5 }));
    shoe.position.set(0, -0.49, 0.05);
    shoe.castShadow = true;
    pivot.add(leg, shoe);
    player.add(pivot);
    legs.push(pivot);
  }
  for (const m of [dress, torso, head, hair, bow]) { m.castShadow = true; player.add(m); }
  player.userData = { arms, legs };
}
player.position.set(save.x, 0, save.z);
scene.add(player);
outline(player, 1.055);
const pShadow = shadowBlob(1.25);

// Fluffy — a real tuxedo: black coat, white bib, muzzle and socks, pink collar
const fluffy = new THREE.Group();
{
  const WHITE = 0xfbf7f2, INK = 0x1d1a24;
  const fur = toon({ color: WHITE });
  const ink = toon({ color: INK });
  // long low torso with legs long enough to see daylight under it
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 12), ink);
  ball.position.y = 0.46;
  ball.scale.set(0.70, 0.50, 1.40);
  const haunch = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 10), ink);
  haunch.position.set(0, 0.44, -0.25);
  haunch.scale.set(0.86, 0.78, 1.02);
  // white bib down the chest and between the front legs
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), fur);
  chest.position.set(0, 0.43, 0.29);
  chest.scale.set(0.82, 0.9, 1.0);
  const bib = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), fur);
  bib.position.set(0, 0.40, 0.38);
  bib.scale.set(1.0, 0.85, 0.8);
  // black head with a white muzzle
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.145, 14, 12), ink);
  head.position.set(0, 0.655, 0.34);
  head.scale.set(0.98, 0.94, 1.0);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.088, 12, 10), fur);
  muzzle.position.set(0, 0.618, 0.435);
  muzzle.scale.set(1.12, 0.82, 0.82);
  const earL = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.155, 4), ink);
  earL.position.set(-0.085, 0.785, 0.33);
  earL.rotation.z = -0.2;
  const earR = earL.clone(); earR.position.x = 0.085; earR.rotation.z = 0.2;
  const faceM = new THREE.MeshBasicMaterial({ color: 0x241509 });
  for (const sx of [-0.052, 0.052]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.023, 6, 5), faceM);
    e.position.set(sx, 0.678, 0.462);
    fluffy.add(e);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 5), new THREE.MeshBasicMaterial({ color: 0xe08aa0 }));
  nose.position.set(0, 0.635, 0.512);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.013, 6, 14), new THREE.MeshBasicMaterial({ color: 0xe86a92 }));
  collar.position.set(0, 0.575, 0.26);
  collar.rotation.x = Math.PI / 2 + 0.25;
  // legs with white socks
  const legs = [];
  for (const [lx, lz] of [[-0.13, 0.28], [0.13, 0.28], [-0.145, -0.26], [0.145, -0.26]]) {
    const pivot = new THREE.Group();
    pivot.position.set(lx, 0.31, lz);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.038, 0.26, 5).translate(0, -0.13, 0), ink);
    leg.castShadow = true;
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.1, 5).translate(0, -0.235, 0), fur);
    pivot.add(leg, sock);
    fluffy.add(pivot);
    legs.push(pivot);
  }
  // tail: four verlet points, so it lags behind and settles instead of swinging on a sine
  const tp = [];
  for (let k = 0; k <= 4; k++) {
    const pv = new THREE.Vector3(0, 0.58 - k * 0.03, -0.46 - k * 0.1);
    tp.push({ p: pv, prev: pv.clone().add(new THREE.Vector3(0, 0.012, -0.012)) });
  }
  const tailSegs = [];
  for (let k = 0; k < 4; k++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.038 - k * 0.006, 0.033 - k * 0.006, 0.14, 5), ink);
    seg.castShadow = true;
    tailSegs.push(seg);
    fluffy.add(seg);
  }
  const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), fur);
  tailTip.castShadow = true;
  for (const m of [ball, haunch, chest, bib, head, muzzle, earL, earR, collar]) m.castShadow = true;
  fluffy.add(ball, haunch, chest, bib, head, muzzle, earL, earR, collar, tailTip, nose);
  fluffy.userData = { legs, tp, tailSegs, tailTip, earL, earR };
}
fluffy.position.copy(player.position).add(new THREE.Vector3(-1, 0, -1));
scene.add(fluffy);
outline(fluffy, 1.09);
const fShadow = shadowBlob(0.85);

const wingShape = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.05, 0.15, 0.17, 0.21, 0.24, 0.12);   // forewing leading edge to the tip
  s.bezierCurveTo(0.27, 0.06, 0.21, 0.02, 0.15, 0.01);   // tip back in to the body
  s.bezierCurveTo(0.23, -0.05, 0.19, -0.16, 0.09, -0.14); // hindwing lobe
  s.bezierCurveTo(0.04, -0.13, 0.01, -0.05, 0, 0);
  return new THREE.ShapeGeometry(s, 8).rotateX(-Math.PI / 2);
})();
const butterflies = Array.from({ length: 9 }, (_, i) => {
  const g = new THREE.Group();
  const col = [0xf2a0c8, 0xb79ce8, 0xfde68a, 0x9ee7d0][i % 4];
  const wm = mat({ color: col, side: THREE.DoubleSide, emissive: col, emissiveIntensity: 0.25 });
  for (const s of [-1, 1]) {
    const wing = new THREE.Group();
    const mesh = new THREE.Mesh(wingShape, wm);
    mesh.scale.set(s * 1.35, 1, 1.35);
    wing.add(mesh);
    g.add(wing);            // children[0] and [1] are the wings — the flap loop turns these
  }
  const bodyM = mat({ color: 0x2b1b12 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, 0.2, 5).rotateX(Math.PI / 2), bodyM);
  body.position.y = 0.01;
  const feeler = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 3), bodyM);
  feeler.position.set(0, 0.04, 0.07); feeler.rotation.x = 1.0;
  g.add(body, feeler);
  g.userData = { s: Math.random() * 100, bx: (Math.random() - 0.5) * 26, bz: (Math.random() - 0.5) * 26, y: 1.2 + Math.random() * 1.2 };
  scene.add(g);
  return g;
});

// ---------------------------------------------------------------- particles
const P_N = 90;
const pPos = new Float32Array(P_N * 3), pCol = new Float32Array(P_N * 3), pVel = [];
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ map: dotTex, size: 0.3, vertexColors: true, transparent: true, depthWrite: false }));
points.frustumCulled = false;
scene.add(points);
for (let i = 0; i < P_N; i++) { pVel.push(new THREE.Vector3()); pPos[i * 3 + 1] = -99; }
let pNext = 0;
function burst(pos, hex, n = 14, power = 3, up = 1.5) {
  const c = new THREE.Color(hex);
  for (let i = 0; i < n; i++) {
    const k = pNext = (pNext + 1) % P_N;
    pPos[k * 3] = pos.x; pPos[k * 3 + 1] = pos.y + 0.6; pPos[k * 3 + 2] = pos.z;
    pVel[k].set((Math.random() - 0.5) * power, up + Math.random() * power * 0.5, (Math.random() - 0.5) * power);
    pCol[k * 3] = c.r; pCol[k * 3 + 1] = c.g; pCol[k * 3 + 2] = c.b;
  }
  pGeo.attributes.color.needsUpdate = true;
}

// ---------------------------------------------------------------- inputs
const input = { x: 0, y: 0 };
let camYaw = 0, camPitch = 0.30;
let camDist = 9.6;
const CAM_MIN = 4, CAM_MAX = 18;
addEventListener('wheel', (e) => { camDist = clamp(camDist + e.deltaY * 0.012, CAM_MIN, CAM_MAX); }, { passive: true });
const keys = new Set();
addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

let drag = null;
const pts = new Map();
const spread = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
const stickEl = $('#stick'), knobEl = $('#knob');
addEventListener('pointerdown', (e) => {
  if (e.target.closest('button, #paint, .card')) return;
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size === 2) {
    input.x = 0; input.y = 0; stickEl.style.display = 'none';
    drag = { mode: 'pinch', d: spread() };
    return;
  }
  if (e.clientX < innerWidth * 0.4) {
    drag = { mode: 'stick', id: e.pointerId, ox: e.clientX, oy: e.clientY };
    stickEl.style.display = 'block';
    stickEl.style.left = `${e.clientX - 59}px`;
    stickEl.style.top = `${e.clientY - 59}px`;
    knobEl.style.transform = 'translate(0,0)';
  } else {
    drag = { mode: 'cam', id: e.pointerId, x: e.clientX, y: e.clientY };
  }
});
addEventListener('pointermove', (e) => {
  if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (drag?.mode === 'pinch') {
    if (pts.size < 2) return;
    const d = spread();
    if (d > 20 && drag.d > 20) camDist = clamp(camDist * (drag.d / d), CAM_MIN, CAM_MAX);
    drag.d = d;
    return;
  }
  if (!drag || e.pointerId !== drag.id) return;
  if (drag.mode === 'stick') {
    const dx = e.clientX - drag.ox, dy = e.clientY - drag.oy;
    const d = Math.min(1, Math.hypot(dx, dy) / 58);
    const a = Math.atan2(dy, dx);
    input.x = Math.cos(a) * d;
    input.y = Math.sin(a) * d;
    knobEl.style.transform = `translate(${Math.cos(a) * d * 34}px,${Math.sin(a) * d * 34}px)`;
  } else {
    camYaw -= (e.clientX - drag.x) * 0.006;
    camPitch = clamp(camPitch + (e.clientY - drag.y) * 0.004, 0.16, 1.05);
    drag.x = e.clientX; drag.y = e.clientY;
  }
});
const endDrag = (e) => {
  pts.delete(e.pointerId);
  if (drag?.mode === 'stick') { input.x = 0; input.y = 0; stickEl.style.display = 'none'; }
  if (drag?.mode === 'pinch' && pts.size >= 2) return;
  drag = null;
};
addEventListener('pointerup', endDrag);
addEventListener('pointercancel', endDrag);

// ---------------------------------------------------------------- sound + ui
const sfx = new Sound();
const resEl = $('#res'), promptEl = $('#prompt'), actEl = $('#act'), toastEl = $('#toast');
let toastT = 0;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove('on'), 2600);
}
function hud() {
  resEl.innerHTML = TYPES.map((k) => `<span><i class="dot ${k}"></i>${save.res[k]}<small>${LABEL[k]}</small></span>`).join('') +
    (save.stickers ? `<span><i class="dot star"></i>${save.stickers}<small>Star</small></span>` : '');
}
hud();

// ---------------------------------------------------------------- bedtime
// Emma sleeps at camp from 10:30pm until 5am, local time. ?awake=1 skips it for testing.
let asleep = false;
const sleepEl = $('#sleep');
function checkBedtime(fakeMins) {
  const d = new Date();
  const mins = fakeMins ?? (d.getHours() * 60 + d.getMinutes());
  const bed = (mins >= 22 * 60 + 30 || mins < 5 * 60) && !location.search.includes('awake');
  if (bed === asleep) return;
  asleep = bed;
  if (sleepEl) sleepEl.hidden = !bed;
  if (bed) { input.x = 0; input.y = 0; keys.clear(); toast('Emma Grace is asleep at camp.'); }
}
checkBedtime();
setInterval(checkBedtime, 30000);

$('#mute').onclick = () => {
  sfx.muted = !sfx.muted;
  if (sfx.master) sfx.master.gain.value = sfx.muted ? 0 : 0.42;
  $('#mute').textContent = sfx.muted ? '✕' : '♪';
};

// ---------------------------------------------------------------- landmarks
const landmarks = new Map();
const REQ = [['bloom', 3], ['stone', 4], ['wood', 5], ['spark', 2]];
function reqFor(rx, rz) {
  const i = Math.abs((rx * 7 + rz * 13 + save.seed) % REQ.length);
  return REQ[i];
}

function spot(rx, rz) {
  const rnd = mulberry(hash2(rx, rz, save.seed + 77));
  const [x, z] = warp((rx + 0.5) * R + (rnd() - 0.5) * 90, (rz + 0.5) * R + (rnd() - 0.5) * 90);
  return {
    x,
    z,
    req: reqFor(rx, rz),
    done: save.restored.includes(`${rx},${rz}`),
  };
}

function makeLandmark(rx, rz) {
  const s = spot(rx, rz);
  const g = new THREE.Group();
  const stone = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 0), mat({ color: s.done ? 0x9fe6b8 : 0x6a6f80, emissive: s.done ? 0x2f7a4a : 0x11131c, emissiveIntensity: s.done ? 1.4 : 0.5, roughness: 0.6 }));
  stone.position.y = 1.3;
  stone.castShadow = true;
  g.add(stone);
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34, 0), mat({ color: 0x8b8f9c }));
    const a = (i / 3) * Math.PI * 2;
    r.position.set(Math.cos(a) * 1.7, 0.2, Math.sin(a) * 1.7);
    r.castShadow = true;
    g.add(r);
  }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 26, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: s.done ? 0xa8ffcf : 0xffc6e6, transparent: true, opacity: s.done ? 0.14 : 0.1, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = 13;
  g.add(beam);
  g.position.set(s.x, 0, s.z);
  scene.add(g);
  const lm = { ...s, group: g, stone, beam, key: `${rx},${rz}` };
  landmarks.set(lm.key, lm);
  return lm;
}

function ensureRegion(rx, rz) {
  const k = `${rx},${rz}`;
  for (const [key, lm] of landmarks) {
    if (Math.abs(lm.x - player.position.x) > R * 2.2 || Math.abs(lm.z - player.position.z) > R * 2.2) {
      scene.remove(lm.group);
      landmarks.delete(key);
    }
  }
  if (!landmarks.has(k)) makeLandmark(rx, rz);
}

function restore(lm) {
  lm.done = true;
  save.restored.push(lm.key);
  save.stickers++;
  persist();
  lm.stone.material.color.set(0x9fe6b8);
  lm.stone.material.emissive.set(0x2f7a4a);
  lm.stone.material.emissiveIntensity = 1.4;
  lm.beam.material.color.set(0xa8ffcf);
  lm.beam.material.opacity = 0.16;
  burst(lm.stone.position.clone().add(lm.group.position), 0xa8ffcf, 40, 6);
  sfx.restore();
  hud();
  const s = spot(Math.floor(lm.x / R), Math.floor(lm.z / R));
  const near2 = nearestPond();
  logJournal(near2 && Math.hypot(near2.pd.x - lm.x, near2.pd.z - lm.z) < 60
    ? 'Today I woke the stone by the pond.'
    : `Today I woke the stone at ${Math.round(s.x)}, ${Math.round(s.z)}.`);
  toast('This place is awake again ✨');
  checkBadges();
}


// ---------------------------------------------------------------- cast
const CAST = [
  { name: 'Marlow', rx: 1, rz: 0, hue: 0.05, line: 'The stones hum when you are near. Can you hear them?' },
  { name: 'Pip', rx: 0, rz: 0, hue: 0.33, line: 'I counted the rain once. I lost count at forty.' },
  { name: 'Bramble', rx: 0, rz: 1, hue: 0.08, line: 'Slow is a perfectly good speed.' },
  { name: 'Nix', rx: -1, rz: 0, hue: 0.75, line: 'Night is just day with the lights turned down.' },
];
const friends = new Map();

function makeFriend(c) {
  const g = new THREE.Group();
  const bodyC = new THREE.Color().setHSL(c.hue, 0.45, 0.5);
  const headC = new THREE.Color().setHSL(c.hue, 0.45, 0.6);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 9, 7), mat({ color: bodyC }));
  body.position.y = 0.55; body.scale.set(1, 1.15, 0.95); body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 9, 7), mat({ color: headC }));
  head.position.y = 1.12; head.castShadow = true;
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 4), mat({ color: bodyC }));
    ear.position.set(sx * 0.17, 1.4, 0); ear.rotation.z = sx * 0.2; ear.castShadow = true; g.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), new THREE.MeshBasicMaterial({ color: 0x1c1226 }));
    eye.position.set(sx * 0.1, 1.15, 0.27); g.add(eye);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), new THREE.MeshBasicMaterial({ color: 0x2b1b2c }));
  nose.position.set(0, 1.05, 0.29); g.add(nose);
  g.add(body, head);
  const s = spot(c.rx, c.rz);
  g.position.set(s.x + 8, 0, s.z + 7);
  scene.add(g);
  const f = { ...c, g, met: save.friends.includes(c.name) };
  friends.set(c.name, f);
  return f;
}

function ensureFriends(px, pz) {
  for (const c of CAST) {
    const d = Math.hypot((c.rx + 0.5) * R - px, (c.rz + 0.5) * R - pz);
    const f = friends.get(c.name);
    if (d < R * 2.2 && !f) makeFriend(c);
    if (d > R * 2.6 && f) { scene.remove(f.g); friends.delete(c.name); }
  }
}

// ---------------------------------------------------------------- camps
function makeCamp(x, z, i = 0) {
  // one layout, built on purpose: tent at the back, fire ring in front of it,
  // seats beside the fire, and the smaller things placed around the outside.
  const g = new THREE.Group();
  const tent = new THREE.Mesh(new THREE.ConeGeometry(1.15, 1.55, 4), mat({ color: 0xd98cb0 }));
  tent.position.y = 0.775; tent.rotation.y = Math.PI / 4; tent.castShadow = true;
  const door = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.6, 3), new THREE.MeshBasicMaterial({ color: 0x2a1730 }));
  door.position.set(0, 0.3, 0.52); door.rotation.y = Math.PI / 4;

  // fire ring, a little way out from the door
  const FX = 0, FZ = 3.0;
  const fire = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.58, 5), new THREE.MeshBasicMaterial({ color: 0xffb15e }));
  fire.position.set(FX, 0.29, FZ);
  const light = new THREE.PointLight(0xffa860, 0, 10, 2);
  light.position.set(FX, 0.85, FZ);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), mat({ color: 0x8a8f99 }));
    s.position.set(FX + Math.cos(a) * 0.5, 0.07, FZ + Math.sin(a) * 0.5);
    s.scale.set(1, 0.75, 1);
    g.add(s);
  }
  for (const sx of [-1, 1]) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.1, 7), mat({ color: 0x8a6642 }));
    log.position.set(FX + sx * 1.55, 0.13, FZ);
    log.rotation.z = Math.PI / 2; log.rotation.y = sx * 0.12;
    g.add(log);
  }

  // flag, on the open side
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 5), mat({ color: 0xb9a27a }));
  pole.position.set(-2.1, 1.3, 1.55);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.48), new THREE.MeshBasicMaterial({ color: 0xf7d6ff, side: THREE.DoubleSide }));
  flag.position.set(-1.65, 2.28, 1.55);

  // chimes hang from an arm on a post, not from thin air
  const cpost = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.95, 5), mat({ color: 0xb9a27a }));
  cpost.position.set(2.45, 0.97, 0.35);
  g.add(cpost);
  const carm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.95, 5), mat({ color: 0xb9a27a }));
  carm.position.set(2.0, 1.92, 0.35);
  carm.rotation.z = Math.PI / 2;
  g.add(carm);
  for (let k = 0; k < 4; k++) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.34 + k * 0.05, 5), mat({ color: 0xd9c48a }));
    tube.position.set(1.68 + k * 0.22, 1.62 - k * 0.03, 0.35);
    g.add(tube);
  }

  // shelf against the tent, one shell for every gift Fluffy has left
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.07, 0.3), mat({ color: 0xb08a5c }));
  shelf.position.set(1.5, 0.62, 1.15);
  shelf.rotation.y = -0.55;
  g.add(shelf);
  for (let k = 0; k < Math.min(8, save.gifts || 0); k++) {
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), mat({ color: 0xf2d7c0 }));
    sh.scale.set(1.2, 0.6, 1);
    sh.position.set(1.5 + (k - 1.75) * 0.15 * Math.cos(0.55), 0.69, 1.15 + (k - 1.75) * 0.15 * Math.sin(0.55));
    g.add(sh);
  }

  // mailbox by the path
  const mailbox = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.3, 0.55), mat({ color: 0x6f8fd1 }));
  mailbox.position.set(-2.6, 0.85, 0.15);
  mailbox.rotation.y = 0.4;
  const mpost = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 5), mat({ color: 0x8a7a52 }));
  mpost.position.set(-2.6, 0.35, 0.15);
  g.add(tent, door, fire, light, pole, flag, mailbox, mpost);

  // memory wall, turned to face the fire
  if (save.postcards.length) {
    const wx = 2.75, wz = -1.9, wy = 0.6;
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.95), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    wall.position.set(wx, 1.15, wz);
    wall.rotation.y = Math.PI + 0.55;
    for (const off of [-0.62, 0.62]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 5), mat({ color: 0x8a6b45 }));
      post.position.set(wx + Math.cos(0.55) * off, 0.6, wz - Math.sin(0.55) * off);
      g.add(post);
    }
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 170;
      cv.getContext('2d').drawImage(img, 0, 0, 256, 170);
      wall.material.map = new THREE.CanvasTexture(cv);
      wall.material.needsUpdate = true;
    };
    img.src = save.postcards[save.postcards.length - 1].url;
    g.add(wall);
  }

  // the balloon only shows up once enough of the world is awake
  let balloon = null;
  if (save.restored.length >= 8) {
    balloon = new THREE.Group();
    const env = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 9), mat({ color: 0xf2a0c8 }));
    env.scale.set(1, 1.15, 1); env.position.y = 2.6;
    const basket = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.7), mat({ color: 0xa5794a }));
    basket.position.y = 0.9;
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.2, 3), mat({ color: 0x6b5b3a }));
      rope.position.set(Math.cos(a) * 0.34, 1.75, Math.sin(a) * 0.34);
      balloon.add(rope);
    }
    balloon.add(env, basket);
    balloon.position.set(4.1, 0, 2.8);
    g.add(balloon);
  }
  g.position.set(x, 0, z);
  scene.add(g);
  camps.push({ g, fire, light, i, flag, balloon, x, z });
}
save.camps.forEach((c, i) => makeCamp(c.x, c.z, i));

$('#camp').onclick = () => {
  if (save.camps.length >= 5) { toast('Five camps is plenty.'); return; }
  const np = nearestPond();
  if (inBoat || (np && np.d < 4)) { toast('Not in the water — find a dry spot.'); return; }
  const c = { x: Math.round(player.position.x), z: Math.round(player.position.z) };
  save.camps.push(c); persist(); makeCamp(c.x, c.z, save.camps.length - 1); rebuild();
  burst(new THREE.Vector3(c.x, 0.6, c.z), 0xffc07a, 18, 3);
  sfx.chime(); toast('Camp made. Sit a while 🏕️');
  hud();
};



// ---------------------------------------------------------------- ponds
// Some regions bowl out into a pond. Water is not walkable; the plank bridge
// across it is the only dry way over.
const ponds = new Map();
const pondSkip = new Set();
const waterMat = new THREE.MeshStandardMaterial({ color: 0x54a8cb, transparent: true, opacity: 0.8, roughness: 0.12, metalness: 0.4 });
const plankMat = mat({ color: 0x9a6b43 });
const streamMat = new THREE.MeshStandardMaterial({ color: 0x67c2e0, transparent: true, opacity: 0.94, roughness: 0.26, metalness: 0.2 });
// ripples + a fake sky reflection: perturb the normal so the sun glints, then
// wash the grazing angles toward the sky colour. No second render pass.
const waterU = { t: { value: 0 }, sky: { value: new THREE.Color(0x9fc6e8) } };
for (const m of [waterMat, streamMat]) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uT = waterU.t;
    sh.uniforms.uSky = waterU.sky;
    sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;'
    );
    sh.fragmentShader = 'uniform float uT; uniform vec3 uSky; varying vec3 vWP;\n' + sh.fragmentShader
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
         float rx = sin(vWP.x * 1.7 + uT * 1.3) * cos(vWP.z * 1.4 - uT * 0.9);
         float rz = sin(vWP.z * 2.3 - uT * 1.6) * cos(vWP.x * 1.2 + uT * 0.7);
         normal = normalize(normal + vec3(rx, 0.0, rz) * 0.22);`
      )
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
         float fres = pow(1.0 - abs(normal.z), 3.0);
         gl_FragColor.rgb = mix(gl_FragColor.rgb, uSky, fres * 0.85);`
      );
  };
  m.needsUpdate = true;
}
const foamMat = new THREE.MeshBasicMaterial({ color: 0xeaf7ff, transparent: true, opacity: 0.5, depthWrite: false });
const waterT = { value: 0 };
waterMat.onBeforeCompile = (sh) => {
  sh.uniforms.uT = waterT;
  sh.vertexShader = 'varying vec3 vW;\n' + sh.vertexShader.replace(
    '#include <begin_vertex>', '#include <begin_vertex>\nvW = (modelMatrix * vec4(position,1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uT;\nvarying vec3 vW;')
    .replace('#include <color_fragment>', `#include <color_fragment>
      float rp = sin(vW.x * 1.7 + uT * 1.3) * sin(vW.z * 1.4 - uT * 1.1);
      diffuseColor.rgb *= 1.0 + rp * 0.10;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.96, 1.0), smoothstep(0.6, 0.98, rp) * 0.22);`);
};

function pondFor(rx, rz) {
  const rnd = mulberry(hash2(rx, rz, save.seed + 991));
  if (rnd() > 0.5) return null;
  const s = spot(rx, rz);
  const r = 20 + rnd() * 12;
  // set the lake clear of the stone instead of rejecting the region
  // sometimes far enough that the lake spills over the boundary
  const ang = rnd() * Math.PI * 2, dist = rnd() < 0.35 ? r + 34 + rnd() * 26 : r + 8 + rnd() * 16;
  const [x, z] = warp(s.x + Math.cos(ang) * dist, s.z + Math.sin(ang) * dist);
  return { x, z, r, arch: 1.3 + r * 0.035, axis: rnd() < 0.5 ? 0 : 1, key: `${rx},${rz}` };
}

function makePond(pd) {
  const g = new THREE.Group();
  const shore = new THREE.Mesh(new THREE.CircleGeometry(pd.r * 1.06, 28), mat({ color: 0xc0b189 }));
  shore.rotation.x = -Math.PI / 2;
  shore.position.y = 0.03;
  shore.receiveShadow = true;
  const water = new THREE.Mesh(new THREE.CircleGeometry(pd.r, 28), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.07;
  g.add(shore, water);

  for (let i = 0; i < 5; i++) {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.55 + Math.random() * 0.4, 0.55, 0.05, 7), mat({ color: 0x4f9450 }));
    const a = Math.random() * Math.PI * 2, rr = pd.r * (0.3 + Math.random() * 0.55);
    pad.position.set(Math.cos(a) * rr, 0.11, Math.sin(a) * rr);
    g.add(pad);
  }

  // the deck arches: 0.5 at each bank, arch above that at the crown
  const A = pd.arch || 2, half = pd.r + 3, deck = (x) => 0.5 + A * (1 - (x / half) ** 2);
  for (let i = -Math.floor(half / 1.1); i <= Math.floor(half / 1.1); i++) {
    const x = i * 1.1;
    const plank = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.14, 2.4), plankMat);
    plank.position.set(x, deck(x), 0);
    plank.rotation.z = (-2 * A * x) / (half * half);
    plank.castShadow = true;
    g.add(plank);
  }
  for (const sz of [-1.15, 1.15]) {
    let prev = null;
    for (let i = -Math.floor(half / 3); i <= Math.floor(half / 3); i++) {
      const x = i * 3, y = deck(x);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.62, 0.12), plankMat);
      post.position.set(x, y + 0.5, sz);
      g.add(post);
      if (prev) {
        const dx = x - prev.x, dy = y + 0.62 - prev.y;
        const seg = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(dx, dy), 0.09, 0.1), plankMat);
        seg.position.set((x + prev.x) / 2, (y + 0.62 + prev.y) / 2, sz);
        seg.rotation.z = Math.atan2(dy, dx);
        g.add(seg);
      }
      prev = { x, y: y + 0.62 };
    }
  }
  if (pd.axis) g.rotation.y = Math.PI / 2;
  pondExtras(pd);
  g.position.set(pd.x, 0, pd.z);
  scene.add(g);
  pd.group = g;
  return pd;
}

function ensurePond(rx, rz) {
  const k = `${rx},${rz}`;
  const pd = ponds.get(k);
  const d = Math.hypot((rx + 0.5) * R - player.position.x, (rz + 0.5) * R - player.position.z);
  if (d > R * 2.6 && pd) { scene.remove(pd.group); ponds.delete(k); return; }
  if (d < R * 2.2 && !pd && !pondSkip.has(k)) {
    const fresh = pondFor(rx, rz);
    // one lake, one bridge: never spawn a pond inside another one's shore
    if (fresh && [...ponds.values()].some((o) => Math.hypot(o.x - fresh.x, o.z - fresh.z) < o.r + fresh.r + 2)) pondSkip.add(k);
    else if (fresh) { ponds.set(k, makePond(fresh)); return true; }
  }
  return false;
}

// one truth for "how high is the floor here" - player, cat, shadows and foot IK
function groundAt(x, z) {
  if (inCave) return caveGround(x, z);
  let y = 0;
  for (const pd of ponds.values()) {
    const deck = onBridge(pd, x, z);
    if (deck) { y = deck; break; }
    if (onDock(x, z)) { y = 0.45; break; }
    if (onStones(x, z)) { y = 0.3; break; }
  }
  return Math.max(y, hillAt(x, z));
}
const onBridge = (pd, x, z) => {
  const dx = x - pd.x, dz = z - pd.z;
  const along = pd.axis ? dz : dx;
  const across = pd.axis ? dx : dz;
  const half = pd.r + 3;
  if (Math.abs(across) >= 1.2 || Math.abs(along) >= half) return 0;
  return 0.5 + (pd.arch || 2) * (1 - (along / half) ** 2);
};
const inWater = (x, z, pad = 0) => {
  for (const pd of ponds.values()) {
    if (onBridge(pd, x, z)) continue;
    if (Math.hypot(x - pd.x, z - pd.z) < pd.r * 1.08 + pad) return true;
    const s = pd.stream;
    if (s) {
      const dx = x - s.x, dz = z - s.z;
      const along = dx * s.dx + dz * s.dz, across = Math.abs(dx * s.nx + dz * s.nz);
      if (along > s.a - 1 && along < s.b + 2 && across < 2.6 + pad) return true;
    }
  }
  return false;
};

// ---------------------------------------------------------------- collision
// Circle push-out. Everything solid is a radius; the player is a small circle
// on top of it. Cheap enough to run every frame over the chunks around us.
// one shared point light that hops to the nearest spark crystal and breathes
const sparkLight = new THREE.PointLight(0xffe0a4, 0, 12, 2);
sparkLight.position.set(0, -50, 0);
scene.add(sparkLight);
const sparkHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
sparkHalo.scale.set(2.4, 2.4, 1);
scene.add(sparkHalo);
let sparkFade = 0;

const SOLID = { tree: 0.40, rock: 0.78, bush: 0.62, crystal: 0.38 };
const PR = 0.26;

function pushOut(x, z) {
  if (inCave && caveRoom) {
    const BODY = 0.9;   // her half-width: stop at the rock face, not inside it
    let px = x, pz = z;
    if (!CAVE_ROOMS.some((r) => inRoom(r, px, pz, -BODY))) {
      let best = null, bd = Infinity;
      for (const r of CAVE_ROOMS) {
        const rx = r.rx - BODY, rz = r.rz - BODY;
        const dx = (px - r.x) / rx, dz = (pz - r.z) / rz, q = Math.hypot(dx, dz) || 1;
        const nx2 = r.x + (dx / q) * rx, nz2 = r.z + (dz / q) * rz;
        const dd = Math.hypot(nx2 - px, nz2 - pz);
        if (dd < bd) { bd = dd; best = [nx2, nz2]; }
      }
      [px, pz] = best;
    }
    // you can only walk from one room into another through an open doorway
    const from = arguments[2] || player.position;
    const cur = CAVE_ROOMS.find((r) => inRoom(r, from.x, from.z, -BODY));
    if (cur && !inRoom(cur, px, pz, -BODY)) {
      const through = caveRoom.doors.some((d) => d.open && (
        d.axis === 'z'
          ? Math.abs(pz - d.z) < 1.9 && Math.abs(px - d.x) < d.hw + 1.0
          : Math.abs(px - d.x) < 1.9 && Math.abs(pz - d.z) < d.hw + 1.0));
      if (!through) return [from.x, from.z];   // the rock wall holds
    }
    for (const d of caveRoom.doors) {
      if (d.open) continue;
      const push = d.hw + 0.8;
      if (d.axis === 'z') {
        if (Math.abs(px - d.x) < d.hl && Math.abs(pz - d.z) < push) pz = d.z + Math.sign(pz - d.z || 1) * push;
      } else if (Math.abs(pz - d.z) < d.hl && Math.abs(px - d.x) < push) px = d.x + Math.sign(px - d.x || 1) * push;
    }
    const L = caveRoom.lake, dx = px - L.x, dz = pz - L.z, ld = Math.hypot(dx, dz);
    if (ld < L.r + 0.3 && ld > 1e-4) { px = L.x + (dx / ld) * (L.r + 0.3); pz = L.z + (dz / ld) * (L.r + 0.3); }
    return [px, pz];
  }
  if (inBoat && boatPond) {
    const dx = x - boatPond.x, dz = z - boatPond.z, d = Math.hypot(dx, dz), lim = boatPond.r - 0.6;
    if (d > lim) return [boatPond.x + (dx / d) * lim, boatPond.z + (dz / d) * lim];
    return [x, z];
  }
  let px = x, pz = z;
  // the hill the cave digs into is solid: walk into it and you slide off
  for (const c of caves.values()) {
    const dx = (px - c.x) / 5.2, dz = (pz - (c.z - 1.8)) / 4.5, q = Math.hypot(dx, dz);
    if (q < 1 && q > 1e-4) { px = c.x + (dx / q) * 5.2; pz = (c.z - 1.8) + (dz / q) * 4.5; }
  }
  const near = (nx, nz) => Math.abs(nx - px) < 2 && Math.abs(nz - pz) < 2;
  for (const c of chunks.values()) {
    if (Math.abs(c.cx * CH - px) > CH * 1.4 || Math.abs(c.cz * CH - pz) > CH * 1.4) continue;
    for (const n of c.nodes) {
      const r = SOLID[n.type];
      if (!r) continue;
      const rr = r * n.s + PR;
      if (!near(n.x, n.z)) continue;
      const dx = px - n.x, dz = pz - n.z, d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        px = n.x + (dx / d) * rr;
        pz = n.z + (dz / d) * rr;
      }
    }
  }
  const disc = (ox, oz, rr) => {
    const dx = px - ox, dz = pz - oz, d2 = dx * dx + dz * dz;
    if (d2 < rr * rr && d2 > 1e-6) {
      const d = Math.sqrt(d2);
      px = ox + (dx / d) * rr;
      pz = oz + (dz / d) * rr;
    }
  };
  for (const pd of ponds.values()) {
    const dx = px - pd.x, dz = pz - pd.z, d2 = dx * dx + dz * dz, rr = pd.r + 0.2;
    if (d2 < rr * rr && d2 > 1e-6 && !onBridge(pd, px, pz) && !onStones(px, pz) && !onDock(px, pz) && !inBoat) {
      const d = Math.sqrt(d2);
      px = pd.x + (dx / d) * rr;
      pz = pd.z + (dz / d) * rr;
    }
  }
  // streams: a narrow band of water, crossed only at the stepping stones
  for (const pd of ponds.values()) {
    const s = pd.stream;
    if (!s) continue;
    const dx = px - s.x, dz = pz - s.z;
    const along = dx * s.dx + dz * s.dz, across = dx * s.nx + dz * s.nz;
    if (along < s.a || along > s.b || Math.abs(across) > 1.5) continue;
    if (onStones(px, pz)) continue;
    const d = Math.abs(across) < 1e-4 ? 1e-4 : Math.abs(across);
    px = s.x + s.dx * along + s.nx * Math.sign(across) * 1.5;
    pz = s.z + s.dz * along + s.nz * Math.sign(across) * 1.5;
    break;
  }
  for (const lm of landmarks.values()) disc(lm.x, lm.z, 1.95);
  for (const f of friends.values()) disc(f.g.position.x, f.g.position.z, 0.75);
  for (const c of camps) disc(c.g.position.x, c.g.position.z, 1.15);
  return [px, pz];
}

// ---------------------------------------------------------------- map
const mapEl = $('#map'), mctx = mapEl.getContext('2d');
const bigEl = $('#bigmap'), bigCanvas = $('#bigmapc'), bigCtx = bigCanvas.getContext('2d');
let bigOpen = false, objList = [], objId = save.obj || null;

function youMarker(ctx, C, big) {
  const a = player.rotation.y, pt = (ang, r) => [C + Math.sin(ang) * r, C + Math.cos(ang) * r];
  ctx.beginPath();
  ctx.moveTo(...pt(a, big ? 16 : 11));
  ctx.lineTo(...pt(a + 2.5, big ? 11 : 8));
  ctx.lineTo(...pt(a - 2.5, big ? 11 : 8));
  ctx.closePath();
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = 'rgba(30,22,50,.85)';
  ctx.lineWidth = big ? 3 : 2.5;
  ctx.stroke(); ctx.fill();
}

// one painter, two sizes: the minimap and the big map are the same drawing
function paintMap(ctx, S, RANGE, big = false) {
  if (inCave && caveRoom) return paintCave(ctx, S, big);
  const C = S / 2, px = player.position.x, pz = player.position.z;
  ctx.clearRect(0, 0, S, S);
  const at = (x, z) => [C + ((x - px) / RANGE) * C, C + ((z - pz) / RANGE) * C];
  const dot = (x, z, fill, r, ring) => {
    const [dx, dz] = at(x, z);
    if (Math.hypot(dx - C, dz - C) > C - 6) return;
    ctx.beginPath(); ctx.arc(dx, dz, r, 0, 7);
    ctx.fillStyle = fill; ctx.fill();
    if (ring) { ctx.strokeStyle = ring; ctx.lineWidth = big ? 2 : 1.5; ctx.stroke(); }
  };
  for (const pd of ponds.values()) {
    const [dx, dz] = at(pd.x, pd.z);
    if (Math.hypot(dx - C, dz - C) < C - 4) {
      ctx.fillStyle = 'rgba(96,176,214,.72)';
      ctx.beginPath(); ctx.arc(dx, dz, (pd.r / RANGE) * C, 0, 7); ctx.fill();
    }
  }
  for (const lm of landmarks.values()) dot(lm.x, lm.z, lm.done ? 'rgba(143,224,176,.8)' : 'rgba(255,158,210,.85)', big ? 6 : 4);
  for (const c of caves.values()) dot(c.x, c.z, 'rgba(177,140,232,.85)', big ? 5 : 3, 'rgba(230,215,255,.7)');
  for (const f of friends.values()) dot(f.g.position.x, f.g.position.z, '#ffd76e', big ? 5 : 3);
  for (const c of camps) dot(c.g.position.x, c.g.position.z, '#ffa860', big ? 5 : 3);

  // the chosen objective, wherever it is
  const o = objList.find((q) => q.id === objId);
  if (o && !inCave) {
    const [dx, dz] = at(o.x, o.z);
    const off = Math.hypot(dx - C, dz - C) > C - 8;
    if (off) {
      // off the map: a chevron on the rim pointing at it
      const a = Math.atan2(dz - C, dx - C), r = C - 10;
      const ex = C + Math.cos(a) * r, ey = C + Math.sin(a) * r;
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-5, 6); ctx.lineTo(-5, -6); ctx.closePath();
      ctx.fillStyle = '#ff9ed2'; ctx.fill();
      ctx.strokeStyle = 'rgba(30,22,50,.85)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    } else {
      ctx.save(); ctx.translate(dx, dz); ctx.rotate(Math.PI / 4);
      const r = big ? 9 : 6;
      ctx.fillStyle = o.ready ? '#a8ffcf' : '#ff9ed2';
      ctx.strokeStyle = 'rgba(30,22,50,.9)'; ctx.lineWidth = 2;
      ctx.fillRect(-r / 1.4, -r / 1.4, r * 1.4, r * 1.4); ctx.strokeRect(-r / 1.4, -r / 1.4, r * 1.4, r * 1.4);
      ctx.restore();
      if (big) {
        const ang = Math.atan2(dz - C, dx - C);
        const lx = dx + Math.cos(ang) * 30, ly = dz + Math.sin(ang) * 30 + 4;
        ctx.font = '600 12px ui-rounded, system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
        ctx.strokeStyle = 'rgba(20,14,36,.9)'; ctx.lineWidth = 3;
        ctx.strokeText(o.label, lx, ly); ctx.fillText(o.label, lx, ly);
      }
    }
  }

  // north, always up
  ctx.font = `700 ${big ? 13 : 9}px ui-rounded, system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.fillText('N', C, big ? 18 : 11);

  youMarker(ctx, C, big);
}

// the room under the hill has its own little map
function paintCave(ctx, S, big) {
  const C = S / 2, k = (C - 8) / 64;
  const P = (x, z) => [C + x * k, C + z * k];
  ctx.clearRect(0, 0, S, S);
  for (const r of caveRoom.rooms) {
    const [x, z] = P(r.x, r.z);
    ctx.beginPath(); ctx.ellipse(x, z, r.rx * k, r.rz * k, 0, 0, 7);
    ctx.fillStyle = 'rgba(38,30,60,.92)'; ctx.fill();
    ctx.strokeStyle = 'rgba(177,140,232,.30)'; ctx.lineWidth = big ? 2 : 1.4; ctx.stroke();
  }
  const L = caveRoom.lake, [lx, lz] = P(L.x, L.z);
  ctx.beginPath(); ctx.arc(lx, lz, L.r * k, 0, 7);
  ctx.fillStyle = 'rgba(78,148,198,.72)'; ctx.fill();
  const [ax, az] = P(LEDGE.x0, LEDGE.z0), [bx, bz] = P(LEDGE.x1, LEDGE.z1);
  ctx.fillStyle = 'rgba(126,110,168,.5)'; ctx.fillRect(ax, az, bx - ax, bz - az);
  for (const d of caveRoom.doors) {
    const [x, z] = P(d.x, d.z);
    ctx.beginPath();
    if (d.axis === 'x') ctx.rect(x - 1.5, z - d.hl * k, 3, d.hl * 2 * k);
    else ctx.rect(x - d.hl * k, z - 1.5, d.hl * 2 * k, 3);
    ctx.fillStyle = d.open ? 'rgba(196,170,255,.35)' : '#e6be78';
    ctx.fill();
  }
  for (const c of caveRoom.crystals) {
    const [x, z] = P(c.x, c.z);
    ctx.beginPath(); ctx.arc(x, z, big ? 6 : 4, 0, 7);
    ctx.fillStyle = c.got ? 'rgba(120,110,145,.35)' : '#c9a8ff'; ctx.fill();
  }
  const [mx, mz] = P(caveRoom.mouth.x, caveRoom.mouth.z);
  ctx.beginPath(); ctx.arc(mx, mz, big ? 8 : 5, 0, 7);
  ctx.fillStyle = '#e2cdff'; ctx.fill();
  youMarker(ctx, C, big);
}

const drawMap = () => paintMap(mctx, mapEl.width, 240);

function openBig() {
  bigOpen = true;
  bigEl.hidden = false;
  const s = Math.min(innerWidth * 0.8, innerHeight * 0.72);
  bigCanvas.width = bigCanvas.height = Math.round(s * Math.min(devicePixelRatio || 1, 2));
  renderBig();
}
function closeBig() { bigOpen = false; bigEl.hidden = true; }
function renderBig() {
  paintMap(bigCtx, bigCanvas.width, 420, true);
  const wrap = $('#bigchips');
  wrap.innerHTML = objList.map((o) => `<button data-o="${o.id}" class="${o.id === objId ? 'on' : ''}">${o.label}</button>`).join('');
  for (const b of wrap.children) b.onclick = () => { objId = save.obj = b.dataset.o; persist(); updateObjective(); renderBig(); };
}
mapEl.onclick = () => (bigOpen ? closeBig() : openBig());
bigEl.onclick = (e) => { if (e.target === bigEl) closeBig(); };
$('#bigclose').onclick = closeBig;
$('#obj').onclick = () => {
  if (objList.length < 2) return;
  const i = objList.findIndex((o) => o.id === objId);
  objId = save.obj = objList[(i + 1) % objList.length].id;
  persist(); updateObjective();
  if (bigOpen) renderBig();
};

// ---------------------------------------------------------------- collections
let bookTab = 'col';
function openBook(tab) {
  bookTab = tab || bookTab;
  const rows = [];
  if (bookTab === 'col') {
    for (const c of CAST) {
      const got = save.friends.includes(c.name);
      rows.push(`<div class="entry">${got ? c.name : '? ? ?'}<small>${got ? 'friend' : 'not met yet'}</small></div>`);
    }
    rows.push(`<div class="entry">Stones awake<small>${save.restored.length}</small></div>`);
    rows.push(`<div class="entry">Camps<small>${save.camps.length}</small></div>`);
    rows.push(`<div class="entry">Fish & finds<small>${save.catches.length}</small></div>`);
    rows.push(`<div class="entry">Cave treasures<small>${save.treasure.length}</small></div>`);
    rows.push(`<div class="entry">Gifts from Fluffy<small>${save.gifts || 0}</small></div>`);
    rows.push(`<div class="entry">Best skips<small>${save.bestSkip || 0}</small></div>`);
  } else if (bookTab === 'jrn') {
    for (const e of save.journal.slice().reverse()) rows.push(`<div class="entry">${e.t}<small>${e.d}</small></div>`);
    if (!rows.length) rows.push('<div class="entry">Nothing yet. Go wake something.<small></small></div>');
  } else if (bookTab === 'pic') {
    for (const pc of save.postcards.slice().reverse()) rows.push(`<img src="${pc.url}" alt="postcard" />`);
    if (!rows.length) rows.push('<div class="entry">No postcards yet. Try the 📷 button.<small></small></div>');
  } else {
    for (const b of BADGES) {
      const got = save.badges.includes(b.id);
      rows.push(`<div class="entry">${got ? '🏅 ' : '· '}${b.n}<small>${got ? 'earned' : 'not yet'}</small></div>`);
    }
  }
  $('#booklist').innerHTML = rows.join('');
  document.querySelectorAll('#booktabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === bookTab));
  $('#bookpanel').hidden = false;
}
$('#book').onclick = () => openBook();
$('#bookclose').onclick = () => { $('#bookpanel').hidden = true; };
document.querySelectorAll('#booktabs button').forEach((b) => { b.onclick = () => openBook(b.dataset.tab); });
$('#foldbtn').onclick = () => { foldBoat(); };

// ---------------------------------------------------------------- photo mode
let photoMode = false;
function exitPhoto() {
  photoMode = false;
  document.body.classList.remove('photo');
}
$('#photo').onclick = () => {
  photoMode = true;
  document.body.classList.add('photo');
  toast('Photo mode — tap Save postcard');
};
$('#shot').onclick = (e) => {
  e.stopPropagation();
  renderer.render(inCave ? caveScene : scene, camera);
  const src = renderer.domElement;
  const w = 480, h = Math.round((src.height / src.width) * w);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(src, 0, 0, w, h);
  save.postcards.push({ url: cv.toDataURL('image/jpeg', 0.6), d: new Date().toDateString() });
  if (save.postcards.length > 16) save.postcards.shift();
  logJournal('Took a postcard of this place.');
  persist();
  sfx.chime();
  exitPhoto();
  toast('Postcard saved 📷');
};
renderer.domElement.addEventListener('pointerdown', () => { if (photoMode) exitPhoto(); });

// ---------------------------------------------------------------- menu, names, teleport
function openMenu(title, items) {
  $('#tp').hidden = false;
  $('#tplist').innerHTML = '';
  $('#tp h2').textContent = title;
  for (const it of items) {
    const b = document.createElement('button');
    b.textContent = it.label;
    b.onclick = () => { $('#tp').hidden = true; it.fn(); };
    $('#tplist').append(b);
  }
}
$('#tpclose').onclick = () => { $('#tp').hidden = true; };

function nameIt(title, value, cb) {
  $('#nbtitle').textContent = title;
  $('#nbin').value = value || '';
  $('#namebox').hidden = false;
  $('#nbin').focus();
  $('#nbsave').onclick = () => { const v = $('#nbin').value.trim().slice(0, 18); $('#namebox').hidden = true; cb(v); };
  $('#nbcancel').onclick = () => { $('#namebox').hidden = true; };
}

function openTeleport() {
  const items = save.restored.map((k) => {
    const [rx, rz] = k.split(',').map(Number);
    const s = spot(rx, rz);
    return { label: save.names[`r${k}`] || `Place ${rx},${rz}`, fn: () => {
      player.position.set(s.x, 0, s.z);
      burst(new THREE.Vector3(s.x, 1, s.z), 0xf7d6ff, 20, 4);
      toast('Up, up, and away 🎈');
    } };
  });
  openMenu('Where to?', items.length ? items : [{ label: 'Nowhere yet', fn: () => {} }]);
}

// ---------------------------------------------------------------- painting
const PAINT_COLORS = ['#e86a92', '#f2b134', '#8fd9a8', '#6fb7e8', '#b18ce8', '#2b2b3a'];
let paintColor = PAINT_COLORS[0], painting = false;
{
  const cv = $('#pc'), ctx = cv.getContext('2d');
  ctx.fillStyle = '#fdf6ec'; ctx.fillRect(0, 0, cv.width, cv.height);
  if (save.painting) { const im = new Image(); im.onload = () => ctx.drawImage(im, 0, 0); im.src = save.painting; }
  const sw = $('#sw');
  PAINT_COLORS.forEach((c, i) => {
    const el = document.createElement('i');
    el.style.background = c;
    el.onclick = () => { paintColor = c; };
    sw.append(el);
    if (i === 0) el.style.outline = '2px solid #fff';
  });
  const draw = (e) => {
    if (!painting) return;
    const r = cv.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * cv.width;
    const y = ((e.clientY - r.top) / r.height) * cv.height;
    ctx.fillStyle = paintColor;
    ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.fill();
  };
  cv.addEventListener('pointerdown', (e) => { painting = true; draw(e); });
  cv.addEventListener('pointermove', draw);
  window.addEventListener('pointerup', () => { painting = false; });
  $('#psave').onclick = () => {
    const a = document.createElement('a');
    a.download = 'emma-grace-painting.png';
    a.href = cv.toDataURL('image/png');
    a.click();
  };
  $('#pdone').onclick = () => {
    save.painting = cv.toDataURL('image/jpeg', 0.6);
    persist(); $('#paint').hidden = true;
    logJournal('Painted something at camp.');
    toast('Your painting hangs in the tent 🎨');
  };
}

// ---------------------------------------------------------------- the giant
let giant = null;
function ensureGiant() {
  if (giant) return;
  const s = spot(3, -3);
  const g = new THREE.Group();
  const skin = mat({ color: 0x9aa7b8 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(2.6, 12, 9), skin);
  body.scale.set(1, 1.25, 0.8); body.position.y = 3.2; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.25, 12, 9), skin);
  head.position.y = 6.0;
  const beard = new THREE.Mesh(new THREE.ConeGeometry(1.0, 2.0, 7), mat({ color: 0xdfe5ee }));
  beard.position.set(0, 5.1, 0.5); beard.rotation.x = Math.PI;
  g.add(body, head, beard);
  for (const sx of [-0.45, 0.45]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0x2a2438 }));
    eye.position.set(sx, 6.2, 1.14); g.add(eye);
  }
  g.position.set(s.x, 0, s.z);
  scene.add(g);
  giant = { g, x: s.x, z: s.z, n: 0, awake: !!save.giant };
  if (giant.awake) { body.material.color.set(0x9fe6b8); head.material.color.set(0x9fe6b8); }
}

function giantAsk() {
  if (giant.awake) { toast('The giant is awake. He nods slowly.'); return; }
  const p = makeProblem(Math.min(4, 1 + giant.n), {}, Math.random);
  gate = { lm: null, p, misses: 0, giant: true };
  $('#gh').textContent = `The giant stirs — ${giant.n + 1} of 3`;
  renderGate();
  gateEl.classList.add('on');
}

// ---------------------------------------------------------------- quests
const QUEST = {
  Marlow: ['bloom', 3, 'a crown of clover'],
  Pip: ['spark', 2, 'a tiny lantern'],
  Bramble: ['wood', 4, 'a walking stick'],
  Nix: ['stone', 3, 'a moonstone'],
};
function tryQuest(name) {
  const q = QUEST[name];
  if (!q || save.quests[name]) return false;
  const [res, need, gift] = q;
  if (save.res[res] < need) { toast(`${name} wants ${need} ${LABEL[res]}${need > 1 ? 's' : ''}.`); return true; }
  save.res[res] -= need;
  save.quests[name] = true;
  save.stickers++;
  hud(); persist(); checkBadges();
  logJournal(`${name} gave me ${gift} for ${need} ${LABEL[res]}s.`);
  toast(`${name} gives you ${gift} ✨`);
  sfx.restore();
  burst(new THREE.Vector3(player.position.x, 1.4, player.position.z), 0xffe9a8, 24, 3);
  return true;
}

// ---------------------------------------------------------------- mailbox
function openMailbox() {
  const days = Math.max(1, Math.round((Date.now() - (save.lastSeen || Date.now())) / 86400000));
  const letters = [];
  if (days >= 1) letters.push(`Dear Emma — I kept the fire going. Fluffy slept on the tent. ${days} day${days === 1 ? '' : 's'} since you last came by.`);
  if (save.restored.length >= 3) letters.push('Someone left a smooth blue stone in the box. It hums a little.');
  if (save.quests && Object.keys(save.quests).length) letters.push('The cast says thank you. They talk about you when you are gone.');
  if (!letters.length) letters.push('The box is empty. Come back tomorrow.');
  if (days >= 1) { save.res.spark++; hud(); }
  openMenu('Mailbox', letters.map((l) => ({ label: l, fn: () => toast(l) })));
  sfx.chime();
}


// ---------------------------------------------------------------- weather
const mkPoints = (n, size, hex, opacity) => {
  const pos = new Float32Array(n * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ map: dotTex, size, color: hex, transparent: true, opacity, depthWrite: false });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  scene.add(pts);
  return { pos, geo: g, mat: m, pts, n };
};
const wx = mkPoints(240, 0.18, 0xffffff, 0);
const flies = mkPoints(70, 0.26, 0xd9ff9e, 0);
let weather = 'clear';
let remoteRain = false;

// Real weather for Atlanta. Free, no key, no backend; falls back to local dice.
(async () => {
  try {
    const cached = JSON.parse(localStorage.getItem('emmaworld.wx') || '{}');
    if (cached.t && Date.now() - cached.t < 1800000) { remoteRain = !!cached.rain; pickWeather(); return; }
    const j = await (await fetch('https://api.open-meteo.com/v1/forecast?latitude=33.749&longitude=-84.388&current=precipitation,weather_code')).json();
    remoteRain = (j.current?.precipitation ?? 0) > 0.05;
    localStorage.setItem('emmaworld.wx', JSON.stringify({ t: Date.now(), rain: remoteRain }));
    pickWeather();
  } catch { /* offline: the sky is whatever it is */ }
})();

function pickWeather() {
  const bucket = Math.floor(Date.now() / 3600000);
  const r = mulberry(hash2(bucket, 7, save.seed))();
  weather = remoteRain ? 'rain'
    : SEASON === 'winter' ? (r < 0.4 ? 'snow' : 'clear')
    : SEASON === 'spring' ? (r < 0.5 ? 'petals' : 'clear')
    : SEASON === 'autumn' ? (r < 0.45 ? 'leaves' : 'clear')
    : r < 0.2 ? 'rain' : r < 0.48 ? 'petals' : 'clear';
  wx.mat.color.set({ rain: 0xbcd7e8, snow: 0xffffff, petals: 0xf6b6d6, leaves: 0xe8a24d, clear: 0xffffff }[weather]);
  wx.mat.size = weather === 'rain' ? 0.1 : weather === 'snow' ? 0.16 : 0.18;
  wx.mat.opacity = weather === 'clear' ? 0 : weather === 'rain' ? 0.5 : 0.8;
  for (let i = 0; i < wx.n; i++) {
    wx.pos[i * 3] = player.position.x + (Math.random() - 0.5) * 46;
    wx.pos[i * 3 + 1] = Math.random() * 16;
    wx.pos[i * 3 + 2] = player.position.z + (Math.random() - 0.5) * 46;
  }
}
function seedFlies() {
  for (let i = 0; i < flies.n; i++) {
    flies.pos[i * 3] = player.position.x + (Math.random() - 0.5) * 26;
    flies.pos[i * 3 + 1] = 0.6 + Math.random() * 2.4;
    flies.pos[i * 3 + 2] = player.position.z + (Math.random() - 0.5) * 26;
  }
}

function objectives() {
  const px = player.position.x, pz = player.position.z;
  const rx = Math.floor(px / R), rz = Math.floor(pz / R);
  const out = [];
  // nearest sleeping stone in the neighbourhood
  let best = null, bd = 1e9;
  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -2; dx <= 2; dx++) {
      const key = `${rx + dx},${rz + dz}`;
      if (save.restored.includes(key)) continue;
      const s = spot(rx + dx, rz + dz);
      const d = Math.hypot(s.x - px, s.z - pz);
      if (d < bd) { bd = d; best = s; }
    }
  }
  if (best) {
    const [type, need] = best.req;
    out.push({ id: 'stone', label: 'Wake the stone', x: best.x, z: best.z, ready: save.res[type] >= need,
      sub: `${Math.min(save.res[type], need)}/${need} ${LABEL[type]}` });
  }
  // nearest cave nobody has been in yet
  let cv = null, cd = 1e9;
  for (let dz = -3; dz <= 3; dz++) {
    for (let dx = -3; dx <= 3; dx++) {
      const c = caveFor(rx + dx, rz + dz);
      if (!c || save.caves.includes(c.key)) continue;
      const d = Math.hypot(c.x - px, c.z - pz);
      if (d < cd) { cd = d; cv = c; }
    }
  }
  if (cv) out.push({ id: 'cave', label: 'Find a cave', x: cv.x, z: cv.z });
  if (giant && !giant.awake) out.push({ id: 'giant', label: `Wake the giant ${giant.n}/3`, x: giant.x, z: giant.z });
  const unmet = CAST.find((c) => !save.friends.includes(c.name));
  if (unmet) {
    const s = spot(unmet.rx, unmet.rz);
    out.push({ id: 'friend', label: `Meet ${unmet.name}`, x: s.x + 8, z: s.z + 7 });
  }
  if (!out.length) {
    const a = vnoise(px / 260, pz / 260, save.seed + 55) * Math.PI * 2;
    out.push({ id: 'rove', label: 'Explore', x: px + Math.cos(a) * 220, z: pz + Math.sin(a) * 220 });
  }
  return out;
}

function updateObjective() {
  const el = $('#obj');
  if (!el) return;
  if (inCave) {
    const open = caveRoom ? caveRoom.doors.filter((d) => d.open).length : 0;
    el.innerHTML = `Crystals <b>${caveFound}/3</b> · doors <b>${open}/3</b>`;
    return;
  }
  objList = objectives();
  if (!objId || !objList.some((o) => o.id === objId)) objId = objList[0].id;
  const o = objList.find((q) => q.id === objId) || objList[0];
  const d = Math.round(Math.hypot(o.x - player.position.x, o.z - player.position.z));
  el.innerHTML = `<b>${o.label}</b> · ${d}m${o.sub ? ` · ${o.sub}` : ''}${objList.length > 1 ? ' ↻' : ''}`;
}

// ---------------------------------------------------------------- critters
const critters = [];
function makeCritter(x, z, hue) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), mat({ color: new THREE.Color().setHSL(hue, 0.55, 0.62), emissive: 0x221133, emissiveIntensity: 0.5 }));
  body.position.y = 0.32;
  body.castShadow = true;
  const eyeGeo = new THREE.SphereGeometry(0.05, 6, 5);
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x1b1030 });
  for (const sx of [-0.1, 0.1]) {
    const e = new THREE.Mesh(eyeGeo, eyeM);
    e.position.set(sx, 0.42, 0.26);
    g.add(e);
  }
  g.add(body);
  g.position.set(x, 0, z);
  scene.add(g);
  const c = { g, body, hue, home: new THREE.Vector2(x, z), target: new THREE.Vector2(x, z), t: Math.random() * 9, met: 0 };
  critters.push(c);
  return c;
}
const LINES = [
  'The moss is soft here, isn\'t it?',
  'I found a shiny thing. I kept it.',
  'Listen — the wind is telling a story.',
  'You walk like someone who knows the way.',
  'Fluffy is a good name for a cat.',
  'If you get sleepy, sit by the big stone.',
];

function makeHedge() {
  const g = new THREE.Group();
  for (let i = -2; i <= 2; i++) {
    const b = new THREE.Mesh(geo.bush, mat({ color: 0x2f6d3a, emissive: 0x0b2113, emissiveIntensity: 0.6 }));
    b.position.set(i * 1.15, 0, 0);
    b.scale.setScalar(1.05 + Math.random() * 0.3);
    b.castShadow = true;
    g.add(b);
  }
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 2.1, 6), mat({ color: 0x8b8f9c }));
    p.position.set(sx * 3.1, 1.05, 0);
    p.castShadow = true;
    g.add(p);
  }
  return g;
}

// ---------------------------------------------------------------- gate ui
let gate = null;
const gateEl = $('#gate'), qEl = $('#q'), chEl = $('#choices'), fbEl = $('#fb');
let hedge = null;

function openGate(lm) {
  if (gate) return;
  if (!inCave) {
    hedge = makeHedge();
    hedge.position.set(lm.x + 2.4, 0, lm.z + 2.4);
    hedge.rotation.y = 0.8;
    scene.add(hedge);
    burst(new THREE.Vector3(lm.x, 0, lm.z), 0x8ff0b0, 18, 4);
  }
  const [res, need] = lm.req || [];
  const level = save.mathLvl || 0;
  const p = makeProblem(level, lm.plain ? { bias: 0.15 } : { res, have: save.res[res], need, bias: 0.8 });
  gate = { lm, p, misses: 0, onPass: lm.onPass };
  $('#gh').textContent = lm.plain ? 'The door asks one question' : p.kind === 'word-sub'
    ? `The sleeping stone wants ${need} ${LABEL[res]}${need > 1 ? 's' : ''}`
    : p.kind === 'word-add' ? 'The stone counts with you' : 'The stone asks one question';
  renderGate();
  gateEl.classList.add('on');
}

function renderGate() {
  const { p } = gate;
  qEl.textContent = p.q;
  fbEl.textContent = '';
  chEl.innerHTML = '';
  p.choices.forEach((c) => {
    const b = document.createElement('button');
    b.textContent = c;
    b.onclick = () => answer(c, b);
    chEl.append(b);
  });
}

function answer(v, btn) {
  const p = gate.p;
  if (v === p.answer) {
    btn.classList.add('right');
    // three first-try answers in a row promote one level, silently
    if (!gate.misses) {
      save.mStreak = (save.mStreak || 0) + 1;
      if (save.mStreak >= 3) { save.mStreak = 0; save.mathLvl = Math.min(4, (save.mathLvl || 0) + 1); }
    } else save.mStreak = 0;
    persist();
    sfx.unlock();
    const lm = gate.lm, wasGiant = gate.giant, onPass = gate.onPass;
    setTimeout(() => {
      gateEl.classList.remove('on');
      gate = null;
      if (hedge) { scene.remove(hedge); hedge = null; }
      if (onPass) { onPass(); return; }
      if (wasGiant) {
        giant.n++;
        if (giant.n >= 3) {
          giant.awake = true; save.giant = true; persist();
          giant.g.children[0].material.color.set(0x9fe6b8);
          giant.g.children[1].material.color.set(0x9fe6b8);
          save.stickers++; hud(); checkBadges();
          logJournal('I woke the giant. He was very tired.');
          burst(new THREE.Vector3(giant.x, 5, giant.z), 0x9fe6b8, 60, 9);
          toast('The giant wakes. The ground remembers it 🌿');
          sfx.restore();
        } else {
          toast(`The giant stirs (${giant.n}/3).`);
        }
      } else if (lm && !lm.done) restore(lm);
    }, 420);
    return;
  }
  sfx.oops();
  gate.misses++;
  save.mStreak = 0; persist();
  btn.classList.add('wrong');
  btn.disabled = true;
  fbEl.textContent = gate.misses >= 2 ? `Hint: ${p.hint}` : 'Not quite — try another one.';
}

// ---------------------------------------------------------------- interact
let near = null;
function interact() {
  if (!near) return;
  if (near.kind === 'node') {
    const res = GATHER[near.node.type];
    takenAt.set(near.node.id, performance.now());
    save.res[res]++;
    hud(); persist(); rebuild();
    sfx.gather(save.res[res]);
    burst(new THREE.Vector3(near.node.x, 0.8, near.node.z), 0xffe9a8, 12, 2.6);
  } else if (near.kind === 'friend') {
    const f = near.f;
    if (f.met && tryQuest(f.name)) return;
    toast(`${f.name}: ${f.line}`);
    sfx.chime();
    burst(f.g.position.clone().setY(1.2), 0xffd0f0, 14, 2.5);
    if (!f.met) {
      f.met = true;
      save.friends.push(f.name);
      save.stickers++;
      persist(); hud();
    }
  } else if (near.kind === 'fish') {
    if (!fishing) startFish(); else if (fishing.phase === 'bite') landCatch();
  } else if (near.kind === 'skip') {
    if (mini) finishSkips(); else startSkips();
  } else if (near.kind === 'boat') {
    enterBoat(near.pd);
    player.position.set(near.pd.boat.x, 0.5, near.pd.boat.z);
  } else if (near.kind === 'exitboat') {
    leaveBoat();
  } else if (near.kind === 'camp') {
    const c = near.c;
    openMenu(save.names[`camp${c.i}`] || 'Camp', [
      { label: 'Name this camp', fn: () => nameIt('Name this camp', save.names[`camp${c.i}`], (v) => { save.names[`camp${c.i}`] = v; persist(); toast(v ? `This camp is called ${v}.` : 'Unnamed again.'); }) },
      { label: 'Paint', fn: () => { $('#paint').hidden = false; } },
      { label: 'Look at postcards', fn: () => openBook('pic') },
      { label: 'Mailbox', fn: openMailbox },
      { label: 'Name your boat', fn: () => nameIt('Name your boat', save.names.boat, (v) => { save.names.boat = v; persist(); toast(v ? `She is called ${v}.` : 'Still just a boat.'); }) },
      { label: 'Name a star', fn: () => nameIt('Name a star', save.names.star, (v) => { save.names.star = v; persist(); if (v) { logJournal(`I named a star ${v}.`); toast(`${v} is up there now ✨`); sfx.chime(); } }) },
      ...(c.balloon ? [{ label: 'Ride the balloon', fn: openTeleport }] : []),
    ]);
  } else if (near.kind === 'giant') {
    giantAsk();
  } else if (near.kind === 'cave') {
    near.c.glow.intensity = 2.2;
    enterCave(near.c);
  } else if (near.kind === 'stone') {
    const lm = near.lm;
    if (lm.done) return;
    const [type, need] = lm.req;
    if (save.res[type] >= need) {
      save.res[type] -= need;
      hud(); persist();
      openGate(lm);
    } else {
      toast(`Bring me ${need} ${LABEL[type]}${need > 1 ? 's' : ''} — you have ${save.res[type]}.`);
      sfx.blip(330, 0.2, 'sine', 0.14);
    }
    hud(); persist();
  }
}

function updateNear() {
  let best = null, bd = 3.1;
  const px = player.position.x, pz = player.position.z;
  if (giant && Math.hypot(giant.x - px, giant.z - pz) < 6.5) {
    promptEl.hidden = false; actEl.hidden = false;
    promptEl.textContent = giant.awake ? 'The giant' : `The giant (${giant.n}/3)`;
    actEl.textContent = giant.awake ? 'Say hello' : 'Wake him';
    near = { kind: 'giant' };
    return;
  }
  for (const c of chunks.values()) {
    for (const n of c.nodes) {
      if (!GATHER[n.type]) continue;
      if (takenAt.get(n.id) && performance.now() - takenAt.get(n.id) < TAKEDOWN) continue;
      const d = Math.hypot(n.x - px, n.z - pz);
      if (d < bd) { bd = d; best = { kind: 'node', node: n }; }
    }
  }
  for (const f of friends.values()) {
    const d = Math.hypot(f.g.position.x - px, f.g.position.z - pz);
    if (d < 2.8 && d < bd) { bd = d; best = { kind: 'friend', f }; }
  }
  for (const c of caves.values()) {
    const d = Math.hypot(c.x - px, c.z - pz);
    if (d < 3.6 && d < bd) { bd = d; best = { kind: 'cave', c }; }
  }
  for (const c of camps) {
    const d = Math.hypot(c.g.position.x - px, c.g.position.z - pz);
    if (d < 3.6 && d < bd) { bd = d; best = { kind: 'camp', c }; }
  }
  if (giant && Math.hypot(giant.x - px, giant.z - pz) < 7 && bd > 7) { bd = 7; best = { kind: 'giant' }; }
  for (const lm of landmarks.values()) {
    if (lm.done) continue;
    const d = Math.hypot(lm.x - px, lm.z - pz);
    if (d < 3.4) {
      const [type, need] = lm.req;
      best = { kind: 'stone', lm };
      actEl.textContent = save.res[type] >= need ? 'Wake it' : `${LABEL[type]} ${save.res[type]}/${need}`;
    }
  }
  if (inBoat) {
    promptEl.hidden = false; actEl.hidden = false;
    promptEl.textContent = 'Rowboat';
    actEl.textContent = 'Step out';
    near = { kind: 'exitboat' };
    return;
  }
  if (!best) {
    const near2 = nearestPond();
    if (near2) {
      let onDeck = false;
      for (const pd of ponds.values()) if (onDock(px, pz) || onBridge(pd, px, pz)) onDeck = true;
      if (onDeck) best = { kind: 'fish', pd: near2.pd };
      else {
        for (const pd of ponds.values()) {
          if (pd.boat && Math.hypot(pd.boat.x - px, pd.boat.z - pz) < 2.6) best = { kind: 'boat', pd };
        }
        if (!best && near2.d < 9) best = { kind: 'skip', pd: near2.pd };
      }
    }
  }
  near = inCave ? null : best;  // nothing to gather or fish underground
  if (!near) { promptEl.hidden = true; actEl.hidden = true; return; }
  promptEl.hidden = false;
  actEl.hidden = false;
  if (near.kind === 'node') {
    const res = GATHER[near.node.type];
    promptEl.textContent = LABEL[res];
    actEl.textContent = 'Gather';
  } else if (near.kind === 'friend') {
    promptEl.textContent = near.f.name;
    actEl.textContent = near.f.met ? 'Say hi' : 'Wave';
  } else if (near.kind === 'fish') {
    promptEl.textContent = 'Pond';
    actEl.textContent = fishing ? (fishing.phase === 'bite' ? 'Reel!' : 'Wait…') : 'Fish';
  } else if (near.kind === 'skip') {
    promptEl.textContent = 'Flat stone';
    actEl.textContent = mini ? 'Skip!' : 'Skip stones';
  } else if (near.kind === 'boat') {
    promptEl.textContent = 'Rowboat';
    actEl.textContent = 'Row';
  } else if (near.kind === 'cave') {
    promptEl.textContent = save.caves.includes(near.c.key) ? 'Cave' : 'A dark mouth';
    actEl.textContent = save.caves.includes(near.c.key) ? 'Look in' : 'Step in';
  } else if (near.kind === 'camp') {
    promptEl.textContent = save.names[`camp${near.c.i}`] || 'Camp';
    actEl.textContent = 'Sit';
  } else if (near.kind === 'giant') {
    promptEl.textContent = giant.awake ? 'The giant' : `The giant (${giant.n}/3)`;
    actEl.textContent = giant.awake ? 'Say hello' : 'Wake him';
  } else {
    const [type, need] = near.lm.req;
    promptEl.textContent = `${LABEL[type]} ${save.res[type]}/${need}`;
  }
}
actEl.onclick = interact;

// ---------------------------------------------------------------- day / night
const cNight = new THREE.Color(0x0c1730), cDay = new THREE.Color(0xa9d4e8), cWarm = new THREE.Color(0xe9a37a);
const skyCol = new THREE.Color();
let skyT = 0, dayLight = 1, skyH = 0, skySun = 0;
function updateSky() {
  const d = new Date();
  const h = d.getHours() + d.getMinutes() / 60;
  const el = Math.sin(((h - 6) / 12) * Math.PI);       // -1 midnight, 0 sunrise/set, 1 noon
  const sunAlt = el * 1.0821;                          // ±62°: it goes under, not just low
  const day = smoothstep(sunAlt, -0.105, 0.14);        // the sky dims as the disc sinks
  const warm = Math.max(0, 1 - Math.abs(sunAlt) / 0.244);
  const moonAlt = Math.min(-sunAlt, 0.5934);           // mirrors the sun, capped at 34° so it stays on screen
  const a = (h / 24) * Math.PI * 2 - Math.PI / 2;
  skyCol.copy(cNight).lerp(cDay, day).lerp(cWarm, warm * 0.5);
  scene.background = skyCol;
  waterU.sky.value.copy(skyCol).lerp(new THREE.Color(0xcbe7ff), 0.55);
  scene.fog.color.copy(skyCol);
  const hi = hillAt(player.position.x, player.position.z);
  scene.fog.far = 135 + Math.min(110, hi * 26);
  scene.fog.near = 38 + Math.min(50, hi * 10);
  skyBot.copy(skyCol).lerp(cWarm, warm * 0.35);
  skyTop.copy(cNight).lerp(cDay, day).multiplyScalar(0.55);
  skyDome.position.copy(camera.position);
  dayLight = day; skyH = h; skySun = sunAlt;
  hemi.intensity = 0.42 + day * 0.5;
  sun.intensity = day * 0.9;
  moon.intensity = (1 - day) * 0.42;
  sun.position.set(player.position.x + Math.cos(a) * 60, Math.max(4, Math.sin(a) * 70), player.position.z + 30);
  sun.target.position.copy(player.position);
  sun.target.updateMatrixWorld();
  moon.position.set(player.position.x - Math.cos(a) * 60, 60, player.position.z - 30);
  stars.material.opacity = Math.pow(1 - day, 1.6);
  cloudMat.color.copy(skyCol).lerp(new THREE.Color(0xffffff), 0.72);
  cloudMat.opacity = 0.3 + day * 0.45;
  // 140 units: inside the 320-wide ground plane, so the hill of the horizon
  // hides them when they are under it instead of leaving them floating in sky
  const SKY_R = 140;
  const skyDir = (ang, back) => {
    const c = Math.cos(ang), f = back ? -1 : 1;
    return new THREE.Vector3(f * Math.cos(a) * c, Math.sin(ang), f * Math.sin(a) * c).normalize();
  };
  sunDisc.position.copy(player.position).addScaledVector(skyDir(sunAlt, false), SKY_R);
  sunDisc.lookAt(camera.position);
  sunDisc.visible = sunAlt > -0.05;
  moonDisc.position.copy(player.position).addScaledVector(skyDir(moonAlt, true), SKY_R);
  moonDisc.lookAt(camera.position);
  moonDisc.visible = moonAlt > -0.05;
  stars.position.copy(player.position);
  stars.rotation.y = a * 0.3;
}


// ================================================================ extras
// Everything below is additive: world dressing, life, and the things you can
// do with it. Nothing here changes the core loop.

function logJournal(text) {
  save.journal.push({ d: new Date().toDateString(), t: text });
  if (save.journal.length > 60) save.journal.shift();
  persist();
}

const BADGES = [
  { id: 'first', n: 'First light', f: () => save.restored.length >= 1 },
  { id: 'five', n: 'Five places awake', f: () => save.restored.length >= 5 },
  { id: 'friend', n: 'Made a friend', f: () => save.friends.length >= 1 },
  { id: 'allfriends', n: 'Everyone met', f: () => save.friends.length >= 4 },
  { id: 'bridge', n: 'Crossed a bridge', f: () => save.crossed >= 1 },
  { id: 'fish', n: 'Caught a fish', f: () => save.catches.some((c) => c.kind === 'fish') },
  { id: 'skips', n: 'Five skips', f: () => (save.bestSkip || 0) >= 5 },
  { id: 'cave', n: 'Found a cave', f: () => save.caves.length >= 1 },
  { id: 'boat', n: 'Rowed a boat', f: () => !!save.boat },
  { id: 'giant', n: 'Woke the giant', f: () => save.giant },
];
function medal(name) {
  const el = $('#medal'), coin = el.querySelector('.coin');
  el.querySelector('.mlbl').textContent = name;
  el.hidden = false;
  coin.style.animation = 'none'; void coin.offsetWidth; coin.style.animation = '';
  requestAnimationFrame(() => el.classList.add('on'));
  sfx.restore();
  clearTimeout(medal._t);
  medal._t = setTimeout(() => {
    el.classList.remove('on');
    setTimeout(() => (el.hidden = true), 420);
  }, 3000);
}

function checkBadges() {
  for (const b of BADGES) {
    if (!save.badges.includes(b.id) && b.f()) {
      save.badges.push(b.id); persist();
      medal(b.n);
      logJournal(`Badge: ${b.n}`);
    }
  }
}

// ---------------------------------------------------------------- water extras
let inBoat = false, rowBoat = null;
const stoneMat = mat({ color: 0x8b8f9c });

function pondExtras(pd) {
  const g = new THREE.Group();
  g.position.set(pd.x, 0, pd.z);
  pd.extra = g;
  scene.add(g);

  // stepping stones: a second crossing, offset from the bridge
  pd.stones = [];
  const sx = pd.axis ? 0 : pd.r * 0.55, sz = pd.axis ? pd.r * 0.55 : 0;
  for (let i = -2; i <= 2; i++) {
    const t = i * pd.r * 0.42;
    const x = pd.axis ? pd.x + t : pd.x + sx, z = pd.axis ? pd.z + sz : pd.z + t;
    const s = { x, z };
    pd.stones.push(s);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.15, 0.34, 7), stoneMat);
    m.position.set(x - pd.x, 0.17, z - pd.z);
    m.receiveShadow = true;
    g.add(m);
  }

  // dock: a short pier off the side, for fishing
  const dl = 9, dz0 = pd.r * 0.8;
  // the dock runs at right angles to the bridge: along z when the bridge is along x
  pd.dock = { x: pd.x, z: pd.z, axis: pd.axis ? 0 : 1, a: dz0, b: dz0 + dl };
  const dockG = new THREE.Group();
  for (let i = 0; i < dl / 1.1; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.14, 1.0), plankMat);
    plank.position.set(0, 0.45, dz0 + i * 1.1 + 0.5);
    plank.castShadow = true;
    dockG.add(plank);
  }
  for (const ex of [-1.15, 1.15]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.9, 0.14), plankMat);
    post.position.set(ex, 0.45, dz0 + dl - 0.2);
    dockG.add(post);
  }
  if (pd.dock.axis === 0) dockG.rotation.y = Math.PI / 2;
  g.add(dockG);

  // stream: drains the pond away toward the open side, with a waterfall at the end
  const s = spot(Math.floor(pd.x / R), Math.floor(pd.z / R));
  const ang = Math.atan2(pd.z - s.z, pd.x - s.x);
  const ux = Math.cos(ang), uz = Math.sin(ang), nx = -uz, nz = ux;
  const L = 46;
  const a0 = pd.r * 0.7, b0 = pd.r + L, len = b0 - a0;
  const mk = (geo, material, along, across, y) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(pd.x + ux * along + nx * across, y, pd.z + uz * along + nz * across);
    m.rotation.y = Math.atan2(ux, uz);
    return m;
  };
  const mid = (a0 + b0) / 2;
  const strip = mk(new THREE.BoxGeometry(3, 0.06, len), streamMat, mid, 0, 0.07);
  const bankL = mk(new THREE.BoxGeometry(1.1, 0.12, len), mat({ color: 0xcbb98b }), mid, -1.9, 0.06);
  const bankR = mk(new THREE.BoxGeometry(1.1, 0.12, len), mat({ color: 0xcbb98b }), mid, 1.9, 0.06);
  const frillL = mk(new THREE.BoxGeometry(0.22, 0.02, len), foamMat, mid, -1.3, 0.12);
  const frillR = mk(new THREE.BoxGeometry(0.22, 0.02, len), foamMat, mid, 1.3, 0.12);
  // waterfall: a rock ledge the stream spills over
  const wall = mk(new THREE.BoxGeometry(7, 3.4, 2.4), mat({ color: 0x8c9199 }), b0 + 1, 0, 1.7);
  wall.castShadow = true;
  const fall = mk(new THREE.BoxGeometry(2.6, 3.4, 0.2), waterMat, b0 + 0.1, 0, 1.7);
  const foam = mk(new THREE.CylinderGeometry(1.9, 2.2, 0.1, 12), new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.55, depthWrite: false }), b0 - 0.3, 0, 0.12);
  scene.add(strip, bankL, bankR, frillL, frillR, wall, fall, foam);
  pd.fall = fall;
  pd.stream = { x: pd.x, z: pd.z, dx: ux, dz: uz, nx, nz, a: a0, b: b0 };
  pd.streamStones = [];
  for (let i = 0; i < 3; i++) {
    const tt = pd.r + 6 + i * 3.2;
    const stn = { x: pd.x + ux * tt, z: pd.z + uz * tt };
    pd.streamStones.push(stn);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.3, 7), stoneMat);
    m.position.set(stn.x, 0.15, stn.z);
    g.add(m);
  }

  // a rowboat, moored at the edge
  {
    const b = new THREE.Group();
    const plan = (k) => {
      const s = new THREE.Shape();
      s.moveTo(0, -1.95 * k);
      s.quadraticCurveTo(0.58 * k, -1.55 * k, 0.8 * k, -0.85 * k);
      s.lineTo(0.84 * k, 0.4 * k);
      s.quadraticCurveTo(0.78 * k, 1.15 * k, 0.36 * k, 1.72 * k);
      s.lineTo(0, 1.98 * k);
      s.lineTo(-0.36 * k, 1.72 * k);
      s.quadraticCurveTo(-0.78 * k, 1.15 * k, -0.84 * k, 0.4 * k);
      s.lineTo(-0.8 * k, -0.85 * k);
      s.quadraticCurveTo(-0.58 * k, -1.55 * k, 0, -1.95 * k);
      return s;
    };
    const hull = new THREE.ExtrudeGeometry(plan(1), { depth: 0.62, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1, curveSegments: 8 });
    hull.rotateX(Math.PI / 2);
    const hullM = new THREE.Mesh(hull, mat({ color: 0x8a5a36 }));
    hullM.position.y = 0.62;
    // gunwale: the same outline with a hole punched in it, so the rim reads from above
    const rail = plan(1);
    rail.holes.push(plan(0.86));
    const railG = new THREE.ExtrudeGeometry(rail, { depth: 0.14, bevelEnabled: false, curveSegments: 8 });
    railG.rotateX(Math.PI / 2);
    const railM = new THREE.Mesh(railG, mat({ color: 0xc08b57 }));
    railM.position.y = 0.74;
    const well = new THREE.ExtrudeGeometry(plan(0.8), { depth: 0.3, bevelEnabled: false, curveSegments: 8 });
    well.rotateX(Math.PI / 2);
    const wellM = new THREE.Mesh(well, mat({ color: 0x4d2f1a }));
    wellM.position.y = 0.68;
    b.add(hullM, railM, wellM);
    // one thwart aft of the rower, so nothing clips through her dress
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.08, 0.3), mat({ color: 0xc08b57 }));
    seat.position.set(0, 0.76, -1.0);
    b.add(seat);
    for (const sx of [-1, 1]) {
      const oar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 2.1), mat({ color: 0xcaa06b }));
      oar.position.set(sx * 0.95, 0.62, 0.1);
      oar.rotation.set(0, 0, sx * 0.55);   // over the gunwale, blade in the water
      b.add(oar);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.42), mat({ color: 0xcaa06b }));
      blade.position.set(sx * 1.9, 0.16, 0.1);
      blade.rotation.z = sx * 0.55;
      b.add(blade);
    }
    b.scale.setScalar(1.25);
    b.position.set(-2.8, 0.06, pd.r * 0.95);
    b.rotation.y = 0.4;
    g.add(b);
    pd.boat = { g: b, x: pd.x - 2.8, z: pd.z + pd.r * 0.95 };
  }

  // fish: dark shapes under the surface
  pd.fish = [];
  for (let i = 0; i < 7; i++) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.28, 7, 5), new THREE.MeshBasicMaterial({ color: 0x1d3f52, transparent: true, opacity: 0.75 }));
    f.scale.set(1.7, 0.7, 0.9);
    f.userData = { a: Math.random() * 7, rr: pd.r * (0.25 + Math.random() * 0.5), sp: 0.25 + Math.random() * 0.3, up: 0 };
    g.add(f);
    pd.fish.push(f);
  }

  // a heron, most of the time
  if (mulberry(hash2(pd.x | 0, pd.z | 0, 5))() < 0.6) {
    const h = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), mat({ color: 0xd9dde4 }));
    body.scale.set(0.8, 1.1, 1.4); body.position.y = 1.25;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.0, 5), mat({ color: 0xd9dde4 }));
    neck.position.set(0, 1.9, 0.2); neck.rotation.x = 0.25;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), mat({ color: 0xeef1f6 }));
    head.position.set(0, 2.42, 0.36);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.5, 4), mat({ color: 0xe8a24d }));
    beak.position.set(0, 2.4, 0.7); beak.rotation.x = Math.PI / 2;
    h.add(body, neck, head, beak);
    for (const lx of [-0.12, 0.12]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 4), mat({ color: 0x8a7a52 }));
      leg.position.set(lx, 0.5, 0); h.add(leg);
    }
    const wingGeo = new THREE.BoxGeometry(0.95, 0.06, 0.5).translate(0.47, 0, 0);
    const wl = new THREE.Mesh(wingGeo, mat({ color: 0xcfd4dc }));
    wl.position.set(-0.16, 1.32, 0); wl.rotation.y = -1.35; wl.scale.x = -1;
    const wr = new THREE.Mesh(wingGeo, mat({ color: 0xcfd4dc }));
    wr.position.set(0.16, 1.32, 0); wr.rotation.y = 1.35;
    h.add(wl, wr);
    const a2 = Math.random() * 7;
    h.position.set(Math.cos(a2) * pd.r * 1.12, 0, Math.sin(a2) * pd.r * 1.12);
    h.rotation.y = Math.atan2(-Math.cos(a2), -Math.sin(a2));
    g.add(h);
    pd.heron = { g: h, home: h.position.clone(), away: 0, wl, wr };
  }
}

function onStones(x, z) {
  for (const pd of ponds.values()) {
    for (const s of pd.stones || []) if (Math.hypot(x - s.x, z - s.z) < 1.05) return true;
    for (const s of pd.streamStones || []) if (Math.hypot(x - s.x, z - s.z) < 1.0) return true;
  }
  return false;
}
function onDock(x, z) {
  for (const pd of ponds.values()) {
    if (!pd.dock) continue;
    const dx = x - pd.x, dz = z - pd.z;
    const along = pd.dock.axis ? dz : dx, across = pd.dock.axis ? dx : dz;
    if (Math.abs(across) < 1.3 && along > pd.dock.a && along < pd.dock.b) return true;
  }
  return false;
}

// ---------------------------------------------------------------- hills + caves
const hills = new Map(), caves = new Map();

function hillFor(rx, rz) {
  const rnd = mulberry(hash2(rx, rz, save.seed + 313));
  // 0-58% of cells get a hill, in patches rather than one per square
  if (rnd() > 0.16 + vnoise(rx * 0.8, rz * 0.8, save.seed + 317) * 0.42) return null;
  const s = spot(rx, rz);
  const [x, z] = warp((rx + 0.5) * R + (rnd() - 0.5) * 70, (rz + 0.5) * R + (rnd() - 0.5) * 70);
  if (Math.hypot(x - s.x, z - s.z) < 34) return null;
  return { x, z, r: 12 + rnd() * 10, h: 2.6 + rnd() * 2.8, key: `${rx},${rz}` };
}

function ensureHill(rx, rz) {
  const k = `${rx},${rz}`, h = hills.get(k);
  const d = Math.hypot((rx + 0.5) * R - player.position.x, (rz + 0.5) * R - player.position.z);
  if (d > R * 2.6 && h) { scene.remove(h.g); hills.delete(k); return; }
  if (d < R * 2.2 && !h) {
    const f = hillFor(rx, rz);
    if (!f) return;
    const g = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2), mat({ color: 0x4d7a3c }));
    dome.scale.set(f.r, f.h, f.r);
    dome.receiveShadow = true;
    dome.castShadow = true;
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(f.r * 1.02, f.r * 1.12, 0.4, 20), mat({ color: 0x5d6b3a }));
    skirt.position.y = 0.1;
    g.add(dome, skirt);
    // cairn on top, and a lookout marker
    for (let i = 0; i < 3; i++) {
      const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34 - i * 0.06, 0), stoneMat);
      st.position.set(f.x, f.h + 0.2 + i * 0.3, f.z);
      scene.add(st);
    }
    g.position.set(f.x, 0, f.z);
    scene.add(g);
    f.g = g;
    hills.set(k, f);
  }
}

function hillAt(x, z) {
  let y = 0;
  for (const h of hills.values()) {
    const d = Math.hypot(x - h.x, z - h.z);
    if (d < h.r) y = Math.max(y, h.h * Math.sqrt(1 - (d / h.r) ** 2));
  }
  return y;
}

function caveFor(rx, rz) {
  const rnd = mulberry(hash2(rx, rz, save.seed + 421));
  if (rnd() > 0.18) return null;
  const s = spot(rx, rz);
  const [x, z] = warp((rx + 0.5) * R + (rnd() - 0.5) * 80, (rz + 0.5) * R + (rnd() - 0.5) * 80);
  if (Math.hypot(x - s.x, z - s.z) < 26) return null;
  return { x, z, key: `${rx},${rz}`, got: save.caves.includes(`${rx},${rz}`) };
}

const dirtTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(64, 64, 6, 64, 64, 64);
  gr.addColorStop(0, 'rgba(106,84,60,1)');
  gr.addColorStop(0.5, 'rgba(106,84,60,.95)');
  gr.addColorStop(0.78, 'rgba(106,84,60,.55)');
  gr.addColorStop(1, 'rgba(106,84,60,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

function ensureCave(rx, rz) {
  const k = `${rx},${rz}`, c = caves.get(k);
  const d = Math.hypot((rx + 0.5) * R - player.position.x, (rz + 0.5) * R - player.position.z);
  if (d > R * 2.6 && c) { scene.remove(c.g); caves.delete(k); return; }
  if (d < R * 2.2 && !c) {
    const f = caveFor(rx, rz);
    if (!f) return;
    const g = new THREE.Group();
    // the hill it digs into: a half dome, so you cannot see through the back
    // a hill of broken rock, not a smooth dome: few segments, every vertex knocked out of line
    const dg = new THREE.SphereGeometry(1, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    const dp = dg.attributes.position;
    for (let i = 0; i < dp.count; i++) {
      const wob = 1 + 0.17 * Math.sin(i * 12.9898) * Math.cos(i * 7.233);
      dp.setXYZ(i, dp.getX(i) * wob, dp.getY(i) * (1 + 0.12 * Math.sin(i * 4.1)), dp.getZ(i) * wob);
    }
    dg.computeVertexNormals();
    const dome = new THREE.Mesh(dg, mat({ color: 0x6d727c, flatShading: true }));
    dome.scale.set(4.6, 3.2, 4.4);
    dome.position.set(0, 0, -1.9);
    dome.castShadow = true;
    dome.receiveShadow = true;
    g.add(dome);
    // boulders heaped over the whole hill, skipping the apron in front of the mouth
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + 0.42;
      const x = Math.cos(a), z = Math.sin(a);
      if (Math.abs(Math.atan2(x, z)) < 0.62) continue;   // leaves the way in clear
      const rho = 2.5 + ((i * 5) % 7) * 0.34;
      const size = 0.75 + ((i * 3) % 5) * 0.19;
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), mat({ color: i % 3 ? 0x767b84 : 0x6a6f78, flatShading: true }));
      r.position.set(x * rho, 0.34 + (5.0 - rho) * 0.62, -1.9 + z * rho);
      r.scale.set(1.15, 0.85, 1.1);
      r.rotation.set(i * 0.9, i * 1.7, i * 0.4);
      r.castShadow = true;
      r.receiveShadow = true;
      g.add(r);
    }
    // a big rock either side of the opening
    for (const sx of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(1.5, 0), mat({ color: 0x71767f, flatShading: true }));
      r.position.set(sx * 3.8, 1.05, 0.55);
      r.scale.set(1.1, 1.2, 1.15);
      r.rotation.set(sx * 0.3, sx * 1.1, 0);
      r.castShadow = true;
      g.add(r);
    }
    // the opening: a half circle standing on the ground
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(1.95, 20, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x080611 }));
    mouth.position.set(0, 0.02, 2.16);
    g.add(mouth);
    // the path worn into the dirt, feathered at the edge like the ground path
    const dirt = new THREE.Mesh(new THREE.CircleGeometry(3.6, 24),
      new THREE.MeshStandardMaterial({ map: dirtTex, transparent: true, depthWrite: false, roughness: 1 }));
    dirt.rotation.x = -Math.PI / 2;
    dirt.position.set(0, 0.035, 3.2);
    dirt.receiveShadow = true;
    g.add(dirt);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.4;
      const peb = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16 + (i % 3) * 0.06, 0), mat({ color: 0x8a8070 }));
      peb.position.set(Math.cos(a) * (2.9 + (i % 2) * 1.1), 0.06, 2.4 + Math.sin(a) * 2.2);
      g.add(peb);
    }
    const glow = new THREE.PointLight(0xb18ce8, 0, 11, 2);
    glow.position.set(0, 1.6, -1.4);
    g.add(glow);
    for (let i = 0; i < 3; i++) {
      const cr = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.1, 5), mat({ color: 0xb18ce8, emissive: 0x6a3fb0, emissiveIntensity: 1.2 }));
      cr.position.set(-0.9 + i * 0.9, 0.55, -1.8);
      g.add(cr);
    }
    g.position.set(f.x, 0, f.z);
    scene.add(g);
    f.g = g; f.glow = glow;
    caves.set(k, f);
  }
}

// ---------------------------------------------------------------- the under-world
// A cave is a room of its own: separate scene, separate fog, no sky. The
// overworld pauses while she is down there.
const caveScene = new THREE.Scene();
caveScene.background = new THREE.Color(0x08060f);
caveScene.fog = new THREE.Fog(0x0d0a1a, 22, 115);
caveScene.add(new THREE.HemisphereLight(0xa9c0ff, 0x5a4432, 2.0));
caveScene.add(new THREE.AmbientLight(0x9a8f7e, 1.3));
const lantern = new THREE.PointLight(0xffc98a, 0, 26, 1.6);
lantern.position.set(0, 1.7, 0.2);
player.add(lantern);

let inCave = false, caveKey = null, caveFound = 0, caveT = 0, caveRoom = null;
let caveReturn = { x: 0, z: 0, ry: 0, camYaw: 0 };
let mossI = 0, mossAcc = 0, mossPrev = { x: 0, z: 0 };

function caveWormDots(g) {
  const n = 18, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) pos.set([(Math.random() - 0.5) * 22, 1 + Math.random() * 2, (Math.random() - 0.5) * 22], i * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: dotTex, color: 0xd9c2ff, size: 0.55, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
  g.add(pts);
  return { pts, pos, n };
}

// a wide, long hall with two side chambers and a deep pool room. A door sits in
// each neck; the deep one wants three crystals, the side ones a task.
const CAVE_ROOMS = [
  { x: 0, z: 0, rx: 26, rz: 38, h: 17 },
  { x: -30, z: -4, rx: 13, rz: 11, h: 10 },
  { x: 30, z: -4, rx: 13, rz: 11, h: 10 },
  { x: 0, z: -46, rx: 20, rz: 16, h: 14 },
];
const CAVE_DOORS = [
  { id: 'deep', axis: 'z', x: 0, z: -34, hw: 1.1, hl: 13, kind: 'crystal' },
  { id: 'west', axis: 'x', x: -21.5, z: -4, hw: 1.1, hl: 11, kind: 'math' },
  { id: 'east', axis: 'x', x: 21.5, z: -4, hw: 1.1, hl: 11, kind: 'math' },
];
const LEDGE = { x0: 6, x1: 18.6, z0: -56, z1: -44, h: 4.2 };
const inRoom = (r, x, z, t = 0) => ((x - r.x) / (r.rx + t)) ** 2 + ((z - r.z) / (r.rz + t)) ** 2 <= 1;

// the ledge is a ramp, not a shelf: no vertical face to get stuck in
function caveGround(x, z) {
  if (!caveRoom) return 0;
  const L = LEDGE;
  if (x > L.x0 && x < L.x1 && z > L.z0 && z < L.z1) return Math.min(L.h, ((x - L.x0) / (L.x1 - L.x0)) * L.h);
  return 0;
}

function caveDoorOpen(d) {
  if (d.open) return;
  d.open = true;
  d.g.visible = false;          // the plug rolls away
  if (d.ring) d.ring.visible = true;
  save.cdoors ||= {};
  (save.cdoors[caveKey] ||= []).push(d.id);
  persist();
  sfx.restore();
  toast('The way opens');
}

function buildCave(key) {  if (caveRoom && caveKey === key) return caveRoom;
  if (caveRoom) { caveScene.remove(caveRoom.g); caveRoom = null; }
  const num = Math.abs([...key].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) | 0, 7));
  const rnd = mulberry(hash2(num, 7, save.seed));
  const g = new THREE.Group();
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8d8478, emissive: 0x2b2620, roughness: 1, flatShading: true });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x241c38, roughness: 1, flatShading: true });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x6b5a46, emissive: 0x1e1912, roughness: 1, flatShading: true });
  const mouth = { x: 0, z: 36.5 };

  for (const r of CAVE_ROOMS) {
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 40), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.scale.set(r.rx, r.rz, 1);
    floor.position.set(r.x, 0, r.z);
    floor.receiveShadow = true;
    g.add(floor);

    const roof = new THREE.Mesh(new THREE.SphereGeometry(1, 26, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x6b6068, emissive: 0x33302f, roughness: 1, flatShading: true, side: THREE.DoubleSide }));
    roof.scale.set(r.rx, r.h, r.rz);
    roof.position.set(r.x, 0, r.z);
    g.add(roof);

    // wall rocks, with gaps left at the necks and the mouth
    const n = Math.round((r.rx + r.rz) * 1.15);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.2;
      const x = r.x + Math.cos(a) * r.rx * 0.96, z = r.z + Math.sin(a) * r.rz * 0.96;
      if (CAVE_ROOMS.some((o) => o !== r && inRoom(o, x, z, 4))) continue;
      if (CAVE_DOORS.some((d) => Math.hypot(x - d.x, z - d.z) < d.hw + 3.2)) continue;
      if (Math.hypot(x - mouth.x, z - mouth.z) < 8) continue;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(2.3 + rnd() * 1.9, 0), rockMat);
      rock.position.set(x, 0.5 + rnd() * 1.6, z);
      rock.scale.set(1, 1.7 + rnd() * 1.8, 1);
      rock.rotation.y = rnd() * 3;
      g.add(rock);
    }
    for (let i = 0; i < Math.round(r.rx / 3); i++) {
      const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * 0.86;
      const st = new THREE.Mesh(new THREE.ConeGeometry(0.5 + rnd() * 1.0, 3 + rnd() * 4.5, 5), rockMat);
      st.position.set(r.x + Math.cos(a) * r.rx * rr, r.h * (0.34 + rnd() * 0.3), r.z + Math.sin(a) * r.rz * rr);
      st.rotation.x = Math.PI;
      g.add(st);
    }
  }

  // stars where the sky would be, over the hall only
  const sn = 260, spos = new Float32Array(sn * 3);
  for (let i = 0; i < sn; i++) {
    const a = rnd() * Math.PI * 2, y = 0.1 + rnd() * 0.9, rr = Math.sqrt(1 - y * y);
    spos.set([Math.cos(a) * rr * 24, y * 16, Math.sin(a) * rr * 35], i * 3);
  }
  const sgeo = new THREE.BufferGeometry();
  sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
  g.add(new THREE.Points(sgeo, new THREE.PointsMaterial({ map: dotTex, color: 0xffffff, size: 0.3, transparent: true, opacity: 0.35, depthWrite: false })));

  // the pool at the far end, fed by a waterfall down the back wall
  const lx = 0, lz = -52, lr = 7.6;
  const lake = new THREE.Mesh(new THREE.CircleGeometry(lr, 26), new THREE.MeshStandardMaterial({ color: 0x3d86c0, emissive: 0x123048, roughness: 0.15, metalness: 0.35 }));
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(lx, 0.05, lz);
  g.add(lake);

  const wall = new THREE.Mesh(new THREE.BoxGeometry(20, 15, 3.5), rockMat);
  wall.position.set(0, 7, -61.6);
  g.add(wall);
  const fall = new THREE.Mesh(new THREE.BoxGeometry(6.4, 14, 0.35), new THREE.MeshBasicMaterial({ color: 0xa8ccff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  fall.position.set(0, 7, -59.6);
  g.add(fall);
  for (const sx of [-3.4, 3.4]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(2.2, 11, 0.3), new THREE.MeshBasicMaterial({ color: 0x8fb6ee, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
    side.position.set(sx, 5.6, -59.4);
    g.add(side);
  }
  const foam = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.1, 0.14, 16),
    new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.5, depthWrite: false }));
  foam.position.set(0, 0.12, -58.6);
  g.add(foam);
  const mist = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xcfe4ff, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false }));
  mist.position.set(0, 2.2, -58.2);
  mist.scale.set(12, 9, 1);
  g.add(mist);
  // a crack in the roof, and the moon coming through it
  const beam = new THREE.Mesh(new THREE.ConeGeometry(8.5, 17, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xbfa7ff, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.set(lx, 8.5, lz);
  g.add(beam);
  const crack = new THREE.PointLight(0x9fc0ff, 2.2, 30, 2);
  crack.position.set(lx, 13, lz);
  g.add(crack);

  const boat = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.5, 3, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0xfdf6ec, flatShading: true, side: THREE.DoubleSide }));
  hull.rotation.set(Math.PI / 2, 0, 0);
  hull.position.y = 0.16;
  boat.add(hull);
  boat.position.set(lx + lr * 0.4, 0.04, lz);
  boat.rotation.y = 0.4;
  g.add(boat);

  // the ledge up the east side, and the treasure on it
  for (let i = 0; i < 6; i++) {
    const h = ((i + 0.5) / 6) * LEDGE.h;
    const step = new THREE.Mesh(new THREE.BoxGeometry(2.1, h, LEDGE.z1 - LEDGE.z0), rockMat);
    step.position.set(LEDGE.x0 + (i + 0.5) * 2.1, h / 2, (LEDGE.z0 + LEDGE.z1) / 2);
    g.add(step);
  }
  const chest = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0xc8a24a, metalness: 0.4, roughness: 0.5, flatShading: true }));
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.14, 0.54), new THREE.MeshStandardMaterial({ color: 0xe6c469, metalness: 0.4, roughness: 0.4, flatShading: true }));
  lid.position.y = 0.3;
  box.position.y = 0.25;
  chest.add(box, lid);
  chest.position.set(15.6, caveGround(15.6, -50) + 0.02, -50);
  chest.visible = !save.treasure.includes(key);
  g.add(chest);

  // three crystals, in the hall on the way down
  const crystals = [];
  [[-13, -14], [0, -21], [13, -14]].forEach(([cx, cz], i) => {
    const x = cx + (rnd() - 0.5) * 3, z = cz + (rnd() - 0.5) * 3;
    const cg = new THREE.Group();
    const glow = new THREE.PointLight(0xb18ce8, 1.5, 8, 2);
    glow.position.y = 1;
    cg.add(glow);
    for (let k = 0; k < 3; k++) {
      const sh = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.1 + k * 0.2, 5),
        new THREE.MeshStandardMaterial({ color: 0xc9a8ff, emissive: 0x6f43b8, emissiveIntensity: 1.5, flatShading: true }));
      sh.position.set((k - 1) * 0.34, 0.55, (k % 2) * 0.2);
      sh.rotation.z = (k - 1) * 0.24;
      cg.add(sh);
    }
    cg.position.set(x, 0, z);
    g.add(cg);
    crystals.push({ x, z, g: cg, light: glow, got: false });
  });

  // the way out, open from the start
  const arch = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.34, 8, 18, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0x4a4058, roughness: 1, flatShading: true }));
  ring.position.y = 1.7;
  arch.add(ring);
  const glowM = new THREE.MeshBasicMaterial({ color: 0xd6bbff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false });
  const door = new THREE.Mesh(new THREE.CircleGeometry(1.6, 20, 0, Math.PI), glowM);
  door.position.y = 1.7;
  const glowL = new THREE.PointLight(0xd6bbff, 1.2, 12, 2);
  glowL.position.y = 1.8;
  arch.add(door, glowL);
  arch.position.set(mouth.x, 0, mouth.z);
  g.add(arch);

  // a rock wall across every neck with one doorway in it: plugged, or an arch
  const doors = CAVE_DOORS.map((d) => {
    const grp = new THREE.Group(), plug = new THREE.Group();
    const horiz = d.axis === 'x';
    const n = Math.max(4, Math.round((d.hl * 2) / 2.2));
    const put = (into, t, row) => {
      const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(1.5 + rnd() * 0.5, 0), rnd() < 0.5 ? rockMat : darkMat);
      rk.position.set(horiz ? d.x : d.x + t, 1.1 + row * 2.1, horiz ? d.z + t : d.z);
      rk.scale.set(1.15, 1.45, 1.15);
      rk.rotation.y = rnd() * 3;
      into.add(rk);
    };
    for (let i = 0; i < n; i++) {
      const t = -d.hl + ((i + 0.5) * d.hl * 2) / n;
      for (let row = 0; row < 3; row++) put(Math.abs(t) < d.hw + 0.9 ? plug : grp, t, row);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(d.hw + 0.85, 0.34, 8, 18, Math.PI), rockMat);
    ring.position.set(d.x, 0, d.z);
    if (horiz) ring.rotation.y = Math.PI / 2;
    g.add(grp, plug, ring);
    const saved = (save.cdoors && save.cdoors[key]) || [];
    const open = saved.includes(d.id);
    plug.visible = !open;
    ring.visible = open;
    return { ...d, g: plug, wall: grp, ring, open };
  });

  const bats = [];
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 7, 6), darkMat);
    body.scale.set(1, 0.8, 1.5);
    const wing = (sx) => {
      const w = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.8, 3), darkMat);
      w.rotation.z = sx * 1.35;
      w.position.x = sx * 0.34;
      return w;
    };
    const wl = wing(-1), wr = wing(1);
    b.add(body, wl, wr);
    const bx = (i - 1) * 8 + (rnd() - 0.5) * 4, bz = -6 - rnd() * 18, by = 9 + rnd() * 4;
    b.position.set(bx, by, bz);
    g.add(b);
    bats.push({ g: b, x: bx, z: bz, h: by, wl, wr, t: 0, ph: rnd() * 6 });
  }

  const worms = caveWormDots(g);
  const moss = [];
  for (let i = 0; i < 36; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0x8fe6c8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.scale.set(1.1, 1.1, 1);
    sp.visible = false;
    g.add(sp);
    moss.push({ sp, t: 99 });
  }

  caveScene.add(g);
  caveKey = key;
  caveRoom = {
    g, rooms: CAVE_ROOMS, crystals, chest, doors, bats, moss, ledge: LEDGE, mouth,
    arch: { g: arch, door: glowM, light: glowL }, lake: { x: lx, z: lz, r: lr }, worms, mist,
  };
  return caveRoom;
}
function enterCave(c) {
  if (inCave) return;
  caveReturn = { x: player.position.x, z: player.position.z, ry: player.rotation.y, camYaw };
  $('#fade').classList.add('on');
  promptEl.hidden = true; actEl.hidden = true; near = null;
  sfx.blip(220, 0.5, 'sine', 0.12);
  setTimeout(() => {
    buildCave(c.key);
    inCave = true; caveFound = 0; caveT = 0;
    promptEl.hidden = true; actEl.hidden = true; near = null;  // the fade let one last frame through
    caveScene.add(player, fluffy, lantern);
    player.position.set(0, 0, 27);
    player.rotation.y = Math.PI;
    fluffy.position.set(1.2, 0, 26);
    mossPrev.x = 0; mossPrev.z = 27; mossAcc = 0;
    camYaw = Math.PI; camNear = 6.6;
    lantern.intensity = 9;
    sfx.setEcho(true);
    for (const k of caveRoom.crystals) { k.got = false; k.g.visible = true; k.light.intensity = 1.5; }
    caveRoom.chest.visible = !save.treasure.includes(caveKey);
    updateObjective();
    $('#fade').classList.remove('on');
    toast('A cave under the hill');
  }, 300);
}

function leaveCave() {
  if (!inCave) return;
  $('#fade').classList.add('on');
  setTimeout(() => {
    if (!save.caves.includes(caveKey)) save.caves.push(caveKey);
    scene.add(player, fluffy, lantern);
    inCave = false;
    lantern.intensity = 0;
    sfx.setEcho(false);
    player.position.set(caveReturn.x, 0, caveReturn.z);
    player.rotation.y = caveReturn.ry;
    fluffy.position.set(caveReturn.x + 1.2, 0, caveReturn.z + 1);
    camYaw = caveReturn.camYaw; camNear = 9.6;
    persist(); hud(); updateObjective();
    $('#fade').classList.remove('on');
    toast('Back in the light ☀️');
    sfx.chime();
  }, 300);
}

function caveTick(dt, t) {
  caveT += dt;
  const px = player.position.x, pz = player.position.z, py = player.position.y;

  for (const c of caveRoom.crystals) {
    if (c.got) continue;
    c.g.rotation.y += dt * 0.9;
    c.g.children[0].intensity = 1.2 + Math.sin(t * 2 + c.x) * 0.4;
    if (caveT > 0.5 && Math.hypot(c.x - px, c.z - pz) < 1.4) {
      c.got = true; c.g.visible = false; c.light.intensity = 0;
      caveFound++;
      toast(`Crystal ${caveFound}/3 ✨`);
      sfx.gather(caveFound);
      updateObjective();
      if (caveFound >= 3) {
        const d = caveRoom.doors.find((o) => o.kind === 'crystal');
        if (d) caveDoorOpen(d);
        toast('Something at the back rolls aside');
      }
    }
  }

  // a door does its thing when she walks up to it
  for (const d of caveRoom.doors) {
    if (d.open) continue;
    const nearWall = d.axis === 'z'
      ? Math.abs(d.z - pz) < 2.6 && Math.abs(d.x - px) < d.hl
      : Math.abs(d.x - px) < 2.6 && Math.abs(d.z - pz) < d.hl;
    if (!nearWall) { d.quiet = false; continue; }
    if (d.quiet) continue;
    d.quiet = true;
    // every hidden way asks a question; the deep one also wants the three lights
    if (d.kind === 'crystal' && caveFound < 3) { toast('Three lights sleep in the hall'); continue; }
    openGate({ x: d.x, z: d.z, plain: true, onPass: () => caveDoorOpen(d) });
  }

  const ch = caveRoom.chest.position;
  if (!save.treasure.includes(caveKey) && py > 2.2 && Math.hypot(ch.x - px, ch.z - pz) < 1.6) {
    save.treasure.push(caveKey);
    save.stickers++;
    persist(); hud();
    toast('A treasure for your Book 🎁');
    sfx.restore();
    logJournal('I found something old and golden under the hill.');
  }

  // bats sleep on the ceiling until she runs underneath
  for (const b of caveRoom.bats) {
    if (b.t > 0) {
      b.t -= dt;
      const k = 2.4 - b.t;
      b.g.position.set(b.x + Math.sin(k * 2.2 + b.ph) * 3, b.h + Math.min(3.2, k * 1.5) + Math.sin(k * 7) * 0.4, b.z + Math.cos(k * 1.7 + b.ph) * 2);
      b.g.rotation.z = Math.sin(k * 16) * 0.4;
      b.wl.rotation.z = -1.35 + Math.sin(k * 22) * 0.9;
      b.wr.rotation.z = 1.35 - Math.sin(k * 22) * 0.9;
      if (b.t <= 0) { b.g.position.set(b.x, b.h, b.z); b.g.rotation.z = 0; b.wl.rotation.z = -1.35; b.wr.rotation.z = 1.35; }
    } else if (vel > 3 && Math.hypot(b.x - px, b.z - pz) < 6) b.t = 2.4;
  }

  // glow-moss keeps the way she came
  mossAcc += Math.hypot(px - mossPrev.x, pz - mossPrev.z);
  mossPrev.x = px; mossPrev.z = pz;
  if (mossAcc > 1.3 && py < 2) {
    mossAcc = 0;
    const m = caveRoom.moss[(mossI = (mossI + 1) % caveRoom.moss.length)];
    m.t = 0; m.sp.visible = true;
    m.sp.position.set(px + (Math.random() - 0.5) * 0.7, py + 0.08, pz + (Math.random() - 0.5) * 0.7);
  }
  for (const m of caveRoom.moss) {
    if (m.t > 9) continue;
    m.t += dt;
    m.sp.material.opacity = Math.max(0, 1 - m.t / 9) * 0.5;
    if (m.t > 9) { m.sp.visible = false; m.t = 99; }
  }

  caveRoom.mist.material.opacity = 0.34 + Math.sin(t * 1.7) * 0.08;
  if (caveT > 0.8 && Math.hypot(px - caveRoom.mouth.x, pz - caveRoom.mouth.z) < 2.4) leaveCave();

  // the worms drift toward her, slowly
  const w = caveRoom.worms, wp = w.pos;
  for (let i = 0; i < w.n; i++) {
    const k = i * 3;
    wp[k] += (player.position.x - wp[k]) * 0.25 * dt + Math.sin(t * 0.9 + i) * 0.03;
    wp[k + 1] = 1.5 + Math.sin(t * 1.3 + i) * 0.6;
    wp[k + 2] += (player.position.z - wp[k + 2]) * 0.25 * dt + Math.cos(t * 0.7 + i * 2) * 0.03;
  }
  w.pts.geometry.attributes.position.needsUpdate = true;
}

// ---------------------------------------------------------------- life
const birds = [];
function makeFlock() {
  const g = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const b = new THREE.Group();
    const l = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 0.28), new THREE.MeshBasicMaterial({ color: 0x2a2f3a }));
    const r = l.clone();
    l.position.x = -0.5; r.position.x = 0.5;
    b.add(l, r);
    b.position.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 14);
    b.userData = { l, r, s: Math.random() * 6 };
    g.add(b);
  }
  g.userData.dir = Math.random() < 0.5 ? 1 : -1;
  g.userData.y = 26 + Math.random() * 16;
  g.position.set(player.position.x - g.userData.dir * 160, g.userData.y, player.position.z + (Math.random() - 0.5) * 120);
  scene.add(g);
  birds.push(g);
}

function makeDeer(x, z, kind = 'deer') {
  const K = kind === 'rabbit';
  const g = new THREE.Group();
  const brown = toon({ color: 0x8b6042 }), legMat = toon({ color: 0x6d4a33 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), brown);
  body.scale.set(1, 1.15, 1.6); body.position.y = 1.15; body.castShadow = true;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.7, 5), brown);
  neck.position.set(0, 1.7, 0.55); neck.rotation.x = -0.35;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 7, 5), brown);
  head.position.set(0, 2.0, 0.78);
  const rump = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), brown);
  rump.position.set(0, 1.35, -0.84);
  g.add(body, neck, head, rump);
  // hips at the top of each leg so they can swing, not just slide
  const HIP = 1.02, LEN = 1.02, legs = [];
  for (const [sx, sz] of [[-0.28, 0.45], [0.28, 0.45], [-0.28, -0.45], [0.28, -0.45]]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx, HIP, sz);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, LEN, 4).translate(0, -LEN / 2, 0), legMat);
    leg.castShadow = true;
    pivot.add(leg);
    g.add(pivot);
    legs.push({ pivot, len: LEN, hip: HIP, front: sz > 0 });
  }
  for (const sx of [-0.12, 0.12]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(K ? 0.06 : 0.07, K ? 0.5 : 0.28, 4), brown);
    ear.position.set(sx, K ? 1.0 : 2.16, K ? 0.5 : 0.72); ear.rotation.z = sx * (K ? 0.3 : 2); g.add(ear);
  }
  if (K) g.scale.setScalar(0.55);
  g.position.set(x, 0, z);
  scene.add(g);
  outline(g, 1.07);
  return {
    g, kind, K, legs, head, neck, sh: shadowBlob(K ? 0.75 : 1.15),
    home: new THREE.Vector2(x, z), t: 0, ph: Math.random() * 6, yaw: 0, spd: 0,
    flee: 0, idle: Math.random() * 4, gy: 0,
  };
}

// gifts: Fluffy leaves one thing by camp each new day
let giftMesh = null;
function maybeGift() {
  const today = new Date().toDateString();
  if (save.giftDay === today || !save.camps.length || giftMesh) return;
  const c = save.camps[save.camps.length - 1];
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.55), mat({ color: 0xf2a0c8 }));
  const rib = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.47, 0.12), mat({ color: 0xffd75e }));
  const rib2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.47, 0.58), mat({ color: 0xffd75e }));
  g.add(box, rib, rib2);
  g.position.set(c.x + 2.2, 0.3, c.z + 1.4);
  scene.add(g);
  giftMesh = g;
}


const deer = [];
function lifeTick(dt, t) {
  for (const pd of ponds.values()) {
    for (const f of pd.fish) {
      const u = f.userData;
      u.a += u.sp * dt;
      if (u.up > 0) { u.up += dt * 2.4; if (u.up > 3.2) u.up = 0; }
      f.position.set(Math.cos(u.a) * u.rr, 0.02 + (u.up ? Math.sin(u.up * 2.6) * 1.1 : 0), Math.sin(u.a) * u.rr);
      f.rotation.y = -u.a;
    }
    const h = pd.heron;
    if (h) {
      const wx2 = pd.x + h.g.position.x, wz2 = pd.z + h.g.position.z;
      const d = Math.hypot(wx2 - player.position.x, wz2 - player.position.z);
      if (!h.away && d < 9) {
        h.away = 0.01;
        sfx.blip(880, 0.3, 'triangle', 0.08);
        toast('A heron takes off 🪶');
      }
      if (h.away) {
        h.away += dt;
        // wings open on take-off, then beat
        const sp = Math.min(1, h.away * 3);
        const flap = Math.sin(h.away * 14) * 0.85 * sp;
        h.wl.rotation.y = -1.35 * (1 - sp); h.wr.rotation.y = 1.35 * (1 - sp);
        h.wl.rotation.z = -flap; h.wr.rotation.z = flap;
        h.g.position.y = Math.min(20, h.away * 7);
        h.g.position.x -= dt * 3;
        h.g.position.z -= dt * 1.4;
        h.g.rotation.z = Math.sin(t * 9) * 0.25;
        if (h.away > 22) { h.g.position.copy(h.home); h.g.position.y = 0; h.g.rotation.z = 0; h.away = 0; }
      }
    }
  }

  for (let i = birds.length - 1; i >= 0; i--) {
    const g = birds[i];
    g.position.x += g.userData.dir * 11 * dt;
    g.position.y = g.userData.y + Math.sin(t * 0.7 + i) * 1.2;
    for (const b of g.children) {
      const flap = Math.sin(t * 9 + b.userData.s) * 0.5;
      b.userData.l.rotation.z = flap;
      b.userData.r.rotation.z = -flap;
    }
    if (Math.abs(g.position.x - player.position.x) > 200) { scene.remove(g); birds.splice(i, 1); }
  }

  for (const d of deer) {
    const dx = d.g.position.x - player.position.x, dz = d.g.position.z - player.position.z;
    const dist = Math.hypot(dx, dz) || 1;
    if (dist < 9) d.flee = 1.8;
    let tx, tz, want;
    if (d.flee > 0) {
      d.flee -= dt;
      tx = d.g.position.x + (dx / dist) * 12;
      tz = d.g.position.z + (dz / dist) * 12;
      want = d.K ? 9 : 5.4;
    } else {
      d.idle -= dt;
      if (d.idle < 0) {
        d.idle = 3 + Math.random() * 6;
        const a = Math.random() * 7;
        d.home.set(d.home.x + Math.cos(a) * 5, d.home.y + Math.sin(a) * 5);
      }
      tx = d.home.x; tz = d.home.y;
      const hd = Math.hypot(tx - d.g.position.x, tz - d.g.position.z);
      want = hd > 0.6 ? (d.K ? 2.6 : 1.6) : 0;
    }
    // accel toward the wanted speed, so none of the teleporting
    d.spd += (want - d.spd) * Math.min(1, dt * (want > d.spd ? 6 : 8));
    if (d.spd > 0.03) {
      const ax = tx - d.g.position.x, az = tz - d.g.position.z;
      const am = Math.hypot(ax, az) || 1;
      d.g.position.x += (ax / am) * d.spd * dt;
      d.g.position.z += (az / am) * d.spd * dt;
      const tgt = Math.atan2(ax, az);
      d.yaw += (((tgt - d.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 5);
      d.g.rotation.y = d.yaw;
    }
    // stride follows ground covered: walk at an amble, bound at a run
    d.ph += (d.spd * dt / (d.K ? 0.95 : 2.5)) * Math.PI * 2;
    const gallop = d.spd > 3.4;
    const amp = (gallop ? 0.85 : 0.40) * Math.min(1, d.spd / 1.1);
    d.legs.forEach((l, i) => {
      const off = gallop ? (l.front ? 0 : Math.PI) : ((i % 2) * Math.PI + (l.front ? 0 : Math.PI));
      l.pivot.rotation.x = Math.sin(d.ph + off) * amp;
    });
    // follow the hills, then bob with the stride
    d.gy += (Math.max(hillAt(d.g.position.x, d.g.position.z), 0) - d.gy) * Math.min(1, dt * 6);
    d.g.position.y = d.gy + Math.abs(Math.sin(d.ph)) * (gallop ? 0.14 : 0.03);
    d.head.position.y = 2.0 + Math.sin(d.ph * 2) * (gallop ? 0.05 : 0.015);
    d.neck.rotation.x = -0.35 + Math.sin(d.ph) * (gallop ? 0.08 : 0.02);
    d.sh.position.set(d.g.position.x, d.gy + 0.02, d.g.position.z);
    if (Math.hypot(dx, dz) > 180) {
      d.home.set(player.position.x + (Math.random() - 0.5) * 60, player.position.z + (Math.random() - 0.5) * 60);
    }
  }

  if (giftMesh) {
    giftMesh.position.y = 0.32 + Math.sin(t * 2.2) * 0.08;
    giftMesh.rotation.y = t * 0.6;
    if (Math.hypot(giftMesh.position.x - player.position.x, giftMesh.position.z - player.position.z) < 1.9) {
      scene.remove(giftMesh);
      giftMesh = null;
      save.gifts++; save.giftDay = new Date().toDateString();
      const kind = ['a grey feather', 'a smooth pebble', 'a tiny shell', 'a bright leaf'][save.gifts % 4];
      logJournal(`Fluffy left ${kind} by the tent.`);
      toast(`Fluffy left you ${kind} 🎁`);
      sfx.chime();
      persist(); hud();
    }
  }

  // the sound garden: every mushroom you wake adds a note to the ambient loop
  if (save.garden.length && t - (window.__gardenT || 0) > 7) {
    window.__gardenT = t;
    sfx.note(save.garden[(Math.random() * save.garden.length) | 0]);
  }
  for (const c of camps) {
    if (Math.hypot(c.g.position.x - player.position.x, c.g.position.z - player.position.z) < 15 && t - (window.__chimeT || 0) > 11) {
      window.__chimeT = t; sfx.chime();
    }
  }

  if (ponds.size) {
    // pond ambience: lapping water when you're near, frogs at night
    const near = nearestPond();
    if (near && near.d < 18) {
      if (!nightAmb()) {
        if (t - (window.__lapT || 0) > 3.5) { window.__lapT = t; sfx.lap(Math.max(0, 1 - near.d / 20)); }
      } else if (t - (window.__frogT || 0) > 6) {
        window.__frogT = t; sfx.frog();
      }
      if (!nightAmb() && t - (window.__birdT || 0) > 11) { window.__birdT = t; sfx.bird(); }
    }
  }
}
const nightAmb = () => dayLight < 0.42;
function nearestPond() {
  let best = null;
  for (const pd of ponds.values()) {
    const d = Math.hypot(pd.x - player.position.x, pd.z - player.position.z) - pd.r;
    if (!best || d < best.d) best = { pd, d };
  }
  return best;
}


// ---------------------------------------------------------------- water doings
let boatPond = null, fishing = null, mini = null, paperBoats = [];

const CATCHES = [
  ['fish', 'a little sunfish', 0.5],
  ['bottle', 'a bottle with a note inside', 0.22],
  ['boot', 'an old boot (still counts)', 0.18],
];
const NOTES = [
  'You are braver than the river. Keep going.',
  'Someone sat here before you and watched the same water.',
  'If you find a stone that hums, wake it gently.',
  'The best days are the ones with no plan at all.',
  'Fluffy says: more snacks, fewer rules.',
];

function startFish() {
  if (fishing) return;
  fishing = { t: 0, wait: 1.1 + Math.random() * 1.8, phase: 'cast' };
  actEl.textContent = 'Wait…';
  sfx.splash();
  burst(new THREE.Vector3(player.position.x, 0.5, player.position.z), 0x9fd8f0, 8, 2);
}
function fishTick(dt) {
  if (!fishing) return;
  fishing.t += dt;
  if (fishing.phase === 'cast' && fishing.t > fishing.wait) {
    fishing.phase = 'bite';
    fishing.t = 0;
    actEl.textContent = 'Reel!';
    actEl.classList.add('bite');
    sfx.blip(520, 0.12, 'square', 0.18);
  } else if (fishing.phase === 'bite' && fishing.t > 1.5) {
    fishing = null;
    actEl.classList.remove('bite');
    toast('It got away. Try again.');
    sfx.oops();
  }
}
function landCatch() {
  const r = Math.random();
  let acc = 0, kind = 'fish', label = CATCHES[0][1];
  for (const [k, l, w] of CATCHES) { acc += w; if (r <= acc) { kind = k; label = l; break; } }
  if (Math.random() < 0.1) { toast('Nothing this time — the pond is being shy.'); fishing = null; actEl.classList.remove('bite'); return; }
  fishing = null;
  actEl.classList.remove('bite');
  save.catches.push({ kind, d: new Date().toDateString() });
  if (save.catches.length > 40) save.catches.shift();
  if (kind === 'bottle') {
    const note = NOTES[save.notes.length % NOTES.length];
    save.notes.push(note);
    logJournal(`Found a note in a bottle: “${note}”`);
    toast(`📜 ${note}`);
    sfx.chime();
  } else {
    toast(`You caught ${label}!`);
    logJournal(`Caught ${label} off the dock.`);
    sfx.gather(2);
  }
  burst(new THREE.Vector3(player.position.x, 0.9, player.position.z), 0x9fe0ff, 16, 3);
  persist(); hud(); checkBadges();
}

function startSkips() {
  mini = { x: 0, dir: 1, spd: 1.9 };
  actEl.textContent = 'Skip!';
  $('#mini').hidden = false;
  sfx.blip(600, 0.1, 'triangle', 0.1);
}
function miniTick(dt) {
  if (!mini) return;
  mini.x += mini.dir * mini.spd * dt;
  if (Math.abs(mini.x) > 1) { mini.x = Math.sign(mini.x); mini.dir *= -1; }
  $('#miniDot').style.left = `${50 + mini.x * 46}%`;
}
function finishSkips() {
  const acc = 1 - Math.abs(mini.x);
  const n = Math.max(0, Math.round(acc * 7));
  mini = null;
  $('#mini').hidden = true;
  if (n > (save.bestSkip || 0)) { save.bestSkip = n; }
  logJournal(`Skipped a stone ${n} time${n === 1 ? '' : 's'}.`);
  toast(n ? `${n} skip${n === 1 ? '' : 's'}! Best: ${save.bestSkip}` : 'Splash. Straight down.');
  sfx.splash();
  burst(new THREE.Vector3(player.position.x, 0.4, player.position.z), 0xbfe9ff, 12, 2);
  persist(); checkBadges();
}

function enterBoat(pd) {
  boatPond = pd;
  inBoat = true;
  const bx = pd.x - player.position.x, bz = pd.z - player.position.z, bd = Math.hypot(bx, bz) || 1;
  player.position.x += (bx / bd) * 2.2;
  player.position.z += (bz / bd) * 2.2;
  if (!save.boat) { save.boat = true; persist(); }
  toast('Row row row 🛶');
  sfx.splash();
}
function leaveBoat() {
  if (!boatPond) return;
  const pd = boatPond;
  inBoat = false;
  boatPond = null;
  // step out onto the nearest shore, not into the pond
  const cx = player.position.x - pd.x, cz = player.position.z - pd.z;
  const d = Math.hypot(cx, cz) || 1;
  player.position.x = pd.x + (cx / d) * (pd.r + 0.8);
  player.position.z = pd.z + (cz / d) * (pd.r + 0.8);
  player.position.y = 0;
  toast('Back on dry land.');
}

function foldBoat() {
  const pd = nearestPond()?.pd;
  if (!pd) { toast('Fold it near water.'); return; }
  if (save.res.bloom < 2) { toast('Needs 2 Bloom to fold a paper boat.'); return; }
  save.res.bloom -= 2; hud(); persist();
  const m = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.5, 4), mat({ color: 0xfdf6ec }));
  m.position.set(pd.x + 1, 0.16, pd.z + 1);
  m.rotation.z = Math.PI;
  scene.add(m);
  paperBoats.push({ m, pd, a: Math.random() * 7 });
  logJournal('Folded a paper boat and set it on the water.');
  toast('A paper boat sails away ⛵');
}

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
let regionNow = regionKey(player.position.x, player.position.z);
let lastGate = -99, walk = 0, mapAcc = 0, bridgeY = 0;
const SPD = 6.4, STRIDE = 4.7;
let vel = 0, turnRate = 0, leanZ = 0, leanV = 0, pitchX = 0, pitchV = 0, swingE = 0, lastStep = 0, camNear = 9.6;
const dir = new THREE.Vector3(0, 0, 1), lookAt = new THREE.Vector3(), UPV = new THREE.Vector3(0, 1, 0);
let fPh = 0, earA = 0, earV = 0, idleT = 0, catSit = 0, catLie = 0;
const camRay = new THREE.Raycaster();
const CAM_SOLID = [];
const spring = (x, v, tgt, k, d, dt) => { v += ((tgt - x) * k - v * d) * dt; return [x + v * dt, v]; };
let stepAcc = 0, saveAcc = 0, rebuildAcc = 0, skyAcc = 0, started = false;
const fwd = new THREE.Vector3(), right = new THREE.Vector3(), want = new THREE.Vector3();

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // movement
  let mx = input.x, my = input.y;
  if (keys.has('w') || keys.has('arrowup')) my -= 1;
  if (keys.has('s') || keys.has('arrowdown')) my += 1;
  if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
  if (keys.has('d') || keys.has('arrowright')) mx += 1;
  if (asleep || bigOpen || gate || !$('#paint').hidden) { mx = 0; my = 0; }
  const mag = Math.hypot(mx, my);
  if (mag > 1) { mx /= mag; my /= mag; }

  fwd.set(-Math.sin(camYaw), 0, -Math.cos(camYaw));
  right.set(Math.cos(camYaw), 0, -Math.sin(camYaw));
  want.set(0, 0, 0).addScaledVector(fwd, -my).addScaledVector(right, mx);
  const moving = want.lengthSq() > 0.001;
  if (moving) dir.copy(want).normalize();
  // speed ramps in fast and out faster, so the body has weight without lag
  vel += ((moving ? SPD : 0) - vel) * Math.min(1, dt * (moving ? 11 : 14));
  if (vel > 0.05) {
    const nx = player.position.x + dir.x * vel * dt;
    const nz = player.position.z + dir.z * vel * dt;
    const nk = regionKey(nx, nz);
    if (nk !== regionNow && !save.gates.includes(nk)) save.gates.push(nk);
    const [cx, cz] = pushOut(nx, nz);
    const moved = Math.hypot(cx - player.position.x, cz - player.position.z);
    player.position.x = cx;
    player.position.z = cz;
    for (const pd of ponds.values()) if (onBridge(pd, cx, cz)) save.crossed = (save.crossed || 0) + dt;
    regionNow = regionKey(cx, cz);
    const target = Math.atan2(dir.x, dir.z);
    const diff = ((target - player.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const turn = diff * Math.min(1, dt * 8);
    player.rotation.y += turn;
    turnRate += (turn / Math.max(dt, 1e-4) - turnRate) * Math.min(1, dt * 9);
    // the stride advances with distance covered, not with the clock: no skating
    walk += (moved / STRIDE) * Math.PI * 2;
    const st = Math.floor(walk / Math.PI);
    if (st !== lastStep && moved > 0.0005) {
      lastStep = st;
      const surf = inCave ? 'gravel' : bridgeY > 0.3 ? 'wood' : (nearestPond() && nearestPond().d < 4 ? 'gravel' : 'grass');
      sfx.step(surf);
      if (vel > 3.4) burst(new THREE.Vector3(cx, -0.5, cz), 0xd6c8b2, 6, 0.9, 0.22);
    }
    player.position.y = bridgeY + Math.abs(Math.sin(walk)) * 0.035 * Math.min(1, vel / 4);
  } else {
    vel = 0;
    turnRate *= 0.85;
    player.position.y += (bridgeY - player.position.y) * 0.25;
  }

  // ground height is a property of where you stand, not of whether you move
  bridgeY = groundAt(player.position.x, player.position.z);
  if (!moving) player.position.y += (bridgeY - player.position.y) * Math.min(1, dt * 8);

  swingE += ((moving && !inBoat ? 0.55 : 0) - swingE) * Math.min(1, dt * 10);
  const { arms, legs } = player.userData;
  if (inBoat) {
    for (const l of legs) { l.rotation.x = -1.5; l.visible = false; }  // knees under the dress
    for (const a of arms) { a.rotation.x = -0.95; a.rotation.z *= 0.6; }
  } else {
    for (const l of legs) l.visible = true;
    legs[0].rotation.x = Math.sin(walk) * swingE;
    legs[1].rotation.x = -Math.sin(walk) * swingE;
    arms[0].rotation.x = -Math.sin(walk) * swingE * 0.6;
    arms[1].rotation.x = Math.sin(walk) * swingE * 0.6;
  }

  // lean into the turn, settle back on stop (under-damped, so it overshoots once)
  const leanT = THREE.MathUtils.clamp(-turnRate * 0.09 * Math.min(1, vel / 4), -0.17, 0.17);
  [leanZ, leanV] = spring(leanZ, leanV, leanT, 90, 13, dt);
  [pitchX, pitchV] = spring(pitchX, pitchV, inBoat ? 0.12 : moving ? -0.05 : 0, 70, 11, dt);
  player.rotation.z = leanZ;
  player.rotation.x = pitchX;

  // one-bone IK: each leg stretches or bends to reach the ground under its foot
  const cy = Math.cos(player.rotation.y), sy = Math.sin(player.rotation.y);
  if (!inBoat) legs.forEach((pivot, i) => {
    const ox = i ? 0.14 : -0.14;
    const gy = Math.max(groundAt(player.position.x + ox * cy, player.position.z - ox * sy), bridgeY);
    pivot.scale.y = THREE.MathUtils.clamp(((player.position.y + 0.5) - gy) / 0.5, 0.68, 1.2);
  });

  // fluffy trails behind and to the side, with a little hop
  let deck = 0;
  for (const pd of ponds.values()) deck = Math.max(deck, onBridge(pd, player.position.x, player.position.z) || 0);
  // on a bridge she walks the plank line too, not the water beside it
  const behind = inBoat || deck > 0.2
    ? fwd.clone().multiplyScalar(-1.15)
    : fwd.clone().multiplyScalar(0.7).add(right.clone().multiplyScalar(-1.0));
  const wantF = player.position.clone().add(behind);
  // the cat obeys the same water, trees and hills as Emma does
  const [wfx, wfz] = inBoat ? [wantF.x, wantF.z] : pushOut(wantF.x, wantF.z, fluffy.position);
  const fWas = fluffy.position.clone();
  fluffy.position.lerp(new THREE.Vector3(wfx, fluffy.position.y, wfz), Math.min(1, dt * (inBoat ? 9 : 3.2)));
  const fMoved = fWas.distanceTo(fluffy.position);
  const fy = player.rotation.y - fluffy.rotation.y;
  fluffy.rotation.y += (((fy + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 7);
  idleT = fMoved > 0.004 ? 0 : idleT + dt;
  catSit += ((idleT > 6 ? 1 : 0) - catSit) * Math.min(1, dt * 3.5);
  catLie += ((idleT > 20 ? 1 : 0) - catLie) * Math.min(1, dt * 3);
  const fGy = inBoat ? 0.16 : groundAt(fluffy.position.x, fluffy.position.z);
  const fHop = inBoat ? 0 : Math.sin(t * 7) * 0.03 * (1 - catSit) + (fMoved > 0.01 ? 0.03 : 0);
  fluffy.position.y += (fGy + fHop - 0.12 * catSit - 0.16 * catLie - fluffy.position.y) * Math.min(1, dt * 12);
  // sitting: chest up, rump down (nose up = negative pitch)
  fluffy.rotation.x = -0.34 * catSit - 0.02 * catLie;
  fPh = (fPh + fMoved / 0.42 * Math.PI * 2) % (Math.PI * 200);
  fluffy.userData.legs.forEach((l, i) => {
    // tucked away instead of sticking out: backs fold under in a sit, all four hide in a loaf
    const hidden = !inBoat && (catLie > 0.4 || (i > 1 && catSit > 0.4));
    if (l.visible === hidden) l.visible = !hidden;
    if (inBoat) { l.rotation.x = 1.15; return; }
    const amp = Math.min(1, fMoved / (dt * 2.4)) * 0.55 * (1 - Math.max(catSit, catLie));
    l.rotation.x = Math.sin(fPh + (i % 2) * Math.PI + (i > 1 ? Math.PI : 0)) * amp;
  });

  // verlet tail: gravity, drag against the turn, then length constraints
  const { tp, tailSegs, tailTip, earL, earR } = fluffy.userData;
  tp[0].p.set(0, 0.58, -0.46);
  const yawD = ((fy + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  for (let i = 1; i < tp.length; i++) {
    const q = tp[i];
    const vx = (q.p.x - q.prev.x) * 0.9, vy = (q.p.y - q.prev.y) * 0.9, vz = (q.p.z - q.prev.z) * 0.9;
    q.prev.copy(q.p);
    q.p.x += vx - yawD * 0.04 * (i / 4);
    q.p.y += vy - 7 * dt * dt;
    q.p.z += vz + yawD * 0.04 * (i / 4);
  }
  for (let i = 1; i < tp.length; i++) {
    const a = tp[i - 1].p, b = tp[i].p;
    const d = b.clone().sub(a), L = d.length() || 1;
    b.copy(a).addScaledVector(d, 0.14 / L);
  }
  for (let i = 0; i < tailSegs.length; i++) {
    const a = tp[i].p, b = tp[i + 1].p, m = tailSegs[i];
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(UPV, b.clone().sub(a).normalize());
  }
  tailTip.position.copy(tp[4].p);
  [earA, earV] = spring(earA, earV, THREE.MathUtils.clamp(-turnRate * 0.05, -0.35, 0.35), 60, 9, dt);
  earL.rotation.x = earR.rotation.x = earA + Math.sin(t * 3) * 0.04;

  // camera: looks where she is heading, and pulls in when a tree gets between
  lookAt.set(player.position.x, player.position.y + 1.25, player.position.z)
    .addScaledVector(dir, Math.min(1.5, vel * 0.22));
  const off = new THREE.Vector3(
    Math.sin(camYaw) * Math.cos(camPitch),
    Math.sin(camPitch),
    Math.cos(camYaw) * Math.cos(camPitch),
  ).normalize();
  if (!CAM_SOLID.length) CAM_SOLID.push(pools.trunk, pools.canopy, pools.canopy2, pools.rock);
  camRay.camera = camera;
  camRay.set(lookAt, off);
  const hit = inCave ? (caveRoom ? camRay.intersectObject(caveRoom.g, true)[0] : null) : camRay.intersectObjects(CAM_SOLID, false)[0];
  const wantD = hit && hit.distance < camDist ? Math.max(2.4, hit.distance - 0.5) : camDist;
  camNear += (wantD - camNear) * Math.min(1, dt * (wantD < camNear ? 16 : 4));
  camera.position.lerp(lookAt.clone().addScaledVector(off, camNear), 1 - Math.pow(0.0015, dt));
  camera.lookAt(lookAt);

  // soft contact shadows keep both of them on the ground
  const gyP = Math.max(groundAt(player.position.x, player.position.z), bridgeY, player.position.y - 0.4);
  pShadow.position.set(player.position.x, gyP + 0.02, player.position.z);
  fShadow.position.set(fluffy.position.x, groundAt(fluffy.position.x, fluffy.position.z) + 0.02, fluffy.position.z);

  ground.position.set(player.position.x, 0, player.position.z);
  for (const c of clouds) {
    c.position.x += dt * 1.1;
    if (c.position.x - player.position.x > 190) c.position.x -= 380;
    if (c.position.z - player.position.z > 240) c.position.z -= 480;
    if (c.position.z - player.position.z < -240) c.position.z += 480;
  }
  wind.value = t;
  // ponytail: linear scan of ~25 chunks of nodes each frame; fine at this size, index crystals if it shows up in a profile
  {
    let best = null, bd = 26;
    for (const c of chunks.values()) {
      for (const n of c.nodes) {
        if (n.type !== 'crystal') continue;
        const tk = takenAt.get(n.id);
        if (tk && performance.now() - tk < TAKEDOWN) continue;
        const d = Math.hypot(n.x - player.position.x, n.z - player.position.z);
        if (d < bd) { bd = d; best = n; }
      }
    }
    const pulse = 0.5 + Math.sin(t * 2.4) * 0.5;
    const want = best ? Math.max(0, 1 - bd / 26) : 0;
    sparkFade += (want - sparkFade) * Math.min(1, dt * 14);
    if (best) sparkLight.position.set(best.x, 0.75 * best.s, best.z);
    sparkLight.intensity = (1.1 + pulse * 1.1) * sparkFade;
    sparkHalo.position.copy(sparkLight.position);
    sparkHalo.material.opacity = (0.18 + pulse * 0.3) * sparkFade;
    sparkHalo.scale.setScalar((1.7 + pulse * 0.8) * (0.55 + sparkFade * 0.45));
  }

  for (const b of butterflies) {
    const u = b.userData;
    const bx = player.position.x + u.bx + Math.sin(t * 0.6 + u.s) * 2.2;
    const bz = player.position.z + u.bz + Math.cos(t * 0.45 + u.s * 1.7) * 2.2;
    b.position.set(bx, u.y + Math.sin(t * 1.8 + u.s) * 0.35, bz);
    b.rotation.y = t * 0.9 + u.s;
    const flap = 0.55 + Math.sin(t * 18 + u.s) * 0.45;
    b.children[0].rotation.z = flap;
    b.children[1].rotation.z = -flap;
  }
  skyDome.position.copy(camera.position);
  if (inCave && caveRoom) caveTick(dt, t);

  if ((rebuildAcc += dt) > 0.4) { rebuildAcc = 0; if (!inCave) refreshChunks(player.position.x, player.position.z); }
  if ((skyAcc += dt) > 5) { skyAcc = 0; updateSky(); }
  if ((mapAcc += dt) > 0.18) { mapAcc = 0; drawMap(); }
  if ((saveAcc += dt) > 3) { saveAcc = 0; if (!inCave) { save.x = player.position.x; save.z = player.position.z; persist(); } }

  if (!inCave && t - (window.__lastReg || 0) > 0.5) {
    window.__lastReg = t;
    const rx = Math.floor(player.position.x / R), rz = Math.floor(player.position.z / R);
    let newPond = false;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      ensureRegion(rx + dx, rz + dz);
      ensureHill(rx + dx, rz + dz);
      ensureCave(rx + dx, rz + dz);
      if (ensurePond(rx + dx, rz + dz)) newPond = true;
    }
    if (newPond) rebuild();
    // keep one critter pair per region, capped
    if (critters.length < 6) {
      const s = spot(rx, rz);
      if (Math.hypot(s.x - player.position.x, s.z - player.position.z) < 90) {
        const n = critters.length;
        makeCritter(s.x + 6 + n * 2, s.z + 5, (n * 0.13) % 1);
      }
    }
    updateNear();
    updateObjective();
    ensureFriends(player.position.x, player.position.z);
    if (deer.length < 2 && Math.random() < 0.3) {
      const a = Math.random() * Math.PI * 2, d = 32 + Math.random() * 34;
      deer.push(makeDeer(player.position.x + Math.cos(a) * d, player.position.z + Math.sin(a) * d, Math.random() < 0.45 ? 'rabbit' : 'deer'));
    }
    if (birds.length < 2 && Math.random() < 0.35) makeFlock();
    maybeGift();
    if (Math.hypot(3.5 * R - player.position.x, -2.5 * R - player.position.z) < R * 2) ensureGiant();
    checkBadges();
    // mushrooms are a little instrument: step on one, it sings
    for (const c of chunks.values()) {
      for (const n of c.nodes) {
        if (n.type !== 'mush') continue;
        if (Math.hypot(n.x - player.position.x, n.z - player.position.z) < 1.05) {
          if (t - (window.__mushT || 0) > 0.4) {
            window.__mushT = t;
            const gi = Math.floor(n.tone * 8);
            sfx.note(gi);
            if (!save.garden.includes(gi) && save.garden.length < 8) { save.garden.push(gi); persist(); }
            burst(new THREE.Vector3(n.x, 0.45, n.z), 0xffd0e0, 5, 1.2);
          }
        }
      }
    }
  }

  // particles
  for (let i = 0; i < P_N; i++) {
    if (pPos[i * 3 + 1] < -50) continue;
    pVel[i].y -= 7 * dt;
    pPos[i * 3] += pVel[i].x * dt;
    pPos[i * 3 + 1] += pVel[i].y * dt;
    pPos[i * 3 + 2] += pVel[i].z * dt;
    if (pPos[i * 3 + 1] < 0) pPos[i * 3 + 1] = -99;
  }
  pGeo.attributes.position.needsUpdate = true;

  // critters wander and chirp when you get close
  for (const c of critters) {
    c.t += dt;
    if (c.t > 3) {
      c.t = 0;
      c.target.set(c.home.x + (Math.random() - 0.5) * 10, c.home.y + (Math.random() - 0.5) * 10);
    }
    const dx = c.target.x - c.g.position.x, dz = c.target.y - c.g.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.3) {
      c.g.position.x += (dx / d) * dt * 1.1;
      c.g.position.z += (dz / d) * dt * 1.1;
      c.g.rotation.y = Math.atan2(dx, dz);
      c.body.position.y = 0.32 + Math.abs(Math.sin(performance.now() * 0.004)) * 0.14;
    }
    if (performance.now() - c.met > 20000 && c.g.position.distanceTo(player.position) < 3.2) {
      c.met = performance.now();
      toast(LINES[Math.floor(Math.random() * LINES.length)]);
      sfx.blip(660 + Math.random() * 200, 0.25, 'triangle', 0.12);
      burst(c.g.position.clone(), 0xffd0f0, 8, 2);
    }
    if (c.g.position.distanceTo(player.position) > 220) c.home.set(player.position.x, player.position.z);
  }

  // weather
  if (weather !== 'clear') {
    const rain = weather === 'rain';
    const fall = rain ? 13 : weather === 'snow' ? 2.2 : 1.3;
    for (let i = 0; i < wx.n; i++) {
      const k = i * 3;
      wx.pos[k + 1] -= fall * dt;
      wx.pos[k] += (rain ? 0.4 : Math.sin(t * 0.9 + i) * 0.5) * dt;
      wx.pos[k + 2] += (rain ? 0.2 : Math.cos(t * 0.7 + i) * 0.4) * dt;
      if (wx.pos[k + 1] < 0 || Math.abs(wx.pos[k] - player.position.x) > 26 || Math.abs(wx.pos[k + 2] - player.position.z) > 26) {
        wx.pos[k] = player.position.x + (Math.random() - 0.5) * 44;
        wx.pos[k + 1] = 14 + Math.random() * 4;
        wx.pos[k + 2] = player.position.z + (Math.random() - 0.5) * 44;
      }
    }
    wx.geo.attributes.position.needsUpdate = true;
  }

  // fireflies come out after dark
  const night = 1 - dayLight;
  flies.mat.opacity = night > 0.45 ? (night - 0.45) * 1.6 : 0;
  if (flies.mat.opacity > 0) {
    if (!save.fireflies) { save.fireflies = true; persist(); }
    for (let i = 0; i < flies.n; i++) {
      const k = i * 3;
      flies.pos[k] += Math.sin(t * 0.8 + i) * 0.012;
      flies.pos[k + 1] += Math.cos(t * 0.6 + i * 2) * 0.01;
      flies.pos[k + 2] += Math.cos(t * 0.7 + i * 3) * 0.012;
      const dx = flies.pos[k] - player.position.x, dz = flies.pos[k + 2] - player.position.z;
      if (Math.hypot(dx, dz) > 18) {
        flies.pos[k] = player.position.x + (Math.random() - 0.5) * 24;
        flies.pos[k + 2] = player.position.z + (Math.random() - 0.5) * 24;
      }
    }
    flies.geo.attributes.position.needsUpdate = true;
  }

  waterT.value = t;
  waterU.t.value = t;
  fishTick(dt); miniTick(dt);
  pShadow.visible = fShadow.visible = !inBoat;
  if (inBoat && boatPond) {
    boatPond.boat.g.position.set(player.position.x - boatPond.x, 0.06, player.position.z - boatPond.z);
    boatPond.boat.g.rotation.y = player.rotation.y;
    player.position.y = 0.14 + Math.sin(t * 2) * 0.02;
  }
  for (const b of paperBoats) {
    b.a += dt * 0.18;
    b.m.position.set(b.pd.x + Math.cos(b.a) * b.pd.r * 0.6, 0.16, b.pd.z + Math.sin(b.a) * b.pd.r * 0.6);
    b.m.rotation.y = -b.a;
  }
  lifeTick(dt, t);

  for (const c of camps) {
    c.light.intensity = night * 2.2 * (0.85 + Math.sin(t * 7 + c.g.position.x) * 0.15);
    c.fire.scale.y = 0.85 + Math.sin(t * 9 + c.g.position.z) * 0.2;
  }

  renderer.render(inCave ? caveScene : scene, camera);
}

// ---------------------------------------------------------------- boot
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
updateSky();
pickWeather();
seedFlies();
updateObjective();
refreshChunks(player.position.x, player.position.z, true);
ensureRegion(Math.floor(player.position.x / R), Math.floor(player.position.z / R));
renderer.setAnimationLoop(tick);

$('#go').onclick = async () => {
  $('#start').remove();
  sfx.start();
  started = true;
  try {
    await document.documentElement.requestFullscreen?.();
    await screen.orientation?.lock?.('landscape');
  } catch { /* desktop or refused - fine */ }
  toast('Fluffy says hi 👋');
};

if ('serviceWorker' in navigator) {
  const hadOne = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadOne) location.reload(); });
  navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
    .then((r) => { r.update(); document.addEventListener('visibilitychange', () => { if (!document.hidden) r.update(); }); })
    .catch(() => {});
}

// ponytail: test hook, only read by the headless harness
window.__w = {
  pushOut, save,
  rim: (on) => { let c = 0; scene.traverse((o) => { const mm = o.material; if (mm && mm.isMeshToonMaterial) { mm.userData.rim = on; mm.needsUpdate = true; c++; } }); return c; },
  dump: () => { const out = []; player.traverse((o) => out.push({ n: o.name || o.type, m: o.material ? (o.material.type + (o.material.isMeshToonMaterial ? '/toon' : '')) : '-', v: o.visible, s: +o.scale.x.toFixed(2), k: o.userData.outline ? 'hull' : '' })); return out; },
  outlines: (v) => { let c = 0; scene.traverse((o) => { if (o.userData.outline) { o.visible = v; c++; } }); return c; },
  move: (x, y) => { input.x = x; input.y = y; return [input.x, input.y]; },
  gait: () => ({ walk: +walk.toFixed(2), vel: +vel.toFixed(2), lean: +leanZ.toFixed(3), pitch: +pitchX.toFixed(3), legs: player.userData.legs.map((l) => +l.scale.y.toFixed(2)), y: +player.position.y.toFixed(2) }),
  deer: () => deer.map((d) => ({ k: d.kind, x: +d.g.position.x.toFixed(1), z: +d.g.position.z.toFixed(1), spd: +d.spd.toFixed(2), ph: +d.ph.toFixed(2), y: +d.g.position.y.toFixed(2) })),
  nodes: () => [...chunks.values()].flatMap((c) => c.nodes),
  wet: () => { let n = 0; const all = [...chunks.values()].flatMap((c) => c.nodes); for (const pd of ponds.values()) for (const nd of all) if (Math.hypot(nd.x - pd.x, nd.z - pd.z) < pd.r) n++; return n; },
  pose: () => ({ x: player.position.x, y: player.position.y, z: player.position.z }),
  find: (hex) => { const out = []; scene.traverse((o) => { if (o.isMesh && o.material && o.material.color && o.material.color.getHexString() === hex) { const w = new THREE.Vector3(); o.getWorldPosition(w); out.push({ x: +w.x.toFixed(1), y: +w.y.toFixed(2), z: +w.z.toFixed(1), g: o.geometry.parameters && o.geometry.parameters.depth }); } }); return out; },
  catIdle: (s2) => { idleT = s2; },
  cat: () => ({ p: fluffy.position.toArray().map((v) => +v.toFixed(2)), kids: fluffy.children.length, vis: fluffy.visible, box: (() => { const b = new THREE.Box3().setFromObject(fluffy); return [b.min.toArray().map((v) => +v.toFixed(2)), b.max.toArray().map((v) => +v.toFixed(2))]; })() }),
  cam: () => camera.position.toArray().map((v) => +v.toFixed(1)),
  dist: () => +camDist.toFixed(2),
  bed: (m) => { checkBedtime(m); return asleep; },
  zoom: (d) => { camDist = clamp(d, CAM_MIN, CAM_MAX); return camDist; },
  skyNow: () => { updateSky(); return true; },
  sky: () => {
    const v = (m) => (m.visible ? +((m.position.y - player.position.y) / 140).toFixed(2) : null);
    return { h: +skyH.toFixed(2), alt: +skySun.toFixed(2), sunY: v(sunDisc), moonY: v(moonDisc), sunVis: sunDisc.visible, moonVis: moonDisc.visible, day: +dayLight.toFixed(2) };
  },
  tp: (x, z, r) => { player.position.set(x, 0, z); if (r !== undefined) player.rotation.y = r; },
  near: () => (near ? near.kind : null),
  lit: () => ({ on: sparkLight.intensity > 0.02, i: +sparkLight.intensity.toFixed(2), x: Math.round(sparkLight.position.x), z: Math.round(sparkLight.position.z) }),
  spot: (i, j) => { const q = spot(i, j); return { x: Math.round(q.x), z: Math.round(q.z) }; },
  obj: () => ({ id: objId, list: objList.map((o) => ({ id: o.id, label: o.label, d: Math.round(Math.hypot(o.x - player.position.x, o.z - player.position.z)) })) }),
  big: () => ({ open: bigOpen, pins: objList.length }),
  caveDoors: () => (caveRoom ? caveRoom.doors.map((d) => ({ id: d.id, open: d.open, plug: d.g ? d.g.visible : null, arch: d.ring ? d.ring.visible : null })) : []),
  cdoor: (id) => { const d = caveRoom && caveRoom.doors.find((x) => x.id === id); if (d) caveDoorOpen(d); },
  caveGround: (x, z) => caveGround(x, z),
  caveDump: () => (caveRoom ? caveRoom.g.children.slice(0, 10).map((o) => ({ t: o.geometry && o.geometry.type, p: o.position.toArray().map((v) => +v.toFixed(1)), v: o.visible, s: o.scale.toArray().map((v) => +v.toFixed(1)) })) : []),
  caveSceneInfo: () => ({ kids: caveScene.children.length, near: camera.near, far: camera.far, calls: renderer.info.render.calls, fov: camera.fov }),
  caveInfo: () => ({ kids: caveRoom ? caveRoom.g.children.length : -1, parent: !!(caveRoom && caveRoom.g.parent), cam: camera.position.toArray().map((v) => +v.toFixed(1)), tris: renderer.info.render.triangles }),
  ponds: () => [...ponds.values()].map((p) => ({ x: +p.x.toFixed(1), z: +p.z.toFixed(1), r: +p.r.toFixed(1) })),
  rawWet: () => {
    let inStream = 0, inPond = 0;
    for (const c of chunks.values()) for (const n of c.nodes) {
      if (n.type !== 'tree') continue;
      for (const pd of ponds.values()) {
        if (Math.hypot(n.x - pd.x, n.z - pd.z) < pd.r) inPond++;
        const st = pd.stream;
        if (st) {
          const dx = n.x - st.x, dz = n.z - st.z;
          const al = dx * st.dx + dz * st.dz, ac = Math.abs(dx * st.nx + dz * st.nz);
          if (al > st.a && al < st.b && ac < 2.6) inStream++;
        }
      }
    }
    return { inPond, inStream };
  },
  cave: () => ({ in: inCave, key: caveKey, found: caveFound, t: +caveT.toFixed(1),
    crystals: caveRoom ? caveRoom.crystals.map((c) => ({ x: +c.x.toFixed(1), z: +c.z.toFixed(1), got: c.got })) : [],
    exitOpen: caveRoom ? caveRoom.arch.door.opacity > 0 : false }),
  caveGo: (i = 0) => { const c = [...caves.values()][i]; if (!c) return false; enterCave(c); return true; },
  caveTest: (key = 'test-cave') => { buildCave(key); enterCave({ key }); return true; },
  caveOut: () => { caveFound = 3; leaveCave(); },
  treasure: () => save.treasure.slice(),
  enter: (on) => { const q = nearestPond(); if (on && q) enterBoat(q.pd); else if (!on) leaveBoat(); return inBoat; },
  gateAnswer: () => (gate ? String(gate.p.answer) : null),
  counts: () => ({
    ponds: ponds.size, hills: hills.size, caves: caves.size, birds: birds.length,
    deer: deer.length, giant: !!giant, camps: camps.length,
    fish: [...ponds.values()].reduce((n, p) => n + (p.fish || []).length, 0),
    stones: [...ponds.values()].reduce((n, p) => n + (p.stones || []).length, 0),
    docks: [...ponds.values()].filter((p) => p.dock).length,
    boats: [...ponds.values()].filter((p) => p.boat).length,
    streams: [...ponds.values()].filter((p) => p.stream).length,
  }),
  scan: (x, z) => {
    const rc = new THREE.Raycaster(new THREE.Vector3(x, 120, z), new THREE.Vector3(0, -1, 0));
    const hits = rc.intersectObjects(scene.children, true).slice(0, 3);
    return hits.map((h) => ({ y: +h.point.y.toFixed(2), col: h.object.material && h.object.material.color ? '#' + h.object.material.color.getHexString() : null }));
  },
  pond: () => { const p = nearestPond(); return p ? { x: p.pd.x, z: p.pd.z, r: p.pd.r, d: p.d, axis: p.pd.axis, dock: p.pd.dock, boat: p.pd.boat && { x: p.pd.boat.x, z: p.pd.boat.z }, stream: p.pd.stream } : null; },
  marks: () => ({
    caves: [...caves.values()].map((c) => ({ x: c.x, z: c.z })),
    hills: [...hills.values()].map((h) => ({ x: h.x, z: h.z, h: h.h, r: h.r })),
    giant: giant ? { x: giant.x, z: giant.z, awake: giant.awake } : null,
  }),
};
