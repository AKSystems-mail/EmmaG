import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeProblem } from './math.js';
import { Sound } from './audio.js';

const $ = (s) => document.querySelector(s);
const { clamp, lerp, smoothstep } = THREE.MathUtils;

// ---------------------------------------------------------------- constants
const R = 130;        // a new land every 130 units
const CH = 44;        // prop chunk size
const VIEW = 2;       // chunks around the player (5x5)
const SAVE = 'emmaworld.v2';
// ?debug turns on the __w / __r harness hooks; a normal session never sees them
const DBG = /[?&]debug\b/.test(location.search) || location.hostname === 'localhost';
const TYPES = ['wood', 'stone', 'bloom', 'spark'];
const LABEL = { wood: 'Wood', stone: 'Stone', bloom: 'Bloom', spark: 'Spark' };
// a cache is not always the same pile: four bundles, picked by the room so the same
// room always gives the same one and nothing changes under her on a second visit
const CACHE_KITS = [
  { stone: 6, bloom: 4, col: 0xb0703c },
  { wood: 8, stone: 2, col: 0x8a7cc0 },
  { spark: 2, bloom: 3, col: 0xc0a45c },
  { wood: 3, stone: 3, bloom: 2, spark: 1, col: 0x7aa88a },
];
const cacheKit = (s) => { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0; return CACHE_KITS[Math.abs(h) % CACHE_KITS.length]; };
const ICON = { wood: 'Wood', stone: 'Stone', bloom: 'Bloom', spark: 'Spark' };
const GATHER = { tree: 'wood', rock: 'stone', flower: 'bloom', crystal: 'spark' };
// regrow per resource: wood is slowest, bloom (the child's favourite) fastest
const TAKEDOWN = { wood: 45000, stone: 30000, bloom: 15000, spark: 25000 };
const isGone = (n, now = performance.now()) => {
  const t = takenAt.get(n.id);
  return !!t && now - t < TAKEDOWN[GATHER[n.type]];
};

// ---------------------------------------------------------------- state
// a half-written or evicted save used to throw here and kill the whole module (blank world)
const store = (() => { try { return JSON.parse(localStorage.getItem(SAVE) || '{}') || {}; } catch { return {}; } })();
const save = Object.assign(
  { seed: (Math.random() * 1e9) | 0, x: R / 2, z: R / 2, gates: [], restored: [], res: { wood: 0, stone: 0, bloom: 0, spark: 0 } },
  store,
);
if (!Number.isFinite(save.x) || !Number.isFinite(save.z) || (save.x === 0 && save.z === 0)) save.x = save.z = R / 2;
save.gates ||= []; save.res ||= { wood: 0, stone: 0, bloom: 0, spark: 0 };
if (!save.gates.length) save.gates.push(regionKey(save.x, save.z));
save.friends ||= []; save.camps ||= []; save.fireflies ||= false;
save.journal ||= []; save.badges ||= []; save.catches ||= []; save.notes ||= [];
save.garden ||= []; save.gifts ||= 0; save.names ||= {}; save.postcards ||= [];
save.caves ||= []; save.treasure ||= []; save.caches ||= [];
  save.mathLvl ||= 0; save.mStreak ||= 0; save.quests ||= {}; save.giant ||= false; save.giantN ||= 0; save.decor ||= [];
save.crossed ||= 0; save.bestSkip ||= 0; save.boat ||= false;
save.painting ||= ''; save.giftDay ||= '';
// ponytail: a full quota drops the write instead of the frame -- postcards are ~1 MB
// of the 5 MB budget; prune save.postcards harder if kids hit it
const persist = () => { save.lastSeen = Date.now(); try { localStorage.setItem(SAVE, JSON.stringify(save)); } catch { /* keep playing on the last good save */ } };

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
  window.addEventListener('error', (e) => window.__errs.push('ERR ' + (e.message || e.error)));
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
if (DBG) window.__r = renderer;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 500);
scene.fog = new THREE.Fog(0x9ec6d8, 38, 135);

const hemi = new THREE.HemisphereLight(0xdfefff, 0x5b7a45, 0.8);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff3d6, 1.15);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
// the light sits 90 m out every frame: keep near/far tight so bias is world-scale,
// not a 0.29 m slop that erased the shadow of anything shorter than a tree
Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 70, far: 130 });
sun.shadow.bias = -0.0006;
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
  const n = 1100, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, y = Math.random(), r = 185;
    const rr = Math.sqrt(1 - y * y) * r;
    pos.set([Math.cos(a) * rr, y * r, Math.sin(a) * rr], i * 3);
    const b = 0.25 + Math.random() ** 3 * 0.75;      // a few bright, mostly faint
    col.set([b, b, Math.min(1, b * 1.06)], i * 3);   // faintest ones a touch blue
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ map: dotTex, size: 2.3, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
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
  // dark part = the unlit limb plus the terminator ellipse: a real crescent or
  // gibbous instead of a circle sliding across the face. (1 - 2*lit), not
  // (2*lit - 1): the mask has to cover the UNLIT part, so at lit 0 it is the
  // whole disc and at lit 1 it is nothing.
  const a = R * (1 - 2 * lit), sh = new THREE.Shape();
  sh.absarc(0, 0, R, Math.PI / 2, Math.PI * 1.5, false);
  if (a >= 0) sh.absellipse(0, 0, a, R, -Math.PI / 2, Math.PI / 2, false);
  else sh.absellipse(0, 0, -a, R, Math.PI * 1.5, Math.PI / 2, true);
  const shade = new THREE.Mesh(new THREE.ShapeGeometry(sh, 24), discMat(0x0b1226, 0.94));
  shade.scale.x = waxing ? 1 : -1;      // waxing: lit on the right, waning: left
  shade.position.z = 0.3;
  shade.renderOrder = 1;                // transparent sort flips with camera moves
  moonDisc.add(shade);
  // new moon is a dark disc with a steady faint glow around it
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: dotTex, color: 0xdfe9ff, transparent: true, opacity: 0.55 * (1 - lit) ** 3,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.scale.set(32, 32, 1);
  halo.renderOrder = -1;
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
// smooth 24-step ramp: the 3-step toonRamp posterises small blocky props into flat facets
const toonSoft = (() => {
  const n = 24, d = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) { const v = Math.round(255 * i / (n - 1)); d.set([v, v, v, 255], i * 4); }
  const t = new THREE.DataTexture(d, n, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
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
function outline(root, k = 1.06, mat = OUTLINE) {
  root.traverse((m) => {
    if (!m.isMesh || m.userData.outline || !m.material?.isMeshToonMaterial) return;
    const o = new THREE.Mesh(m.geometry, mat);
    o.userData.outline = true;
    o.scale.setScalar(m.userData.outlineK || k);
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
  // five petals leaning out of a small centre: a bloom, not a diamond
  flower: (() => {
    const ps = [];
    for (let i = 0; i < 5; i++) {
      const g = new THREE.PlaneGeometry(0.15, 0.24);
      g.rotateY(Math.PI / 2);                             // face outward, stand it upright
      g.translate(0.06, 0.17, 0);                         // step out from the middle, lift it
      g.rotateZ(-0.42);                                   // splay the top away from the centre
      g.rotateY((i / 5) * Math.PI * 2);
      ps.push(g);
    }
    const mid = new THREE.CircleGeometry(0.055, 6);       // the eye in the middle
    mid.rotateX(-Math.PI / 2);
    ps.push(mid);
    ps.push(new THREE.CylinderGeometry(0.012, 0.02, 0.2, 3).translate(0, 0.1, 0));  // a stem, so it stands
    return mergeGeometries(ps, false).translate(0, 0.2, 0);
  })(),
  // three shards leaning into each other, not one floating crystal
  crystal: (() => {
    const ps = [];
    for (const [lean, tall] of [[-0.34, 1.15], [0, 2.0], [0.36, 1.35]]) {
      const g = new THREE.OctahedronGeometry(0.2, 0).scale(1, tall, 1);
      g.rotateZ(lean);
      g.translate(lean * 0.55, 0.2 * tall, 0);
      ps.push(g);
    }
    return mergeGeometries(ps, false);
  })(),
  // a clump, not a ball: vertices knocked off the sphere by their own position,
  // so shared corners move together and no cracks open between faces
  bush: (() => {
    const g = new THREE.IcosahedronGeometry(0.72, 1), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + 0.3 * Math.sin(x * 12.9 + y * 7.3 + z * 4.7);
      p.setXYZ(i, x * k, Math.max(0, y) * (0.8 + 0.4 * Math.abs(Math.sin(x * 9.1 + z * 6.3))), z * k);
    }
    g.computeVertexNormals();
    return g.translate(0, 0.5, 0);
  })(),


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
  flower: pool(geo.flower, mat({ color: 0xf2a0c8, side: THREE.DoubleSide }), 700),
  // pale glass rather than a solid purple gem: low opacity so the grass shows
  // through it, and only a cool glow so it still reads at night
  crystal: pool(geo.crystal, mat({ color: 0xdcdcff, emissive: 0x9a86e0, emissiveIntensity: 0.5,
    roughness: 0.12, metalness: 0.0, transparent: true, opacity: 0.5, depthWrite: false,
    side: THREE.DoubleSide }), 200),
  bush: pool(geo.bush, mat({ color: 0x3f8a3c }), 400),
  // tuft: built from grass.glb once it lands -- a cone here read as a green spike
  mush: pool(geo.mush, mat({ color: 0xe06a7a }), 90),
};

// a real grass clump for the open-field patches; instanceColor tints it
new GLTFLoader().load('/models/grass.glb', (g) => {
  g.scene.updateMatrixWorld(true);
  let gm = null;   // two meshes in the file; the large one is the clump
  g.scene.traverse((o) => { if (o.isMesh && (!gm || /Large/i.test(o.name))) gm = o; });
  if (!gm) return;
  // the x100 scale and 64 u offset live on the node, not in the vertices
  const geoG = gm.geometry.clone().applyMatrix4(gm.matrixWorld);
  geoG.computeBoundingBox();
  const c = geoG.boundingBox.getCenter(new THREE.Vector3());
  geoG.translate(-c.x, -geoG.boundingBox.min.y, -c.z);
  const mG = gm.material.clone();
  mG.flatShading = true;
  mG.side = THREE.DoubleSide;
  pools.grass = pool(geoG, mG, 320);
  pools.grass.castShadow = false;
  // same clump doubles as the scattered tuft cover, smaller and windier
  const mt = windify(mat({ color: 0x5d9a49 }), '0.12');   // sits in the ground colour instead of glowing out of it
  pools.tuft = pool(geoG, mt, 1200);
  pools.tuft.castShadow = false;
  rebuild();
}, undefined, () => {});

// ---------------------------------------------------------------- asset packs
// Quaternius / Kenney GLBs replace the hand-built cones, boulders and plank
// piers. Every file lands async, builds its pool and calls rebuild(), so the
// live world picks it up with no reload; put() skips a key that isn't there yet.
const partsOf = (gl) => {
  gl.scene.updateMatrixWorld(true);
  const out = [];
  gl.scene.traverse((o) => {
    if (o.isMesh) out.push({ geo: o.geometry.clone().applyMatrix4(o.matrixWorld), mat: o.material });
  });
  return out;
};
// centre x/z, sit on y=0, scale to height h -- the packs ship at wildly
// different scales (a 3 m tree and a 21 m dock in the same download)
const fitAll = (ps, h) => {
  const box = new THREE.Box3();
  for (const p of ps) { p.geo.computeBoundingBox(); box.union(p.geo.boundingBox); }
  const s = box.getSize(new THREE.Vector3());
  const k = h ? h / s.y : 1;
  const dx = -(box.min.x + box.max.x) / 2, dy = -box.min.y, dz = -(box.min.z + box.max.z) / 2;
  for (const p of ps) p.geo.translate(dx, dy, dz).scale(k, k, k);
  return ps;
};
// the packs are flat-coloured, so trunk+leaves collapse into one geometry with
// the colour baked per vertex: one instanced draw per tree instead of two
const bake = (ps) => mergeGeometries(ps.map(({ geo: g0, mat: m }) => {
  const g = g0.index ? g0.toNonIndexed() : g0;
  for (const a of Object.keys(g.attributes)) if (!['position', 'normal'].includes(a)) g.deleteAttribute(a);
  const c = (m && m.color) || new THREE.Color(1, 1, 1);
  const n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}), false);
const packMat = () => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
const loadPack = (url, fn) => new GLTFLoader().load(url, (gl) => {
  try { fn(gl); } catch (e) { console.warn('pack', url, e); }
  rebuild();
}, undefined, () => {});

// the pickups have real models now: a faceted crystal rock for the spark and a
// hibiscus for the bloom, colours baked per vertex so petals and stem stay apart
const swapGeo = (key, url, h) => loadPack(url, (gl) => {
  const ps = fitAll(partsOf(gl), h);
  // flower_hib.glb already carries the hibiscus map as vertex colours; re-baking
  // would flatten it to one flat colour
  const g = ps[0].geo.attributes.color ? mergeGeometries(ps.map((q) => q.geo), false) : bake(ps);
  pools[key].geometry.dispose();
  pools[key].geometry = g;
  pools[key].userData.own = true;      // the model brings its own colours
  if (key === 'flower') {
    pools[key].material.vertexColors = true;
    pools[key].material.color.set(0xffffff);
    pools[key].material.needsUpdate = true;
  }
});
swapGeo('crystal', '/models/crystal_rock.glb', 0.8);
swapGeo('flower', '/models/flower_hib.glb', 0.42);

// authored hot-air balloon: a POSITION-only blockout, so normals and a two-tone
// vertex colour get built once here and every camp reuses the geometry
let balloonGeo = null;
const balloonWaiters = [];
loadPack('/models/balloon.glb', (gl) => {
  let src = null; gl.scene.traverse((o) => { if (!src && o.isMesh) src = o; });
  if (!src) return;
  const geo = src.geometry.clone().applyMatrix4(src.matrixWorld);
  geo.deleteAttribute('normal');
  geo.computeVertexNormals();
  const p = geo.attributes.position, col = new Float32Array(p.count * 3);
  const brown = new THREE.Color(0xa5794a), pink = new THREE.Color(0xf2a0c8);
  for (let k = 0; k < p.count; k++) {
    const y = p.getY(k), r = Math.hypot(p.getX(k), p.getZ(k));
    const c = y < -0.66 && (r > 0.2 || y < -0.75) ? brown : pink;  // basket frustum vs envelope
    col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  balloonGeo = geo;
  for (const f of balloonWaiters) f();
  balloonWaiters.length = 0;
});

function dressBalloon(g) {
  if (!balloonGeo) { balloonWaiters.push(() => dressBalloon(g)); return; }
  const env = new THREE.Mesh(balloonGeo, mat({ vertexColors: true }));
  env.scale.setScalar(0.9);
  env.position.y = 1.73;          // basket floor lands on 0.65, where she sits during the ride
  env.castShadow = true;
  g.add(env);
  const up = new THREE.Vector3(0, 1, 0);
  for (let k = 0; k < 4; k++) {          // four lines down to the basket corners
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const p0 = new THREE.Vector3(Math.cos(a) * 0.12, 1.19, Math.sin(a) * 0.12);
    const p1 = new THREE.Vector3(Math.cos(a) * 0.26, 1.10, Math.sin(a) * 0.26);
    const d = p1.clone().sub(p0);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, d.length(), 4), mat({ color: 0x6b5b3a }));
    rope.position.copy(p0).addScaledVector(d, 0.5);
    rope.quaternion.setFromUnitVectors(up, d.normalize());
    g.add(rope);
  }
}

// reeds and flowers scattered by ponds and cave mouths: world-space spot lists
// filled by makePond / ensureCave, drawn by whichever pool exists at the time
const reeds = [], blooms = [];
let reedMesh = null, bloomPools = null;
const scatter = (list, meshes, cap = 90) => {
  if (!meshes || !meshes.length) return;
  let i = 0;
  for (const p of list) {
    if (i >= cap) break;
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.set(0, p.r, 0);
    dummy.scale.setScalar(p.s);
    dummy.updateMatrix();
    for (const m of meshes) m.setMatrixAt(i, dummy.matrix);
    i++;
  }
  for (const m of meshes) { m.count = i; m.instanceMatrix.needsUpdate = true; }
};
// one call site for the lazy fill: whatever pool exists at the time
const Scatter = () => {
  if (reedMesh) scatter(reeds, [reedMesh], 420);
  if (bloomPools) scatter(blooms, bloomPools);
};
// river stones worn into the painted trail: sparse, instanced, one tile wide
function paveTrails(px, pz) {
  if (!trailMesh) return;
  if (Math.abs(px - trailAt.x) < 6 && Math.abs(pz - trailAt.z) < 6) return;
  trailAt.x = px; trailAt.z = pz;
  // the ground shader's centreline: x + 11 sin(.019z) + 4 sin(.047z+1.7) walked
  // 15 m off a 47 m repeat, then shoved by 4 sin(.06z) + 1.5 sin(.017z)
  const lane = (k, z) => 65 + 47 * k - 11 * Math.sin(z * 0.019) - 4 * Math.sin(z * 0.047 + 1.7)
    - 4 * Math.sin(z * 0.06) - 1.5 * Math.sin(z * 0.017);
  let i = 0;
  const H = 74, STEP = 2.1;
  // the grid is anchored to the world, not to her: tiles must not slide as she walks
  const z0 = Math.ceil((pz - H) / STEP) * STEP;
  for (let k = Math.floor((px - 78) / 47); k <= Math.ceil((px + 78) / 47); k++) {
    for (let z = z0; z <= pz + H; z += STEP) {
      const x = lane(k, z);
      if (Math.abs(x - px) > 62) continue;
      // a worn run of 3-6 stones, then a long stretch of bare trail
      const n = Math.round(z / STEP), grp = Math.floor(n / 16);
      const run = 3 + Math.floor((Math.abs(Math.sin(grp * 12.9898 + k * 78.233) * 43758.5453) % 1) * 4);
      if (n - grp * 16 >= run) continue;
      if (hillAt(x, z) > 0.05 || inWater(x, z, 1.2)) continue;
      dummy.position.set(x, 0.02, z);
      dummy.rotation.set(0, Math.atan2(lane(k, z + 0.6) - x, 0.6), 0);
      dummy.scale.setScalar(0.9);
      dummy.updateMatrix();
      trailMesh.setMatrixAt(i++, dummy.matrix);
      if (i >= 190) break;
    }
  }
  trailMesh.count = i;
  trailMesh.instanceMatrix.needsUpdate = true;
}

// three trees, three boulders, one flat slab: all normalised so p.s still means
// what it did before (a 0.8-1.3 tree is 3.7-6 m tall)
['tree_a', 'tree_b', 'birch'].forEach((n, i) => loadPack(`/models/${n}.glb`, (gl) => {
  pools['tree' + i] = pool(bake(fitAll(partsOf(gl), 4.6)), packMat(), 240);
}));
[['rock_flat', 'rockFlat', 0x8d939c], ['rock_b', 'rockB', 0], ['rock_c', 'rockC', 0]].forEach(([n, key, tint]) => loadPack(`/models/${n}.glb`, (gl) => {
  const ps = fitAll(partsOf(gl), 0), g = ps[0].geo;
  g.computeBoundingBox();
  const s = g.boundingBox.getSize(new THREE.Vector3());
  const k = 1.7 / Math.max(s.x, s.z);
  g.scale(k, k, k);
  const m = ps[0].mat.clone();
  m.flatShading = true;
  if (tint) m.color.set(tint);     // Kenney's slab ships cream; our rocks are grey
  pools[key] = pool(g, m, 160);
  if (key === 'rockC') for (const c of caves.values()) if (c.g) addCaveRocks(c.g);
}));
// bushes: Quaternius shrubs, two kinds, picked per prop by tone
loadPack('/models/bush_a.glb', (gl) => {
  const ps = fitAll(partsOf(gl), 1.1);          // a shrub, not a tree
  // the pack ships one flat dark green and 0.4 metal -- too dull for this light,
  // so the colour comes from the instance tint instead
  const m = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 1, metalness: 0, side: THREE.FrontSide });
  pools.bush0 = pool(ps[0].geo, m, 200);
});
// two primitives (leaves + berries), so colours bake per vertex and the
// berries survive the instance tint as red
loadPack('/models/bush_b.glb', (gl) => {
  const ps = fitAll(partsOf(gl), 1.1);
  for (const p of ps) p.mat = new THREE.MeshStandardMaterial({ color: /berry/i.test(p.mat.name || '') ? 0xa8323a : 0x55843f });
  pools.bush1 = pool(bake(ps), packMat(), 200);
});
loadPack('/models/tallgrass.glb', (gl) => {
  const ps = fitAll(partsOf(gl), 1.6), m = ps[0].mat.clone();
  m.flatShading = true; m.side = THREE.DoubleSide;
  reedMesh = pool(ps[0].geo, m, 420);
  reedMesh.castShadow = false;
  scatter(reeds, [reedMesh], 420);
});
loadPack('/models/flowers.glb', (gl) => {
  bloomPools = fitAll(partsOf(gl), 1.0).map((p) => {
    const m = p.mat.clone();
    m.flatShading = true; m.side = THREE.DoubleSide;
    return pool(p.geo, m, 90);
  });
  scatter(blooms, bloomPools);
});
const trailAt = { x: 1e9, z: 1e9 };
let trailMesh = null;
loadPack('/models/path_tile.glb', (gl) => {
  const ps = partsOf(gl), m = ps[0].mat.clone();
  m.flatShading = true;
  trailMesh = pool(fitAll(ps, 0)[0].geo, m, 190);
  trailMesh.castShadow = false;
  trailAt.x = 1e9;                 // force the paving to refill
});
// the pier: one geometry, cloned per pond, laid along +z
const dockWait = [];
let dockGeo = null;
let DOCK_Y = 0.9;                  // deck top: re-read off the boards once the model lands
let dockDrop = 0;
// the post caps stand proud of the planks, so bbox.max.y is not the deck. The
// deck is the biggest flat up-facing surface in the model -- her feet go there.
const deckY = (g) => {
  const pos = g.attributes.position, idx = g.index;
  const n = idx ? idx.count : pos.count, gi = (i) => (idx ? idx.getX(i) : i);
  const area = new Map();
  for (let i = 0; i < n; i += 3) {
    const a = gi(i), b = gi(i + 1), c = gi(i + 2);
    const ux = pos.getX(b) - pos.getX(a), uy = pos.getY(b) - pos.getY(a), uz = pos.getZ(b) - pos.getZ(a);
    const wx = pos.getX(c) - pos.getX(a), wy = pos.getY(c) - pos.getY(a), wz = pos.getZ(c) - pos.getZ(a);
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const L = Math.hypot(nx, ny, nz) || 1;
    if (ny / L < 0.85) continue;                    // up-facing only
    const y = +pos.getY(a).toFixed(2);
    area.set(y, (area.get(y) || 0) + L / 2);
  }
  let top = 0, best = -1;
  for (const [y, a] of area) if (a > best) { best = a; top = y; }
  return top;
};
const dockPiece = (z) => {
  const m = new THREE.Mesh(dockGeo, packMat());
  m.position.set(0, dockDrop, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
};
loadPack('/models/dock.glb', (gl) => {
  const g = bake(partsOf(gl));
  g.computeBoundingBox();
  const s = g.boundingBox.getSize(new THREE.Vector3());
  const k = 7.6 / Math.max(s.x, s.z);
  g.scale(k, k, k);
  if (s.x > s.z) g.rotateY(Math.PI / 2);
  dockGeo = fitAll([{ geo: g }], 0)[0].geo;
  dockGeo.computeBoundingBox();
  const deck = deckY(dockGeo);
  dockDrop = 0.9 - dockGeo.boundingBox.max.y;      // caps clear the water at 0.9, posts buried
  DOCK_Y = deck + dockDrop;                        // feet on the planks, not on the caps
  for (const w of dockWait) w.g.add(dockPiece(w.z));
  dockWait.length = 0;
});
// the cave mouth: Toji's cave scene stripped to the rock shell, sunk into the
// hill so its recess frames the painted opening
const shellMat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 1, color: 0x9aa29b });
const SHELL = { s: 2.15, y: -1.25, z: 0.5, tilt: -0.05 };
let shellGeo = null;
function addShell(g) {
  if (!shellGeo || g.userData.shell) return;
  if (g.userData.old) { g.remove(g.userData.old); g.userData.old = null; }
  const s = new THREE.Mesh(shellGeo, shellMat);
  s.scale.setScalar(SHELL.s);
  s.position.set(0, SHELL.y, SHELL.z);
  s.rotation.y = Math.PI;          // the pack's mouth faces -z
  s.rotation.x = SHELL.tilt;       // dip the rear into the hill, keep the mouth level
  s.castShadow = true; s.receiveShadow = true;
  g.add(s);
  g.userData.shell = true;
  addCaveRocks(g);
}
// boulders heaped round the flanks so the mouth isn't a lone stone on grass.
// ponytail: 5 plain meshes sharing the instanced rock geometry
let caveRockMat = null;
function addCaveRocks(g) {
  if (!pools.rockC || g.userData.rocks) return;
  g.userData.rocks = true;
  caveRockMat ||= (() => { const m = pools.rockC.material.clone(); m.vertexColors = false; m.map = null; m.color.set(0x9aa29b); m.flatShading = true; return m; })();
  for (const [a, d, sc] of [[1.15, 2.5, 0.55], [-1.3, 2.8, 0.7], [2.2, 3.2, 0.45], [-2.4, 3.0, 0.5], [Math.PI, 3.6, 0.4], [1.75, 3.9, 0.3], [-2.8, 3.8, 0.34]]) {
    const r = new THREE.Mesh(pools.rockC.geometry, caveRockMat);
    r.scale.setScalar(sc * SHELL.s);
    r.position.set(Math.sin(a) * d * SHELL.s, -0.25, Math.cos(a) * d * SHELL.s);
    r.rotation.y = a * 1.7;
    r.castShadow = r.receiveShadow = true;
    g.add(r);
  }
}
loadPack('/models/cave_mouth.glb', (gl) => {
  shellGeo = fitAll(partsOf(gl), 2.08)[0].geo;
  for (const c of caves.values()) if (c.g) addShell(c.g);
});

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
        // the index must be the node's place in the chunk, not the loop counter: genChunk
        // adds trees in two calls, so both started at 0 and the tall-tree roll reused the
        // grove's ids. chopping one tree then hid every node wearing its id, two at once
        id: `${cx},${cz},${type},${nodes.length}`,
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
  add('tuft', 10 + Math.floor(rnd() * 8), 0.5, 1.0);
  // an open-field grass patch: 3-6 big clumps in a 5 m clump, so it reads as
  // a patch rather than more scatter
  if (rnd() < 0.42) {
    const [px, pz] = warp(cx * CH + 4 + rnd() * (CH - 8), cz * CH + 4 + rnd() * (CH - 8));
    const gn = 8 + Math.floor(rnd() * 6);
    for (let i = 0; i < gn; i++) nodes.push({ id: `${cx},${cz},grass,${i}`, type: 'grass',
      x: px + (rnd() - 0.5) * 3.6, z: pz + (rnd() - 0.5) * 3.6,
      s: 0.75 + rnd() * 0.5, r: rnd() * 6.283, tone: rnd() });
  }
  if (rnd() < 0.5) add('mush', 1 + Math.floor(rnd() * 3), 0.8, 1.3);
  return { cx, cz, nodes };
}

function rebuild() {
  const now = performance.now();
  const n = {};
  for (const c of chunks.values()) {
    for (const p of c.nodes) {
      if (isGone(p, now)) continue;
      if (inWater(p.x, p.z, p.type === 'tree' ? 2.5 * p.s : p.type === 'rock' ? 1.0 * p.s : 0.3)) continue;
      if (camps.some((c) => Math.hypot(p.x - c.x, p.z - c.z) < 6.4)) continue;
      if (p.type === 'tree' && inHill(p.x, p.z, 2 * p.s)) continue;   // the hill wins
      dummy.rotation.set(0, p.r, 0);
      const put = (key, sx, sy, sz, y = 0) => {
        if (!pools[key]) return;                 // asset still loading
        dummy.position.set(p.x, y, p.z);
        dummy.scale.set(sx, sy, sz);
        dummy.updateMatrix();
        const i = n[key] || 0;
        pools[key].setMatrixAt(i, dummy.matrix);
        pools[key].setColorAt(i, col);
        n[key] = i + 1;
      };
      if (p.type === 'tree') {
        // four silhouettes kept, three models: two broadleafs and a birch
        const v = Math.min(3, Math.floor(p.tone * 4));
        col.setScalar(0.9 + p.tone * 0.16);
        put(['tree0', 'tree2', 'tree1', 'tree0'][v], p.s, p.s, p.s);
      } else if (p.type === 'rock') {
        // three tiers: flat slab, then two boulders, each bigger than the last
        const tier = p.tone < 0.45 ? 0 : p.tone < 0.8 ? 1 : 2;
        const rs = p.s * RSTEPS[tier];
        col.setScalar(0.92 + p.tone * 0.12);
        put(['rockFlat', 'rockB', 'rockC'][tier], rs, rs, rs, -0.06 * rs);
      } else if (p.type === 'flower') {
        if (pools.flower.userData.own) col.setScalar(0.9 + p.tone * 0.2);   // the tulip is already coloured
        else col.setHSL([0.9, 0.13, 0.75, 0.55][Math.floor(p.tone * 4)], 0.62, 0.62);
        put('flower', p.s, p.s, p.s);
      } else if (p.type === 'crystal') {
        col.setHSL(0.68, 0.45, 0.8);    // lilac frost: a hint of purple, still see-through
        put('crystal', p.s, p.s, p.s);
      } else if (p.type === 'bush') {
        const berry = p.tone >= 0.5 && pools.bush1;
        col.setHSL(0.29 + p.tone * 0.04, 0.44, 0.24 + p.tone * 0.12);
        if (berry) col.setScalar(0.95 + p.tone * 0.1);   // colours are baked, don't tint the berries green
        put(berry ? 'bush1' : pools.bush0 ? 'bush0' : 'bush', p.s, p.s, p.s);
      } else if (p.type === 'grass') {
        col.setHSL(0.26 + p.tone * 0.04, 0.4, 0.46 + p.tone * 0.1);
        put('grass', p.s * 1.5, p.s * 1.5 * (0.9 + p.tone * 0.3), p.s * 1.5);
      } else {
        col.setHSL(0.26 + p.tone * 0.06, 0.42, 0.28 + p.tone * 0.1);
        put('tuft', p.s * 1.7, p.s * (0.35 + p.tone * 0.25), p.s * 1.7);   // squat and wide, so blades read as cover not spikes
      }
    }
  }
  // only the chunk-prop pools: reeds, blooms and path tiles are filled elsewhere
  for (const k of ['tree0', 'tree1', 'tree2', 'rockFlat', 'rockB', 'rockC', 'flower', 'crystal', 'bush', 'bush0', 'bush1', 'tuft', 'mush', 'grass']) {
    if (!pools[k]) continue;
    pools[k].count = n[k] || 0;
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
const skin = 0xb07f57;
const player = new THREE.Group();
{
  const HAIR = toon({ color: 0x3b2b1f });
  const PINK = toon({ color: 0xff9ed8 });
  const dress = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.88, 7), toon({ color: 0x8b5cc9 }));
  dress.position.y = 0.94;
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.245, 0.36, 7), toon({ color: 0xa578e2 }));
  torso.position.y = 1.34;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), toon({ color: skin }));
  head.position.y = 1.72;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.335, 10, 8), HAIR);
  hair.position.set(0, 1.76, -0.035);
  hair.scale.set(1, 1.02, 1.02);
  for (const sx of [-1, 1]) {
    const lock = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 5), HAIR);      // pointed cheek lock
    lock.position.set(sx * 0.29, 1.66, 0.08); lock.rotation.z = Math.PI + sx * 0.12;
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), HAIR);
    tail.position.set(sx * 0.31, 1.6, -0.06);
    tail.scale.set(0.9, 1.5, 0.9);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.105, 0.34, 5), HAIR);      // tapered swept pigtail
    tip.position.set(sx * 0.36, 1.34, -0.07);
    tip.rotation.z = Math.PI + sx * 0.32; tip.rotation.x = -0.1;
    const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.078, 0.06, 7), PINK);
    tie.position.set(sx * 0.27, 1.79, -0.05); tie.rotation.z = Math.PI / 2;
    for (const m of [lock, tail, tip, tie]) { m.castShadow = true; player.add(m); }
  }
  const bow = new THREE.Group();                                                   // chunky bow, high on her left
  bow.position.set(0.27, 2.0, 0.02); bow.rotation.z = -0.3;
  for (const sx of [-1, 1]) {
    const loop = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), PINK);
    loop.position.set(sx * 0.1, 0, 0); loop.scale.set(1.35, 0.95, 0.6); loop.rotation.z = sx * 0.35;
    loop.castShadow = true; bow.add(loop);
  }
  const knot = new THREE.Mesh(new THREE.OctahedronGeometry(0.062, 0), PINK);
  bow.add(knot);
  player.add(bow);
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x1c1208 });
  for (const sx of [-0.105, 0.105]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), eyeM);
    eye.position.set(sx, 1.73, 0.297);
    player.add(eye);
  }
  const armM = toon({ color: skin });
  const arms = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.28, 1.42, 0.02);
    pivot.rotation.z = sx * 0.16;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.05, 0.42, 6).translate(0, -0.21, 0), armM);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.068, 6, 5), armM);       // mitten hand
    hand.position.set(0, -0.44, 0.01); hand.scale.set(0.85, 1, 1.15);
    arm.castShadow = true; hand.castShadow = true;
    pivot.add(arm, hand);
    player.add(pivot);
    arms.push(pivot);
  }
  const legs = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.14, 0.5, 0);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.5, 6).translate(0, -0.25, 0), toon({ color: skin }));
    leg.castShadow = true;
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.1, 0.27), toon({ color: 0x2a1f2e }));
    shoe.position.set(0, -0.49, 0.06);
    shoe.castShadow = true;
    pivot.add(leg, shoe);
    player.add(pivot);
    legs.push(pivot);
  }
  for (const m of [dress, torso, head, hair]) { m.castShadow = true; player.add(m); }
player.userData = { arms, legs };
}
// the hand-built body is the fallback; emma.glb replaces it once it lands
const emmaPrim = new THREE.Group();
for (const c of [...player.children]) emmaPrim.add(c);
player.add(emmaPrim);
player.position.set(save.x, 0, save.z);
scene.add(player);
outline(player, 1.055, new THREE.MeshBasicMaterial({ color: 0xff80ff, side: THREE.BackSide }));  // neon pink rim
new GLTFLoader().load('/models/emma.glb', (g) => {
  const root = g.scene;
  root.rotation.y = Math.PI;                       // Blender +Y faces -Z in glTF; the game walks +Z
  root.traverse((m) => { if (m.isMesh) { m.material = toon({ color: m.material.color.getHex() }); m.castShadow = true; } });
  const armL = root.getObjectByName('armL'), armR = root.getObjectByName('armR');
  const legL = root.getObjectByName('legL'), legR = root.getObjectByName('legR');
  if (!armL || !armR || !legL || !legR) return;     // bad asset -> quietly stay on the primitives
  player.userData.arms.splice(0, 2, armL, armR);
  player.userData.legs.splice(0, 2, legL, legR);

  // Shoulders. The puff was a ball 35% fatter than the arm sitting in it, so she
  // read as bulbous. Shrink it, hand it to the chest as a socket, then give each
  // arm a clavicle (leads at 0.3) and an elbow (the capsule split at its middle).
  const chest = root.getObjectByName('chest');
  const clavs = [], elbows = [];
  [[armL, 'puff1', 'arm+1', 'hand+1'], [armR, 'puff-1', 'arm-1', 'hand-1']].forEach(([arm, pn, an, hn]) => {
    const puff = root.getObjectByName(pn);
    if (puff) {
      puff.scale.setScalar(0.72);          // r 0.058, just inside the arm's own radius
      chest.attach(puff);
      puff.position.x -= 0.025 * Math.sign(puff.position.x || 1);   // tuck it inboard
    }
    const upper = arm.getObjectByName(an), hand = arm.getObjectByName(hn);
    const clav = new THREE.Group();
    clav.position.copy(arm.position);
    arm.position.set(0, 0, 0);
    chest.add(clav); clav.add(arm);
    const el = new THREE.Group(); el.position.set(0, -0.22, 0); arm.add(el);
    if (upper) {
      // two capsules that share the elbow pivot, each keeping its own round cap:
      // squashing one capsule in half pinched both ends to a point and no amount
      // of joint ball hides the waist, so build the halves instead
      const bb = upper.geometry.boundingBox || (upper.geometry.computeBoundingBox(), upper.geometry.boundingBox);
      const r = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2;
      const half = Math.abs(bb.max.y - bb.min.y) / 2;
      const g2 = new THREE.CapsuleGeometry(r, Math.max(0.02, half - 2 * r), 4, 10);
      upper.geometry = g2;
      upper.scale.setScalar(1); upper.position.set(0, -half / 2, 0);
      const fore = new THREE.Mesh(g2, upper.material);
      fore.castShadow = upper.castShadow;
      fore.userData.outlineK = 1.035;   // thinner hull: two full rims made a ring at the elbow
      fore.position.set(0, -half / 2, 0);
      el.add(fore);
      if (hand) hand.position.y += half;
    }
    if (hand) el.add(hand);
    clavs.push(clav); elbows.push(el);
  });
  player.userData.clavs = clavs;
  player.userData.elbows = elbows;
  player.remove(emmaPrim);
  player.add(root);
  outline(root, 1.055, new THREE.MeshBasicMaterial({ color: 0xff80ff, side: THREE.BackSide }));
  window.__emma = root;
}, undefined, (e) => console.warn('emma.glb', e));
const pShadow = shadowBlob(1.25);

// Fluffy — a rigged tuxedo cat (Blender: 501 tris, 45 cm tall, 24 bones).
// Nothing is baked into the GLB; the game poses her bones every frame.
const fluffy = new THREE.Group();
fluffy.userData = { bones: null, legs: [], tail: [], tailRest: [], earL: null, earR: null };
fluffy.position.copy(player.position).add(new THREE.Vector3(-1, 0, -1));
fluffy.name = 'fluffy';
scene.add(fluffy);
window.__fluffy = fluffy;

new GLTFLoader().load('/models/fluffy.glb', (g) => {
  if (fluffy.userData.tux) return;   // the newer rigged cat already won
  const inst = g.scene, B = {};
  inst.traverse((o) => {
    B[o.name] = o;
    if (o.isMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
      o.material = toon({ color: o.material.color.getHex(), side: THREE.DoubleSide });
    }
  });
  const inner = new THREE.Group();
  inner.rotation.y = -Math.PI / 2;          // the asset faces +x, the world faces +z
  inner.scale.setScalar(1.9 / 180 * 1.35);  // 45 cm asset (cm -> unit); a real cat is ~0.3 of Emma, she reads at 1.35x
  inner.add(inst);
  fluffy.add(inner);

  const legs = [];
  const bind = (up, lo, paw, off, front) => {
    if (!up || !lo || !paw) return;
    legs.push({ up, lo, paw, off, front,
      restUp: up.quaternion.clone(), restLo: lo.quaternion.clone(), restPaw: paw.quaternion.clone() });
  };
  // a cat trots: diagonal pairs move together
  bind(B.frontUpL, B.frontLoL, B.frontPawL, 0, true);
  bind(B.frontUpR, B.frontLoR, B.frontPawR, Math.PI, true);
  bind(B.hindUpL, B.hindLoL, B.hindPawL, Math.PI, false);
  bind(B.hindUpR, B.hindLoR, B.hindPawR, 0, false);
  const tail = ['tail1', 'tail2', 'tail3', 'tail4', 'tail5'].map((n) => B[n]).filter(Boolean);
  Object.assign(fluffy.userData, {
    bones: B, legs, tail, tailRest: tail.map((b) => b.quaternion.clone()),
    hips: B.hips || null, restHips: B.hips ? B.hips.quaternion.clone() : null,
    earL: B.earL || null, earR: B.earR || null,
    restEarL: B.earL ? B.earL.quaternion.clone() : null,
    restEarR: B.earR ? B.earR.quaternion.clone() : null,
  });
  inner.userData.legacy = true;
  window.__fluffyBones = B;
}, undefined, (e) => console.warn('fluffy.glb', e));

// Fluffy v2 — the authored tuxedo cat: 12 bones, real Idle/Walk/Trot/Sit/Loaf clips.
// Sits in the same group, so all the follow/ground/pet logic is untouched.
// Fluffy v2 — the authored tuxedo cat: 2192 tris, 16 bones, 5 baked clips, 4 material slots.
new GLTFLoader().load('/models/tuxedo.glb', (g) => {
  const inst = g.scene;
  const skin = (m) => toon({ color: m.color, gradientMap: toonSoft, flatShading: false });
  inst.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.frustumCulled = false;
    o.material = Array.isArray(o.material) ? o.material.map(skin) : skin(o.material);
  });
  for (const ch of [...fluffy.children]) if (ch.userData.legacy) fluffy.remove(ch);
  fluffy.userData.tux = true;
  const holder = new THREE.Group();
  holder.add(inst);
  holder.scale.setScalar(1.24);            // 0.40 m asset -> ~0.50 m, adult not kitten
  fluffy.add(holder);
  const mix = new THREE.AnimationMixer(inst);
  const acts = {};
  for (const c of g.animations) acts[c.name] = mix.clipAction(c);
  // ponytail: only Idle starts playing. setEffectiveWeight(0) also zeroes .weight, which
  // multiplies the crossfade ramp -> everything stayed weight 0 and the cat slid in bind pose.
  if (acts.Idle) acts.Idle.play();
  for (const n of ['Sit', 'Loaf']) {
    if (!acts[n]) continue;
    acts[n].setLoop(THREE.LoopOnce, 1);
    acts[n].clampWhenFinished = true;
  }
  const tail = inst.getObjectByName('Tail_1');
  Object.assign(fluffy.userData, { mix, acts, clip: 'Idle', tail, holder });
}, undefined, (e) => console.warn('tuxedo cat', e));

const fShadow = shadowBlob(0.55);

const wingShape = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.05, 0.15, 0.17, 0.21, 0.24, 0.12);   // forewing leading edge to the tip
  s.bezierCurveTo(0.27, 0.06, 0.21, 0.02, 0.15, 0.01);   // tip back in to the body
  s.bezierCurveTo(0.23, -0.05, 0.19, -0.16, 0.09, -0.14); // hindwing lobe
  s.bezierCurveTo(0.04, -0.13, 0.01, -0.05, 0, 0);
  return new THREE.ShapeGeometry(s, 8).rotateX(-Math.PI / 2);
})();
const butterflies = Array.from({ length: 6 }, (_, i) => {
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
let tap = null;
addEventListener('pointerdown', (e) => {
  if (e.target.closest('button, #paint, .card, #prompt')) return;
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
    tap = { id: e.pointerId, t: performance.now(), moved: 0 };
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
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (tap && tap.id === e.pointerId) tap.moved += Math.abs(dx) + Math.abs(dy);
    camYaw -= dx * 0.006;
    camPitch = clamp(camPitch + dy * 0.004, 0.16, 1.05);
    drag.x = e.clientX; drag.y = e.clientY;
  }
});
const endDrag = (e) => {
  pts.delete(e.pointerId);
  if (drag?.mode === 'stick') { input.x = 0; input.y = 0; stickEl.style.display = 'none'; }
  if (drag?.mode === 'pinch' && pts.size >= 2) return;
  // a tap on the world is the same as tapping the name tag: a still finger on a
  // pickup or the rowboat acts.  only for things a stray tap can undo.
  if (tap && tap.id === e.pointerId && tap.moved < 12 && performance.now() - tap.t < 420
      && near && (near.kind === 'node' || near.kind === 'boat')) interact();
  tap = null;
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
  resEl.innerHTML = TYPES.map((k) => `<span><i class="dot ${k}"></i>${save.res[k]}<small>${LABEL[k]}</small></span>`).join('');
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
  let [x, z] = warp((rx + 0.5) * R + (rnd() - 0.5) * 90, (rz + 0.5) * R + (rnd() - 0.5) * 90);
  // the sleeping stone, camps and critters all land here: keep them out of the water
  for (let i = 0; i < 40 && inWater(x, z, 3); i++) { const a = i * 2.4; x += Math.cos(a) * 6; z += Math.sin(a) * 6; }
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
  if (lm.req) { const [r, n] = lm.req; save.res[r] = Math.max(0, save.res[r] - n); }
  save.restored.push(lm.key);
  if (save.restored.length === 8) {
    for (const c of camps) if (c.balloon) c.balloon.visible = true;
    setTimeout(() => toast('A balloon waits at every camp now 🎈'), 2700);   // after the wake toast
  }
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
// six clear patches of grass fanned out in front of the fire, clear of the tent and props
const CAMP_PROPS = ['lantern', 'bench', 'cairn'];
const CAMP_SLOTS = [[-2.6, 4.9], [2.6, 4.9], [-4.2, 3.7], [4.2, 3.7], [-4.5, 6.1], [4.5, 6.1]];
function addCampProp(c, kind, slot) {
  const [sx0, sz0] = CAMP_SLOTS[slot];
  const g = new THREE.Group();
  if (kind === 'lantern') {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.5, 5), mat({ color: 0x6b4a2a }));
    post.position.y = 0.75;
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 0.28),
      new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffb45e, emissiveIntensity: 1.6 }));
    lamp.position.y = 1.62;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.18, 4), mat({ color: 0x6b4a2a }));
    cap.position.y = 1.86;
    g.add(post, lamp, cap);
  } else if (kind === 'bench') {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.55), mat({ color: 0xc08b57 }));
    plank.position.y = 0.45;
    g.add(plank);
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.45, 0.5), mat({ color: 0x8d6238 }));
      leg.position.set(sx * 0.6, 0.22, 0);
      g.add(leg);
    }
  } else {
    [[0.42, 0.2], [0.3, 0.48], [0.19, 0.7]].forEach(([rr, y]) => {
      const st = new THREE.Mesh(new THREE.DodecahedronGeometry(rr, 0), mat({ color: 0x8d8478 }));
      st.position.y = y;
      st.scale.y = 0.75;
      g.add(st);
    });
  }
  g.position.set(sx0, 0, sz0);
  g.rotation.y = Math.atan2(-sx0, 4 - sz0);   // turned to face the fire
  c.g.add(g);
  return g;
}
function addBirdhouse(c) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.7, 5), mat({ color: 0x8d6238 }));
  post.position.y = 0.85;
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.38, 0.36), mat({ color: 0xd9a86a }));
  box.position.y = 1.86;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.26, 4), mat({ color: 0x8a4b3a }));
  roof.position.y = 2.16; roof.rotation.y = Math.PI / 4;
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.075, 10), new THREE.MeshBasicMaterial({ color: 0x1a1020 }));
  hole.position.set(0, 1.88, 0.185);
  g.add(post, box, roof, hole);
  // three little birds on the roof, only up at dawn
  const birds = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), mat({ color: i ? 0x6b7a92 : 0xc9705a }));
    b.position.set((i - 1) * 0.15, 2.3, i === 1 ? -0.05 : 0.07);
    b.scale.set(0.9, 1, 1.3);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.07, 4), mat({ color: 0xe8b44a }));
    beak.position.set(0, 0, 0.08); beak.rotation.x = Math.PI / 2;
    b.add(beak);
    birds.add(b);
  }
  g.add(birds);
  g.position.set(-5.4, 0, 5.9);
  g.rotation.y = Math.atan2(-g.position.x, 5.9);
  c.g.add(g);
  return birds;
}
function buildBirdhouse(c) {
  const camp = save.camps[c.i];
  if (!camp || camp.bird) { toast('There is already a birdhouse here.'); return; }
  if (save.res.wood < 4 || save.res.bloom < 2) { toast('A birdhouse needs 4 Wood and 2 Bloom.'); return; }
  save.res.wood -= 4; save.res.bloom -= 2;
  camp.bird = true;
  c.bird = addBirdhouse(c);
  hud(); persist(); sfx.gather(1);
  toast('A birdhouse stands by the camp 🐦');
}
const PROP_COST = { lantern: [['wood', 3], ['spark', 1]], bench: [['wood', 5]], cairn: [['stone', 6]] };
function decorateCamp(c) {
  const camp = save.camps[c.i];
  if (!camp) return;
  const props = camp.props || (camp.props = []);
  if (props.length >= 6) { toast('This camp is full of nice things.'); return; }
  const kind = CAMP_PROPS[props.length % 3];
  const cost = PROP_COST[kind];
  for (const [r2, n] of cost) {
    if (save.res[r2] < n) { toast(`A ${kind} needs ${cost.map(([q, m]) => `${m} ${LABEL[q]}`).join(' + ')}.`); return; }
  }
  for (const [r2, n] of cost) save.res[r2] -= n;
  props.push(kind);
  addCampProp(c, kind, props.length - 1);
  hud(); persist(); sfx.gather(1);
  toast(`Placed a ${kind} by the fire.`);
}
function packCamp(c) {
  const i = camps.indexOf(c);
  if (i < 0) return;
  if (giftMesh && giftMesh.position.distanceTo(c.g.position) < 4) { scene.remove(giftMesh); giftMesh = null; }
  burst(c.g.position.clone().setY(0.5), 0xd9cbb0, 20, 2.2);
  scene.remove(c.g);
  c.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  camps.splice(i, 1);
  save.camps.splice(i, 1);
  camps.forEach((k, j) => { k.i = j; });
  persist();
  toast('Camp packed. Nothing left but a flat patch of grass.');
  sfx.gather(1);
  rebuild();
}
function makeCamp(x, z, i = 0) {
  // one layout, built on purpose: tent at the back, fire ring in front of it,
  // seats beside the fire, and the smaller things placed around the outside.
  const g = new THREE.Group();
  const tent = new THREE.Mesh(new THREE.ConeGeometry(1.75, 2.25, 4), mat({ color: 0xd98cb0 }));
  tent.position.y = 1.125; tent.rotation.y = Math.PI / 4; tent.castShadow = true;
  const door = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.86, 3), new THREE.MeshBasicMaterial({ color: 0x2a1730 }));
  door.position.set(0, 0.43, 0.8); door.rotation.y = Math.PI / 4;

  // fire ring, a little way out from the door
  const FX = 0, FZ = 4.0;
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
    log.position.set(FX + sx * 1.95, 0.13, FZ);
    log.rotation.z = Math.PI / 2; log.rotation.y = sx * 0.12;
    g.add(log);
  }

  // flag, on the open side
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 5), mat({ color: 0xb9a27a }));
  pole.position.set(-2.85, 1.3, 2.1);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.48), new THREE.MeshBasicMaterial({ color: 0xf7d6ff, side: THREE.DoubleSide }));
  flag.position.set(-2.4, 2.28, 2.1);

  // chimes hang from an arm on a post, not from thin air
  const cpost = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.95, 5), mat({ color: 0xb9a27a }));
  cpost.position.set(3.15, 0.97, 0.6);
  g.add(cpost);
  const carm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.95, 5), mat({ color: 0xb9a27a }));
  carm.position.set(2.7, 1.92, 0.6);
  carm.rotation.z = Math.PI / 2;
  g.add(carm);
  for (let k = 0; k < 4; k++) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.34 + k * 0.05, 5), mat({ color: 0xd9c48a }));
    tube.position.set(2.38 + k * 0.22, 1.62 - k * 0.03, 0.6);
    g.add(tube);
  }

  // shelf against the tent, one shell for every gift Fluffy has left
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.07, 0.3), mat({ color: 0xb08a5c }));
  shelf.position.set(2.05, 0.62, 1.65);
  shelf.rotation.y = -0.55;
  g.add(shelf);
  for (const sgn of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.62, 0.09), mat({ color: 0x9a7549 }));
    leg.position.set(2.05 + sgn * 0.52 * Math.cos(-0.55), 0.31, 1.65 - sgn * 0.52 * Math.sin(-0.55));
    g.add(leg);
  }
  for (let k = 0; k < Math.min(8, save.gifts || 0); k++) {
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), mat({ color: 0xf2d7c0 }));
    sh.scale.set(1.2, 0.6, 1);
    sh.position.set(2.05 + (k - 1.75) * 0.15 * Math.cos(0.55), 0.69, 1.65 + (k - 1.75) * 0.15 * Math.sin(0.55));
    g.add(sh);
  }

  // mailbox by the path
  const mailbox = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.3, 0.55), mat({ color: 0x6f8fd1 }));
  mailbox.position.set(-3.25, 0.85, 0.35);
  mailbox.rotation.y = 0.4;
  const mpost = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 5), mat({ color: 0x8a7a52 }));
  mpost.position.set(-3.25, 0.35, 0.35);
  g.add(tent, door, fire, light, pole, flag, mailbox, mpost);

  // memory wall, turned to face the fire
  if (save.postcards.length) {
    const wx = 3.45, wz = -2.45, wy = 0.6;
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
  {
    balloon = new THREE.Group();
    balloon.position.set(4.9, 0, 3.6);
    balloon.visible = save.restored.length >= 8;
    dressBalloon(balloon);
    g.add(balloon);
  }
  g.position.set(x, 0, z);
  scene.add(g);
  const saved = (save.camps[i] && save.camps[i].props) || [];
  saved.forEach((k, j) => addCampProp({ g }, k, j));
  const bird = (save.camps[i] && save.camps[i].bird) ? addBirdhouse({ g }) : null;
  camps.push({ g, fire, light, i, flag, balloon, x, z, bird });
}
save.camps.forEach((c, i) => makeCamp(c.x, c.z, i));

$('#camp').onclick = () => {
  if (inCave) { toast('Camps want open sky — step outside.'); return; }
  if (save.camps.length >= 5) { toast('Five camps is plenty.'); return; }
  const np = nearestPond();
  if (inBoat || (np && np.d < 4)) { toast('Not in the water — find a dry spot.'); return; }
  const c = { x: Math.round(player.position.x), z: Math.round(player.position.z) };
  save.camps.push(c); persist(); makeCamp(c.x, c.z, save.camps.length - 1); rebuild();
  // the tent goes up where she is standing, so step her out of it straight away
  [player.position.x, player.position.z] = pushOut(player.position.x, player.position.z);
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
// three uniforms the sky already knows: the dome's two colours, whichever disc
// is up, and its highlight colour. The water only mirrors them.
const waterU = {
  t: { value: 0 },
  top: { value: new THREE.Color(0x0a1430) },
  bot: { value: new THREE.Color(0x9fc6e8) },
  sun: { value: new THREE.Vector3(0, 1, 0) },
  glint: { value: new THREE.Color(0xfff0c4) },
  foam: { value: new THREE.Color(0xeaf7ff) },
};
const cSunGlint = new THREE.Color(0xfff0c4), cMoonGlint = new THREE.Color(0xb9cdff);
const cFoamDay = new THREE.Color(0xeaf7ff);
for (const m of [waterMat, streamMat]) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uT = waterU.t;
    sh.uniforms.uSkyTop = waterU.top;
    sh.uniforms.uSkyBot = waterU.bot;
    sh.uniforms.uSun = waterU.sun;
    sh.uniforms.uGlint = waterU.glint;
    sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;'
    );
    sh.fragmentShader = 'uniform float uT; uniform vec3 uSkyTop, uSkyBot, uSun, uGlint; varying vec3 vWP;\n' + sh.fragmentShader
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         float rp = sin(vWP.x * 4.6 + uT * 1.3) * sin(vWP.z * 3.9 - uT * 1.1);
         diffuseColor.rgb *= 1.0 + rp * 0.07;
         diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.96, 1.0), smoothstep(0.72, 0.99, rp) * 0.12);`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
         // two octaves of chop: the big swell plus a finer one, or the glint
         // spreads into one soft blur instead of breaking into sparkles
         float rx = sin(vWP.x * 1.7 + uT * 1.3) * cos(vWP.z * 1.4 - uT * 0.9)
                  + sin(vWP.x * 7.3 - uT * 2.2) * cos(vWP.z * 6.1 + uT * 1.9) * 0.5;
         float rz = sin(vWP.z * 2.3 - uT * 1.6) * cos(vWP.x * 1.2 + uT * 0.7)
                  + sin(vWP.z * 6.7 + uT * 2.4) * cos(vWP.x * 5.9 - uT * 1.7) * 0.5;
         normal = normalize(normal + vec3(rx, 0.0, rz) * 0.17);`
      )
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
         vec3 Vw = normalize(cameraPosition - vWP);
         vec3 Nw = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
         // mirror the dome's own gradient: bright at the horizon, dark overhead
         vec3 Rd = reflect(-Vw, Nw);
         vec3 skyR = mix(uSkyBot, uSkyTop, smoothstep(0.0, 0.75, max(Rd.y, 0.0)));
         float fres = pow(1.0 - clamp(dot(Nw, Vw), 0.0, 1.0), 3.0);
         gl_FragColor.rgb = mix(gl_FragColor.rgb, skyR, 0.10 + fres * 0.60);
         // one tight Blinn highlight; the wobbled normal smears it into a track
         vec3 Hv = normalize(uSun + Vw);
         float gd = max(dot(Nw, Hv), 0.0);
         gl_FragColor.rgb += uGlint * (pow(gd, 260.0) * 2.2 + pow(gd, 60.0) * 0.35 + pow(gd, 20.0) * 0.05);`
      );
  };
  m.needsUpdate = true;
}
const foamMat = new THREE.MeshBasicMaterial({ color: 0xeaf7ff, transparent: true, opacity: 0.5, depthWrite: false });
// shore foam: a thin ring on the rim, its alpha broken up by a slow wave running
// around the circumference, so the water stops ending on a cut-out edge
const foamRingMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { uT: waterU.t, uTint: waterU.foam },
  vertexShader: 'varying vec2 p; void main(){ p = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform float uT; uniform vec3 uTint; varying vec2 p;
    void main() {
      float a = atan(p.y, p.x);
      float edge = smoothstep(0.935, 1.0, length(p));
      float brk = 0.5 + 0.35 * sin(a * 9.0 + uT * 1.3) * sin(a * 3.0 - uT * 0.6) + 0.15 * sin(a * 23.0 - uT * 2.1);
      gl_FragColor = vec4(uTint, edge * (0.28 + 0.62 * smoothstep(0.05, 0.85, brk)));
    }`,
});

function pondFor(rx, rz) {
  const rnd = mulberry(hash2(rx, rz, save.seed + 991));
  if (rnd() > 0.5) return null;
  const s = spot(rx, rz);
  const r = 20 + rnd() * 12;
  // set the lake clear of the stone instead of rejecting the region
  // sometimes far enough that the lake spills over the boundary
  const ang = rnd() * Math.PI * 2, dist = rnd() < 0.35 ? r + 34 + rnd() * 26 : r + 8 + rnd() * 16;
  const [x, z] = warp(s.x + Math.cos(ang) * dist, s.z + Math.sin(ang) * dist);
  // a pond is flat water. Bowled over a hill it is a slope the deer run up, the
  // boat sails through and she cannot reach -- so the water gives way, not the hill
  if (inHill(x, z, r * 0.85)) return null;
  // three flavours, never both crossings: some get the deck, some the pier and
  // the boat, some neither and you walk round
  const roll = rnd();
  const kind = roll < 0.42 ? 'bridge' : roll < 0.71 ? 'boat' : 'none';
  return { x, z, r, arch: 1.3 + r * 0.035, axis: rnd() < 0.5 ? 0 : 1, kind, wet: rnd() < 0.68, key: `${rx},${rz}` };
}

// where the pond drains: away from its stone, but never down the line of the
// bridge, or the planks land in running water at both ends
function streamDir(pd) {
  const s = spot(Math.floor(pd.x / R), Math.floor(pd.z / R));
  let ux = pd.x - s.x, uz = pd.z - s.z;
  const l = Math.hypot(ux, uz) || 1;
  ux /= l; uz /= l;
  const bx = pd.axis ? 0 : 1, bz = pd.axis ? 1 : 0;
  if (Math.abs(ux * bx + uz * bz) > 0.35) {
    // too close to the deck line: snap it square, keeping the same side
    const sgn = Math.sign(ux * -bz + uz * bx) || 1;
    ux = -bz * sgn; uz = bx * sgn;
  }
  return [ux, uz];
}

// where the stream's run ends: short of the next pond, or short of the giant
function streamB0(pd, ux, uz) {
  // 18-46 m, fixed per pond: an even 46 everywhere made every roadside the same
  let b0 = pd.r + 18 + (hash2(pd.x, pd.z, 7) / 4294967296) * 28;
  for (const o of ponds.values()) {
    if (o === pd) continue;
    const rx = o.x - pd.x, rz = o.z - pd.z;
    const along = rx * ux + rz * uz, across = Math.abs(-rx * uz + rz * ux);
    if (along > 4 && across < o.r + 4) b0 = Math.min(b0, along - o.r - 4);
  }
  if (giant) {
    const rx = giant.x - pd.x, rz = giant.z - pd.z;
    if (rx * ux + rz * uz > 4 && Math.abs(-rx * uz + rz * ux) < 10) b0 = Math.min(b0, rx * ux + rz * uz - 10);
  }
  return b0;
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
  // unit ring, scaled to the pond: one geometry and one material for all of them
  const foam = new THREE.Mesh(new THREE.RingGeometry(0.93, 1.0, 40), foamRingMat);
  foam.rotation.x = -Math.PI / 2;
  foam.position.y = 0.078;
  foam.scale.setScalar(pd.r);
  g.add(shore, water, foam);
  pd.foam = foam;

  for (let i = 0; i < 5; i++) {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.55 + Math.random() * 0.4, 0.55, 0.05, 7), mat({ color: 0x4f9450 }));
    const a = Math.random() * Math.PI * 2, rr = pd.r * (0.3 + Math.random() * 0.55);
    pad.position.set(Math.cos(a) * rr, 0.11, Math.sin(a) * rr);
    g.add(pad);
  }

  // the deck arches: 0.5 at each bank, arch above that at the crown
  const A = pd.arch || 2, half = pd.r + 3, deck = (x) => 0.5 + A * (1 - (x / half) ** 2);
  if (pd.kind === 'bridge') {
  // the deck runs past the arch until it reaches the ground: solve deck(xEnd) = 0
  const xEnd = half * Math.sqrt(1 + 0.5 / A);
  for (let i = -Math.ceil(xEnd / 1.1); i <= Math.ceil(xEnd / 1.1); i++) {
    const x = i * 1.1;
    if (Math.abs(x) > xEnd) continue;
    const plank = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.14, 2.4), plankMat);
    plank.position.set(x, deck(x), 0);
    plank.rotation.z = (-2 * A * x) / (half * half);
    plank.castShadow = true;
    g.add(plank);
  }
  for (const sz of [-1.15, 1.15]) {
    let prev = null;
    for (let i = -Math.ceil(xEnd / 3); i <= Math.ceil(xEnd / 3); i++) {
      const x = i * 3, y = deck(x);
      if (Math.abs(x) > xEnd) { prev = null; continue; }
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
    let blocked = false;
    if (fresh) {
      // one lake, one bridge: never spawn a pond inside another one's shore
      if ([...ponds.values()].some((o) => Math.hypot(o.x - fresh.x, o.z - fresh.z) < o.r + fresh.r + 2)) blocked = true;
      // never over the giant's lap: a pond can stream in after he is already placed
      else if (giant && Math.hypot(giant.x - fresh.x, giant.z - fresh.z) < fresh.r + 9) blocked = true;
      // nor across another pond's stream
      else if ([...ponds.values()].some((o) => {
        const s = o.stream;
        if (!s) return false;
        const rx = fresh.x - s.x, rz = fresh.z - s.z;
        const t = Math.max(s.a - 8, Math.min(s.b + 8, rx * s.dx + rz * s.dz));
        return Math.hypot(rx - s.dx * t, rz - s.dz * t) < fresh.r + 3;
      })) blocked = true;
      // nor over a sleeping stone that is already standing
      else for (const lm of landmarks.values()) if (Math.hypot(lm.x - fresh.x, lm.z - fresh.z) < fresh.r + 4) { blocked = true; break; }
    }
    if (blocked) pondSkip.add(k);
    else if (fresh) {
      ponds.set(k, makePond(fresh));
      // a pond can load over a stone that was already standing there: put it on the bank
      for (const lm of landmarks.values()) {
        if (!inWater(lm.x, lm.z, 2)) continue;
        const a = Math.atan2(lm.z - fresh.z, lm.x - fresh.x);
        lm.x = fresh.x + Math.cos(a) * (fresh.r * 1.08 + 4);
        lm.z = fresh.z + Math.sin(a) * (fresh.r * 1.08 + 4);
        lm.group.position.set(lm.x, 0, lm.z);
      }
      return true;
    }
  }
  return false;
}

// one truth for "how high is the floor here" - player, cat, shadows and foot IK
function groundAt(x, z) {
  if (inCave) return caveGround(x, z);
  // highest surface wins, and nothing breaks early: a stone under a bridge used to
  // win the loop before the deck was looked at, and she dropped onto it mid-plank
  let y = 0;
  for (const pd of ponds.values()) y = Math.max(y, onBridge(pd, x, z));
  if (onDock(x, z)) y = Math.max(y, DOCK_Y);
  if (onStones(x, z)) y = Math.max(y, 0.3);
  return Math.max(y, hillAt(x, z));
}
const onBridge = (pd, x, z) => {
  if (pd.kind !== 'bridge') return 0;
  const dx = x - pd.x, dz = z - pd.z;
  const along = pd.axis ? dz : dx;
  const across = pd.axis ? dx : dz;
  const half = pd.r + 3;
  if (Math.abs(across) >= 1.2 || Math.abs(along) >= half) return 0;
  return 0.5 + (pd.arch || 2) * (1 - (along / half) ** 2);
};
const inWater = (x, z, pad = 0) => {
  for (const pd of ponds.values()) {
    // no deck exemption: it is where feet can stand, not dry land, and exempting
    // it planted trees and rocks right on the bridge over the water
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

const RSTEPS = [0.5, 1, 1.7];                       // rock tiers: slab, boulder, big boulder
const rockStep = (tone) => RSTEPS[tone < 0.45 ? 0 : tone < 0.8 ? 1 : 2];
const SOLID = { tree: 0.40, rock: 0.78, bush: 0.62, crystal: 0.38 };
const PR = 0.26;

function pushOut(x, z) {
  if (inCave && caveRoom) {
    const BODY = 0.42;  // her half-width: stop at the rock face, not inside it
    let px = x, pz = z;
    // an open door is walkable even where it lands in the neck between two rooms.
    // the snap below used to fire first and park her on the hall's edge every step,
    // so any room that does not overlap the hall (den/summit/gallery east, 0.7-2.6 m
    // necks) could be opened and still never entered
    const doorGap = caveRoom.doors.some((d) => d.open && (d.axis === 'z'
      ? Math.abs(px - d.x) < d.hw + 1.0 && Math.abs(pz - d.z) < 6
      : Math.abs(pz - d.z) < d.hw + 1.0 && Math.abs(px - d.x) < 6));
    if (!doorGap && !CAVE_ROOMS.some((r) => inRoom(r, px, pz, -BODY))) {
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
      // the corridor has to reach past the room wall, not stop at the plug:
      // the neck is metres deep, so a window around the door traps her inside it
      const through = caveRoom.doors.some((d) => d.open && (
        d.axis === 'z'
          ? Math.abs(px - d.x) < d.hw + 1.0 && Math.abs(pz - d.z) < 6
          : Math.abs(pz - d.z) < d.hw + 1.0 && Math.abs(px - d.x) < 6))
        // a neck can be longer than the door window: if the far end is a room,
        // she is through, not stuck in the corridor
        || CAVE_ROOMS.some((r) => inRoom(r, px, pz, -BODY));
      if (!through) return [from.x, from.z];   // the rock wall holds
    }
    for (const d of caveRoom.doors) {
      if (d.open) continue;
      const push = d.hw + 0.8;
      if (d.axis === 'z') {
        if (Math.abs(px - d.x) < d.hl && Math.abs(pz - d.z) < push) pz = d.z + Math.sign(pz - d.z || 1) * push;
      } else if (Math.abs(pz - d.z) < d.hl && Math.abs(px - d.x) < push) px = d.x + Math.sign(px - d.x || 1) * push;
    }
    // stops her at the rock face, same rule the sleeping stones use outside.
    // several passes, because pushing out of one boulder can push her into its
    // neighbour and one pass would leave her standing inside the second.
    const sds = caveRoom.solids || [];
    for (let it = 0; it < 6; it++) for (const rk of sds) {
      const rr = rk.r + 0.34;
      const dx = px - rk.x, dz = pz - rk.z, d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        px = rk.x + (dx / d) * rr; pz = rk.z + (dz / d) * rr;
      }
    }
    const L = caveRoom.lake, dx = px - L.x, dz = pz - L.z, ld = Math.hypot(dx, dz);
    if (ld < L.r + 0.3 && ld > 1e-4) { px = L.x + (dx / ld) * (L.r + 0.3); pz = L.z + (dz / ld) * (L.r + 0.3); }
    const P = caveRoom.pond;   // not every cave kind has the spring
    if (P) {
      const pdx = px - P.x, pdz = pz - P.z, pd2 = Math.hypot(pdx, pdz);
      if (pd2 < P.r + 0.3 && pd2 > 1e-4) { px = P.x + (pdx / pd2) * (P.r + 0.3); pz = P.z + (pdz / pd2) * (P.r + 0.3); }
    }
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
    // the opening is the stop line: she reaches the threshold, never the alcove
    if (Math.abs(px - c.x) < 3.2 && pz < c.z + 4.6 && pz > c.z - 1) pz = c.z + 4.6;
  }
  const near = (nx, nz) => Math.abs(nx - px) < 2 && Math.abs(nz - pz) < 2;
  for (const c of chunks.values()) {
    if (Math.abs(c.cx * CH - px) > CH * 1.4 || Math.abs(c.cz * CH - pz) > CH * 1.4) continue;
    for (const n of c.nodes) {
      const r = n.type === 'rock' ? SOLID.rock * rockStep(n.tone) : SOLID[n.type];
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
    if (d2 < rr * rr) {
      // dead centre has no direction to push along: a tent built where she is
      // standing must still put her down outside it
      if (d2 < 1e-6) { px = ox + rr; pz = oz; return; }
      const d = Math.sqrt(d2);
      px = ox + (dx / d) * rr;
      pz = oz + (dz / d) * rr;
    }
  };
  // the rails are solid: the deck holds you in sideways, only its two ends let
  // you off.  Applies to whoever is standing on it (Emma and Fluffy both walk
  // through here), and never to the boat, which returns further up.
  {
    const from = arguments[2] || player.position;
    for (const pd of ponds.values()) {
      if (!onBridge(pd, from.x, from.z)) continue;
      const dx = px - pd.x, dz = pz - pd.z;
      // only over open water: on the ramps at either end she can step off freely
      if (Math.hypot(dx, dz) >= pd.r) continue;
      const across = pd.axis ? dx : dz;
      if (Math.abs(across) < 1.05) continue;
      if (pd.axis) px = pd.x + Math.sign(across) * 1.05;
      else pz = pd.z + Math.sign(across) * 1.05;
    }
  }
  // the pier has rails too: the deck holds her in sideways and stops her at the
  // water end. Without this, stepping past the end dropped onDock and handed her
  // to the pond push-out, which fired her back up the boards to the shore
  {
    const from = arguments[2] || player.position;
    for (const pd of ponds.values()) {
      const d = pd.dock;
      if (!d) continue;
      const fx = from.x - d.x, fz = from.z - d.z;
      if (Math.abs(fx * d.nx + fz * d.nz) >= 1.3) continue;    // not over this deck
      const fa = fx * d.dx + fz * d.dz;
      if (fa <= d.a || fa >= d.b) continue;
      const ax = px - d.x, az = pz - d.z;
      const along = ax * d.dx + az * d.dz;
      if (along > d.b) continue;                     // back ashore: free to walk off
      const across = ax * d.nx + az * d.nz;
      const A = clamp(along, d.a + 0.2, d.b), C = clamp(across, -1.05, 1.05);
      if (A === along && C === across) continue;
      px = d.x + d.dx * A + d.nx * C;
      pz = d.z + d.dz * A + d.nz * C;
    }
  }
  // the boulders at the head of every stream are stone, not scenery: she used to
  // walk straight through the heap and stand inside the water
  for (const pd of ponds.values()) for (const r of pd.fallRocks || []) disc(r.x, r.z, r.r + PR);
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
  // camps: the tent sits on the group origin — its square base is 1.24 wide, so
  // the bubble is that plus her body, or she walks through the canvas
  for (const c of camps) {
    disc(c.g.position.x, c.g.position.z, 1.24 + PR);
    // the balloon parked beside the camp: the envelope is wide and hangs low
    // enough that she could walk into it. basketAt(c) is defined further down,
    // so the offset is spelled out here rather than hitting its TDZ at init.
    if (c.balloon && c.balloon.visible) disc(c.x + 4.9, c.z + 3.6, 1.3 + PR);
  }
  return [px, pz];
}

// ---------------------------------------------------------------- map
const mapEl = $('#map'), mctx = mapEl.getContext('2d');
const bigEl = $('#bigmap'), bigCanvas = $('#bigmapc'), bigCtx = bigCanvas.getContext('2d');
let bigOpen = false, objList = [], objId = save.obj || null;
let bigRange = 420;              // metres across the big map; pinch changes it

function youMarker(ctx, C, big) {
  const a = mapYaw, pt = (ang, r) => [C + Math.sin(ang) * r, C + Math.cos(ang) * r];
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

// a chevron pinned to the rim, pointing at something too far away to draw
function rimArrow(ctx, C, dx, dz, fill) {
  const a = Math.atan2(dz - C, dx - C), r = C - 10;
  ctx.save(); ctx.translate(C + Math.cos(a) * r, C + Math.sin(a) * r); ctx.rotate(a);
  ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-5, 6); ctx.lineTo(-5, -6); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = 'rgba(30,22,50,.85)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
}

// one painter, two sizes: the minimap and the big map are the same drawing
function paintMap(ctx, S, RANGE, big = false) {
  if (inCave && caveRoom) return paintCave(ctx, S, big);
  const C = S / 2, px = player.position.x, pz = player.position.z;
  ctx.clearRect(0, 0, S, S);
  // the arrow keeps its old size and stays centred on C, so its nose is n px
  // ahead of C. shift the projection by that many metres instead: the nose is
  // then her real position, and the arrow still turns about its own centre.
  const nose = (big ? 16 : 11) * (RANGE / C), ha = mapYaw;
  const ox = Math.sin(ha) * nose, oz = Math.cos(ha) * nose;
  const at = (x, z) => [C + ((x - px + ox) / RANGE) * C, C + ((z - pz + oz) / RANGE) * C];
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
  const labels = [];
  for (const c of caves.values()) {
    dot(c.x, c.z, 'rgba(177,140,232,.85)', big ? 5 : 3, 'rgba(230,215,255,.7)');
    if (big) {
      const [dx, dz] = at(c.x, c.z);
      if (Math.hypot(dx - C, dz - C) < C - 30) {
        // one name per spot: overlapping labels turned into a smudge
        const nm = save.caves.includes(c.key) ? caveName(c) : '? ? ?';
        ctx.font = '600 19px ui-rounded, system-ui, sans-serif';
        const w = ctx.measureText(nm).width;
        if (labels.some((l) => Math.abs(l[0] - dx) < (w + l[2]) * 0.5 + 4 && Math.abs(l[1] - dz) < 22)) continue;
        labels.push([dx, dz, w]);
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(20,14,36,.9)'; ctx.lineWidth = 3;
        ctx.strokeText(nm, dx, dz - 10);
        ctx.fillStyle = '#e9dcff'; ctx.fillText(nm, dx, dz - 10);
      }
    }
  }
  for (const f of friends.values()) dot(f.g.position.x, f.g.position.z, '#ffd76e', big ? 5 : 3);
  for (const c of camps) {
    const [dx, dz] = at(c.x, c.z);
    if (Math.hypot(dx - C, dz - C) > C - 8) { if (big) rimArrow(ctx, C, dx, dz, '#ffa860'); continue; }
    dot(c.x, c.z, '#ffa860', big ? 5 : 3, 'rgba(255,222,180,.85)');
    if (big) {
      const nm = campName(c);
      ctx.font = '700 19px ui-rounded, system-ui, sans-serif';
      const w = ctx.measureText(nm).width;
      if (labels.some((l) => Math.abs(l[0] - dx) < (w + l[2]) * 0.5 + 4 && Math.abs(l[1] - dz) < 22)) continue;
      labels.push([dx, dz, w]);
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(20,14,36,.9)'; ctx.lineWidth = 3;
      ctx.strokeText(nm, dx, dz - 10);
      ctx.fillStyle = '#ffd9b0'; ctx.fillText(nm, dx, dz - 10);
    }
  }

  // the chosen objective, wherever it is
  const o = objList.find((q) => q.id === objId);
  if (o && !inCave) {
    const [dx, dz] = at(o.x, o.z);
    const off = Math.hypot(dx - C, dz - C) > C - 8;
    if (off) {
      // off the map: a chevron on the rim pointing at it
      rimArrow(ctx, C, dx, dz, '#ff9ed2');
    } else {
      ctx.save(); ctx.translate(dx, dz); ctx.rotate(Math.PI / 4);
      const r = big ? 9 : 6;
      ctx.fillStyle = o.ready ? '#a8ffcf' : '#ff9ed2';
      ctx.strokeStyle = 'rgba(30,22,50,.9)'; ctx.lineWidth = 2;
      ctx.fillRect(-r / 1.4, -r / 1.4, r * 1.4, r * 1.4); ctx.strokeRect(-r / 1.4, -r / 1.4, r * 1.4, r * 1.4);
      ctx.restore();
      if (big) {
        const ang = Math.atan2(dz - C, dx - C);
        const lx = dx + Math.cos(ang) * 44, ly = dz + Math.sin(ang) * 44 + 6;
        ctx.font = `700 ${big ? 26 : 12}px ui-rounded, system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
        ctx.strokeStyle = 'rgba(20,14,36,.95)'; ctx.lineWidth = 4;
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
    if (r === caveRoom.vault) continue;   // it is a secret: no outline, no ledge, no door
    const [x, z] = P(r.x, r.z);
    ctx.beginPath(); ctx.ellipse(x, z, r.rx * k, r.rz * k, 0, 0, 7);
    ctx.fillStyle = 'rgba(38,30,60,.92)'; ctx.fill();
    ctx.strokeStyle = 'rgba(177,140,232,.30)'; ctx.lineWidth = big ? 2 : 1.4; ctx.stroke();
  }
  const L = caveRoom.lake, [lx, lz] = P(L.x, L.z);
  ctx.beginPath(); ctx.arc(lx, lz, L.r * k, 0, 7);
  ctx.fillStyle = 'rgba(78,148,198,.72)'; ctx.fill();
  if (caveRoom.stair) {
    // the way down, drawn as the ramp it is
    const [sx, sz] = P(0, STAIR.z1), [ex, ez] = P(0, STAIR.z0);
    ctx.strokeStyle = 'rgba(200,180,255,.55)'; ctx.lineWidth = big ? 3 : 2;
    ctx.beginPath(); ctx.moveTo(sx, sz); ctx.lineTo(ex, ez); ctx.stroke();
  }
  for (const d of caveRoom.doors) {
    if (!d.open && d.room === caveRoom.vault) continue;   // found it first, then it shows
    const [x, z] = P(d.x, d.z);
    ctx.beginPath();
    if (d.axis === 'x') ctx.rect(x - 1.5, z - d.hl * k, 3, d.hl * 2 * k);
    else ctx.rect(x - d.hl * k, z - 1.5, d.hl * 2 * k, 3);
    ctx.fillStyle = d.open ? 'rgba(196,170,255,.35)' : '#e6be78';
    ctx.fill();
  }
  for (const d of caveRoom.doors) {
    if (!d.open) continue;
    const [dx2, dz2] = P(d.x, d.z);
    ctx.beginPath(); ctx.arc(dx2, dz2, big ? 7 : 4.5, 0, 7);
    ctx.fillStyle = '#d6bbff'; ctx.fill();
    ctx.strokeStyle = 'rgba(30,22,50,.85)'; ctx.lineWidth = 2; ctx.stroke();
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
  bigRange = 420;
  bigEl.hidden = false;
  const s = Math.min(innerWidth * 0.8, innerHeight * 0.72);
  bigCanvas.width = bigCanvas.height = Math.round(s * Math.min(devicePixelRatio || 1, 2));
  renderBig();
}
function closeBig() { bigOpen = false; bigEl.hidden = true; }
function renderBig() {
  paintMap(bigCtx, bigCanvas.width, bigRange, true);
  const wrap = $('#bigchips');
  wrap.innerHTML = objList.map((o) => `<button data-o="${o.id}" class="${o.id === objId ? 'on' : ''}">${o.label}</button>`).join('');
  for (const b of wrap.children) b.onclick = () => { objId = save.obj = b.dataset.o; persist(); updateObjective(); renderBig(); };
}
mapEl.onclick = () => (bigOpen ? closeBig() : openBig());

// pinch to zoom the big map: two fingers, or a wheel on a desktop
{
  const pts = new Map();
  let d0 = 0, r0 = 420;
  const spread = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  const clampR = (v) => Math.max(90, Math.min(900, v));
  bigCanvas.addEventListener('pointerdown', (e) => {
    try { bigCanvas.setPointerCapture(e.pointerId); } catch { /* synthetic or stale pointer */ }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { d0 = spread(); r0 = bigRange; }
  });
  bigCanvas.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && d0 > 12) { bigRange = clampR(r0 * d0 / spread()); renderBig(); }
  });
  const lift = (e) => { pts.delete(e.pointerId); if (pts.size < 2) d0 = 0; };
  bigCanvas.addEventListener('pointerup', lift);
  bigCanvas.addEventListener('pointercancel', lift);
  bigCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    bigRange = clampR(bigRange * (1 + e.deltaY * 0.0015));
    renderBig();
  }, { passive: false });
}
bigEl.onclick = (e) => { if (e.target === bigEl) closeBig(); };
$('#bigclose').onclick = closeBig;
const cycleObjective = () => {
  if (objList.length < 2) return;
  const i = objList.findIndex((o) => o.id === objId);
  objId = save.obj = objList[(i + 1) % objList.length].id;
  persist(); updateObjective();
  if (bigOpen) renderBig();
};
$('#obj').onclick = cycleObjective;
$('#objsw').onclick = cycleObjective;

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
  const here = player.position;
  const items = camps
    .filter((c) => Math.hypot(c.x - here.x, c.z - here.z) > 8)   // no riding to where you stand
    .map((c) => ({ label: campName(c), fn: () => startRide(c) }));
  openMenu('Where to?', items.length ? items : [{ label: 'Nowhere yet', fn: () => {} }]);
}

// ---------------------------------------------------------------- balloon ride
const campName = (c) => save.names[`camp${c.i}`] || `Camp ${c.i + 1}`;
const basketAt = (c) => ({ x: c.x + 4.9, z: c.z + 3.6 });   // where makeCamp parks the balloon
let riding = null;

function startRide(to) {
  if (riding || !to || !to.balloon) return;
  const here = player.position;
  const from = camps.filter((c) => c.balloon).sort((a, b) =>
    Math.hypot(a.x - here.x, a.z - here.z) - Math.hypot(b.x - here.x, b.z - here.z))[0];
  riding = { t: 0, phase: 'up', from, to };
  promptEl.hidden = true; actEl.hidden = true; near = null;
  sfx.blip(300, 0.9, 'sine', 0.10);
}

// 2.5 s, three beats: rise, cut behind black, descend and step out
function rideTick(dt) {
  const r = riding;
  r.t += dt;
  const seat = (c, y) => {
    const b = basketAt(c);
    player.position.set(b.x, y + 0.65, b.z);
    fluffy.position.set(b.x + 0.85, y + 0.5, b.z);
  };
  if (r.phase === 'up') {
    const u = Math.min(1, r.t / 1.0), e = u * u * (3 - 2 * u);
    r.from.balloon.position.y = e * 20;
    seat(r.from, e * 20);
    player.rotation.y = Math.PI;
    if (u >= 1) { $('#fade').classList.add('on'); r.phase = 'cut'; r.t = 0; sfx.blip(760, 0.5, 'sine', 0.08); }
  } else if (r.phase === 'cut') {
    if (r.t >= 0.32) {                       // the overlay's own 0.3 s
      r.from.balloon.position.y = 0;
      r.to.balloon.position.y = 20;
      seat(r.to, 20);
      $('#fade').classList.remove('on');
      sfx.blip(520, 0.8, 'sine', 0.08);
      r.phase = 'down'; r.t = 0;
    }
  } else if (r.phase === 'down') {
    const u = Math.min(1, r.t / 0.95), e = u * u;
    r.to.balloon.position.y = 20 * (1 - e);
    seat(r.to, 20 * (1 - e));
    if (u >= 1) { r.phase = 'settle'; r.t = 0; }
  } else {
    const b = basketAt(r.to);
    r.to.balloon.position.y = 0;
    player.position.set(b.x + 1.6, 0, b.z - 1.5);
    fluffy.position.set(b.x + 2.4, 0, b.z - 1.1);
    toast(`Landing at ${campName(r.to)} 🎈`);
    sfx.chime();
    riding = null;
  }
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
// He has to read as both things at once: big enough to be a giant, and shaped
// like someone sitting down, or he is a boulder with a face on top.
let giant = null;
const GIANT_GREEN = 0x9fe6b8;
function ensureGiant() {
  if (giant) return;
  // a giant nobody can find is scenery: he sits a couple of chunks out, not five
  const s = spot(1, -1);
  // ponytail: deterministic drift rather than a spiral search — a pond that
  // streams in later is handled on the pond side, above
  for (let i = 0; i < 60 && inWater(s.x, s.z, 8); i++) { const a = i * 2.4; s.x += Math.cos(a) * 5; s.z += Math.sin(a) * 5; }
  const g = new THREE.Group();
  g.position.set(s.x, groundAt(s.x, s.z), s.z);   // feet on the actual ground, not on y=0
  scene.add(g);
  // the real thing: 7.7k tris, cross-legged, head bowed, eyes shut till he wakes
  giant = { g, x: s.x, z: s.z, n: save.giantN || 0, awake: !!save.giant,
            eyes: [], stone: [], lid: 0.06, blink: 0, bT: 6 };
  new GLTFLoader().load('/models/giant_lotus.glb', (m) => {
    m.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.frustumCulled = false;
      if (/^Eye/.test(o.name)) giant.eyes.push(o);
      const mm = o.material;
      if (mm && /Stone/.test(mm.name) && !giant.stone.includes(mm)) giant.stone.push(mm);
    });
    g.add(m.scene);
    if (giant.awake) for (const mm of giant.stone) mm.color.set(GIANT_GREEN);
  }, undefined, () => {});
}

// shut while he sleeps, open once he wakes, with a slow blink now and then
function giantTick(dt, t) {
  if (!giant) return;
  giant.g.scale.y = 1 + Math.sin(t * 0.7) * 0.01;   // breathing, asleep or not
  giant.bT -= dt;
  if (giant.awake && giant.bT <= 0) { giant.bT = 6 + Math.random() * 6; giant.blink = 0.6; }
  if (giant.blink > 0) giant.blink -= dt;
  const want = !giant.awake || giant.blink > 0 ? 0.06 : 1;
  // closes fast, opens slow: a tired giant, not a shutter
  giant.lid += (want - giant.lid) * Math.min(1, dt * (want > giant.lid ? 8 : 20));
  for (const e of giant.eyes) e.scale.y = 0.05 + giant.lid * 0.95;   // 0 = shut line
}

function giantAsk() {
  if (giant.awake) { toast('The giant is awake. He nods slowly.'); return; }
  const p = makeProblem(Math.min(5, 1 + giant.n), {}, Math.random);
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
const flies = mkPoints(35, 0.26, 0xd9ff9e, 0);
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
  const gs = giant || spot(3, -3);
  if (!save.giant) out.push({ id: 'giant', label: `Find the sleeping giant ${save.giantN || 0}/3`, x: gs.x, z: gs.z });
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
  const el = $('#obj'), sw = $('#objsw');
  if (!el) return;
  if (inCave) {
    if (sw) sw.hidden = true;
    const open = caveRoom ? caveRoom.doors.filter((d) => d.open).length : 0;
    el.innerHTML = `Crystals <b>${caveFound}/3</b> · doors <b>${open}/${caveRoom ? caveRoom.doors.length : 3}</b>`;
    return;
  }
  objList = objectives();
  if (!objId || !objList.some((o) => o.id === objId)) objId = objList[0].id;
  const o = objList.find((q) => q.id === objId) || objList[0];
  const d = Math.round(Math.hypot(o.x - player.position.x, o.z - player.position.z));
  el.innerHTML = `<b>${o.label}</b> · ${d}m${o.sub ? ` · ${o.sub}` : ''}`;
  if (sw) sw.hidden = objList.length < 2;
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
  if (!inCave && !lm.quiet) {
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
  $('#gh').textContent = lm.head || (lm.plain ? 'The door asks one question' : p.kind === 'word-sub'
    ? `The sleeping stone wants ${need} ${LABEL[res]}${need > 1 ? 's' : ''}`
    : p.kind === 'word-add' ? 'The stone counts with you' : 'The stone asks one question');
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
      if (save.mStreak >= 3) { save.mStreak = 0; save.mathLvl = Math.min(5, (save.mathLvl || 0) + 1); }
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
          giant.lid = 0.06; giant.bT = 1.6;   // eyes open, first slow blink soon
          for (const mm of giant.stone) mm.color.set(GIANT_GREEN);   // one skin, all of him
          hud(); checkBadges();
          logJournal('I woke the giant. He was very tired.');
          burst(new THREE.Vector3(giant.x, 5, giant.z), 0x9fe6b8, 60, 9);
          toast('The giant wakes. The ground remembers it 🌿');
          sfx.restore();
        } else {
          save.giantN = giant.n; persist();
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
// the question is the door: walking up to a cave asks it, no "step in" first
function caveGate(c) {
  openGate({ x: c.x, z: c.z, plain: true, quiet: true, head: 'The cave asks one question',
    onPass: () => { gateSeen.add('c' + c.key); enterCave(c); } });
}

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
      persist(); hud();
    }
  } else if (near.kind === 'pet') {
    petFluffy();
  } else if (near.kind === 'fish') {
    if (!fishing) startFish(); else if (fishing.phase === 'bite') { fishing.phase = 'reel'; fishing.t = 0; actEl.classList.remove('bite'); actEl.textContent = 'Wait…'; sfx.blip(700, 0.1, 'square', 0.15); }
  } else if (near.kind === 'skip') {
    if (mini) finishSkips(); else startSkips();
  } else if (near.kind === 'boat') {
    // near is refreshed every half second and re-read when the answer lands, so
    // the tap target has to be captured now or the boat is gone by then
    const pd = near.pd;
    const go = () => { enterBoat(pd); player.position.set(pd.boat.x, 0.5, pd.boat.z); };
    if (gateSeen.has('b' + pd.key)) go();
    else { gateSeen.add('b' + pd.key); openGate({ x: pd.x, z: pd.z, plain: true, quiet: true, head: 'The boat asks one question', onPass: go }); }
  } else if (near.kind === 'feed') {
    feedDeer(near.d);
  } else if (near.kind === 'exitboat') {
    leaveBoat();
  } else if (near.kind === 'camp') {
    const c = near.c;
    openMenu(save.names[`camp${c.i}`] || 'Camp', [
      { label: 'Decorate this camp', fn: () => decorateCamp(c) },
      ...(save.camps[c.i] && save.camps[c.i].bird ? [] : [{ label: 'Build a birdhouse', fn: () => buildBirdhouse(c) }]),
      { label: 'Pack up this camp', fn: () => packCamp(c) },
      { label: 'Name this camp', fn: () => nameIt('Name this camp', save.names[`camp${c.i}`], (v) => { save.names[`camp${c.i}`] = v; persist(); toast(v ? `This camp is called ${v}.` : 'Unnamed again.'); }) },
      { label: 'Paint', fn: () => { $('#paint').hidden = false; } },
      { label: 'Look at postcards', fn: () => openBook('pic') },
      { label: 'Mailbox', fn: openMailbox },
      { label: 'Name a star', fn: () => nameIt('Name a star', save.names.star, (v) => { save.names.star = v; persist(); if (v) { logJournal(`I named a star ${v}.`); toast(`${v} is up there now ✨`); sfx.chime(); } }) },
      ...(c.balloon && c.balloon.visible ? [{ label: 'Ride the balloon', fn: () => openGate({ x: c.x, z: c.z, plain: true, quiet: true, head: 'The balloon asks one question', onPass: openTeleport }) }] : []),
    ]);
  } else if (near.kind === 'giant') {
    giantAsk();
  } else if (near.kind === 'cave') {
    // capture the cave: the question answers 0.4s later, and by then near may
    // have moved on (she drifts) — reading near.c there threw and she never went in
    const c = near.c;
    c.glow.intensity = 2.2;
    if (gateSeen.has('c' + c.key)) enterCave(c); else caveGate(c);
  } else if (near.kind === 'stone') {
    const lm = near.lm;
    if (lm.done) return;
    const [type, need] = lm.req;
    if (save.res[type] >= need) {
      openGate(lm);          // charged on the pass, not here: tapping Wake twice used to pay twice
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
      if (isGone(n)) continue;
      const d = Math.hypot(n.x - px, n.z - pz);
      if (d < bd) { bd = d; best = { kind: 'node', node: n }; }
    }
  }
  for (const f of friends.values()) {
    const d = Math.hypot(f.g.position.x - px, f.g.position.z - pz);
    if (d < 2.8 && d < bd) { bd = d; best = { kind: 'friend', f }; }
  }
  for (const c of caves.values()) {
    // measured from the mouth on the flat face, not the middle of the hill —
    // the hill's own push-out keeps her 4 m from the centre, out of reach
    const d = Math.hypot(c.x - px, c.z + 3.8 - pz);
    if (d < 3.2 && d < bd) { bd = d; best = { kind: 'cave', c }; }
  }
  for (const c of camps) {
    const d = Math.hypot(c.g.position.x - px, c.g.position.z - pz);
    if (d < 3.6 && d < bd) { bd = d; best = { kind: 'camp', c }; }
  }
  // she has to be settled to be petted — no reaching down at a moving cat
  if (!inBoat && !fishing && !mini && !skipStone && (catSit > 0.35 || catLie > 0.35)) {
    const cd = Math.hypot(fluffy.position.x - px, fluffy.position.z - pz);
    if (cd < 1.7 && cd < bd && bd > 1.2) { bd = cd; best = { kind: 'pet' }; }
  }
  if (giant && Math.hypot(giant.x - px, giant.z - pz) < 7 && bd > 7) { bd = 7; best = { kind: 'giant' }; }
  // a deer close enough to hand a flower to — it beats sitting by a campfire
  if (!inBoat && !fishing && !mini && !skipStone && !inCave && save.res.bloom >= 2) {
    for (const d of deer) {
      if (d.K) continue;
      const dd = Math.hypot(d.g.position.x - px, d.g.position.z - pz);
      if (dd < 4.8 && (dd < bd || (best && best.kind === 'camp'))) { bd = dd; best = { kind: 'feed', d }; }
    }
  }
  for (const lm of landmarks.values()) {
    if (lm.done) continue;
    const d = Math.hypot(lm.x - px, lm.z - pz);
    if (d < 3.4) {
      const [type, need] = lm.req;
      best = { kind: 'stone', lm };
      actEl.textContent = save.res[type] >= need ? 'Wake it' : `${LABEL[type]} ${save.res[type]}/${need}`;
    }
  }
  // a stone standing in the water is only reachable by boat: let the wake win over Step out
  if (inBoat && !(best && (best.kind === 'stone' || best.kind === 'giant'))) {
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
  } else if (near.kind === 'pet') {
    promptEl.textContent = 'Fluffy';
    actEl.textContent = 'Pet';
  } else if (near.kind === 'feed') {
    promptEl.textContent = 'A deer';
    actEl.textContent = 'Feed';
  } else if (near.kind === 'fish') {
    promptEl.textContent = 'Pond';
    actEl.textContent = fishing ? (fishing.phase === 'bite' ? 'Reel!' : 'Wait…') : 'Fish';
  } else if (near.kind === 'skip') {
    promptEl.textContent = 'Flat stone';
    actEl.textContent = mini ? 'Skip!' : skipCool() > 0 ? `Rest ${Math.ceil(skipCool())}s` : 'Skip stones';
  } else if (near.kind === 'boat') {
    promptEl.textContent = 'Rowboat';
    actEl.textContent = 'Row';
  } else if (near.kind === 'cave') {
    promptEl.textContent = caveName(near.c);
    actEl.textContent = save.caves.includes(near.c.key) ? 'Look in' : 'Step in';
    if (!gateSeen.has('c' + near.c.key)) caveGate(near.c);   // the maths IS the gate
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
// the name tag reads as a button when it sits there over the scene, so it is
// one: tapping "Wood" does what tapping Gather does.  Same for "Rowboat".
promptEl.onclick = interact;

// ---------------------------------------------------------------- day / night
const cNight = new THREE.Color(0x0c1730), cDay = new THREE.Color(0xa9d4e8), cWarm = new THREE.Color(0xe9a37a);
const skyCol = new THREE.Color();
let skyT = 0, dayLight = 1, skyH = 0, skySun = 0, skyMoon = 0, skyAz = 0, hourNow = 12;
// The sky is nailed to the world, not the camera: the sun rises in the east
// and sets in the west, the moon hangs opposite it, so she has to turn and
// find it. 140 units out — inside the 320-wide ground, so the horizon hides
// them once they are under it.
const SKY_R = 140;
function placeSky() {
  const v = new THREE.Vector3();
  const put = (m, az, alt) => {
    if (!m) return;
    const c = Math.cos(alt);
    m.position.copy(player.position).setY(0);
    m.position.addScaledVector(v.set(Math.sin(az) * c, Math.sin(alt), Math.cos(az) * c), SKY_R);
    m.lookAt(camera.position);
    m.visible = alt > -0.05;
  };
  put(sunDisc, skyAz, skySun);
  put(moonDisc, skyAz + Math.PI, skyMoon);
}

// real sunrise / sunset for this patch of sky (default: Atlanta; ?lat=&lon= overrides)
const SUN_LAT = +(new URLSearchParams(location.search).get('lat') ?? 33.749);
const SUN_LON = +(new URLSearchParams(location.search).get('lon') ?? -84.388);
let sunKey = '', sunRise = 6, sunSet = 18, sunNoon = 12, sunMax = 1.08;

// NOAA solar position: declination + equation of time -> sunrise, sunset, peak altitude
function solarDay(d) {
  const key = d.toDateString();
  if (key === sunKey) return;
  sunKey = key;
  const rad = Math.PI / 180;
  const doy = (d - new Date(d.getFullYear(), 0, 0)) / 864e5;
  const g = (2 * Math.PI / 365) * (doy - 1);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const dec = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const lat = SUN_LAT * rad;
  const tz = -d.getTimezoneOffset();                       // minutes east of UTC
  const noonUTC = 720 - 4 * SUN_LON - eq;                  // solar noon, minutes UTC
  sunNoon = (noonUTC + tz) / 60;
  const cosH = (Math.cos(90.833 * rad) - Math.sin(lat) * Math.sin(dec)) / (Math.cos(lat) * Math.cos(dec));
  if (!(Math.abs(cosH) < 1)) {                             // polar night / midnight sun: leave it at 6-18
    sunRise = 6; sunSet = 18; sunMax = 1.08; return;
  }
  const ha = Math.acos(cosH) / rad;                        // degrees
  sunRise = (noonUTC - 4 * ha + tz) / 60;
  sunSet = (noonUTC + 4 * ha + tz) / 60;
  // ponytail: a real Atlanta November noon is only 39 deg, so midday shadow was
  // 1.2x the caster. Floor the peak near 75 deg: short at noon, long only near
  // the ends, which is how a kid reads a day. Sky colours still follow the arc.
  sunMax = Math.max(1.30, Math.PI / 2 - Math.abs(lat - dec));   // peak elevation, radians
}

function updateSky() {
  const d = new Date();
  solarDay(d);
  const fakeH = new URLSearchParams(location.search).get('hour');
  const h = fakeH === null ? d.getHours() + d.getMinutes() / 60 : +fakeH;   // ?hour=12 for testing
  hourNow = h;
  const span = Math.max(1, sunSet - sunRise);
  const u = (h - sunRise) / span;                          // 0 at sunrise, 1 at sunset
  const sunAlt = Math.sin(Math.PI * Math.max(-0.5, Math.min(1.5, u))) * sunMax;   // below 0 = under
  const day = smoothstep(sunAlt, -0.105, 0.14);        // the sky dims as the disc sinks
  const warm = Math.max(0, 1 - Math.abs(sunAlt) / 0.244);
  const moonAlt = Math.min(-sunAlt, 0.105);            // mirrors the sun, capped ~6° so it stays in frame
  const a = (h / 24) * Math.PI * 2 - Math.PI / 2;
  skyCol.copy(cNight).lerp(cDay, day).lerp(cWarm, warm * 0.5);
  scene.background = skyCol;
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
  sun.position.set(player.position.x + Math.sin(skyAz) * Math.cos(sunAlt) * 90, Math.max(4, Math.sin(sunAlt) * 90), player.position.z + Math.cos(skyAz) * Math.cos(sunAlt) * 90);
  sun.target.position.copy(player.position);
  sun.target.updateMatrixWorld();
  moon.position.set(player.position.x - Math.cos(a) * 60, 60, player.position.z - 30);
  stars.material.opacity = Math.pow(1 - day, 1.6);
  cloudMat.color.copy(skyCol).lerp(new THREE.Color(0xffffff), 0.72);
  cloudMat.opacity = 0.3 + day * 0.45;
  skyMoon = moonAlt;
  skyAz = (Math.PI / 2) * (1 - 2 * u);              // E at sunrise, S at noon, W at sunset
  stars.rotation.y = a * 0.3;
  // hand the water the same sky it is under, plus the disc that is actually up
  waterU.top.value.copy(skyTop);
  waterU.bot.value.copy(skyBot).lerp(new THREE.Color(0xcbe7ff), 0.22);
  const upNow = skySun > -0.02;
  const gAlt = upNow ? skySun : skyMoon, gAz = upNow ? skyAz : skyAz + Math.PI;
  const gc = Math.cos(gAlt);
  waterU.sun.value.set(Math.sin(gAz) * gc, Math.sin(gAlt), Math.cos(gAz) * gc);
  waterU.glint.value.copy(upNow ? cSunGlint : cMoonGlint)
    .multiplyScalar(upNow ? 0.35 + 0.65 * day : 0.5 * (1 - day));
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
let inBoat = false, rowBoat = null, rowPh = 0;
const stoneMat = mat({ color: 0x8b8f9c });

function pondExtras(pd) {
  const g = new THREE.Group();
  g.position.set(pd.x, 0, pd.z);
  pd.extra = g;
  scene.add(g);

  // stepping stones: a real second crossing, offset off the bridge line. Pads
  // run the full water line at 2.4 m centres -- they overlap by 0.3 m, so there
  // is no water between them and she can walk the whole way over
  pd.stones = [];
  const off = pd.r * 0.55, half = Math.sqrt(1 - 0.55 ** 2) * pd.r * 0.98;
  for (let t = -half; t <= half + 0.01; t += 2.4) {
    const x = pd.axis ? pd.x + t : pd.x + off, z = pd.axis ? pd.z + off : pd.z + t;
    pd.stones.push({ x, z });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.45, 0.3, 7), stoneMat);
    m.position.set(x - pd.x, 0.15, z - pd.z);
    m.receiveShadow = true;
    g.add(m);
  }

  // dock: a short pier off the side, for fishing.  It runs 45° off the stream so
  // the planks never lie in running water and the land end always meets grass
  const [ux, uz] = streamDir(pd), nx = -uz, nz = ux;
  const dl = 7.6, d0 = pd.r * 0.8;
  const an = Math.atan2(ux, uz) + Math.PI / 4;
  if (pd.kind === 'boat') {
  const ddx = Math.sin(an), ddz = Math.cos(an);
  pd.dock = { x: pd.x, z: pd.z, dx: ddx, dz: ddz, nx: -ddz, nz: ddx, a: d0, b: d0 + dl };
  const dockG = new THREE.Group();
  dockG.rotation.y = an;                       // local +z -> the dock's own heading
  const slot = { g: dockG, z: d0 + dl / 2 };
  if (dockGeo) dockG.add(dockPiece(slot.z));
  else dockWait.push(slot);
  g.add(dockG);
  }

  // reeds at the waterline, wildflowers a step back on the bank
  for (let i = 0; i < 18; i++) {
    const a = Math.random() * Math.PI * 2, rr = pd.r * (0.99 + Math.random() * 0.15);
    reeds.push({ x: pd.x + Math.cos(a) * rr, z: pd.z + Math.sin(a) * rr, s: 0.85 + Math.random() * 0.35, r: Math.random() * 6.28 });
  }
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2, rr = pd.r * (1.02 + Math.random() * 0.3);
    blooms.push({ x: pd.x + Math.cos(a) * rr, z: pd.z + Math.sin(a) * rr, s: 0.9 + Math.random() * 0.3, r: Math.random() * 6.28 });
  }
  Scatter();

  // stream: drains the pond away toward the open side, with a waterfall at the end
  // the run stops short of the next pond, so the fall never lands in one
  const b0 = streamB0(pd, ux, uz);
  const a0 = pd.r * 0.7, len = b0 - a0;
  if (pd.wet && len > 8) {
  const mk = (geo, material, along, across, y) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(pd.x + ux * along + nx * across, y, pd.z + uz * along + nz * across);
    m.rotation.y = Math.atan2(ux, uz);
    return m;
  };
  const mid = (a0 + b0) / 2;
  // the water starts under the pond's surface (0.045 vs 0.07): the pond covers the
  // end, so the stream emerges instead of butting in with a square face
  const av = pd.r * 0.35, am = (av + b0) / 2;
  const strip = mk(new THREE.PlaneGeometry(3, b0 - av).rotateX(-Math.PI / 2), streamMat, am, 0, 0.045);
  // banks and foam stop at the shore ring instead of ending 6 m out in open water
  const bs = pd.r * 1.06, bm = (bs + b0) / 2, bl = b0 - bs;
  const bankL = mk(new THREE.BoxGeometry(1.1, 0.12, bl), mat({ color: 0xcbb98b }), bm, -1.9, 0.06);
  const bankR = mk(new THREE.BoxGeometry(1.1, 0.12, bl), mat({ color: 0xcbb98b }), bm, 1.9, 0.06);
  const frillL = mk(new THREE.BoxGeometry(0.22, 0.02, bl), foamMat, bm, -1.3, 0.12);
  const frillR = mk(new THREE.BoxGeometry(0.22, 0.02, bl), foamMat, bm, 1.3, 0.12);
  // waterfall: a heap of boulders the stream spills over, not a wall of stone
  const wall = new THREE.Group();
  pd.fallRocks = [];   // real stone: the push-out reads these, see pushOut
  for (const [dn, dd, sz] of [[0,0,1.9],[1.1,-1.5,1.35],[-1.2,1.4,1.45],[2.1,0.9,1.1],[-2.2,-0.9,1.15],[0.5,2.2,1.0],[-0.8,-2.3,1.05],[2.7,-1.9,0.9],[-2.9,1.8,0.95],[1.7,-0.4,1.2]]) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(sz, 0), mat({ color: (dn * 3 + dd) % 2 ? 0x8c9199 : 0x7b818a, flatShading: true }));
    r.position.set(pd.x + ux * (b0 + 1 + dn) + nx * dd, 0.24 + sz * 0.62, pd.z + uz * (b0 + 1 + dn) + nz * dd);
    r.rotation.set(dn * 0.5, Math.atan2(ux, uz) + dd * 0.4, dd * 0.35);
    r.castShadow = true;
    r.receiveShadow = true;
    pd.fallRocks.push({ x: r.position.x, z: r.position.z, r: sz * 0.82 });
    wall.add(r);
  }
  const fall = mk(new THREE.BoxGeometry(2.2, 1.7, 0.18), waterMat, b0 + 0.6, 0, 0.95);
  const foam = mk(new THREE.CylinderGeometry(1.9, 2.2, 0.1, 12), new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.55, depthWrite: false }), b0 - 0.3, 0, 0.12);
  scene.add(strip, bankL, bankR, frillL, frillR, wall, fall, foam);
  pd.fall = fall;
  // the ring's bright arc used to run straight across the mouth: cut the gap that
  // the water passes through and spin it to the stream's bearing
  if (pd.foam) {
    const gap = Math.min(0.6, 3.4 / pd.r);
    pd.foam.geometry = new THREE.RingGeometry(0.93, 1.0, 40, 1, gap / 2, Math.PI * 2 - gap);
    pd.foam.rotation.z = Math.atan2(-uz, ux) - (pd.axis ? Math.PI / 2 : 0);
  }
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

  }   // len > 8

  // a rowboat, moored at the edge
  if (pd.kind === 'boat') {
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
    // oars pivot at the oarlock so the stroke can be animated, not just posed
    b.userData.oars = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.7, 0.7, 0.15);
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 1.95).translate(0, 0, -0.98), mat({ color: 0xcaa06b }));
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.44), mat({ color: 0xcaa06b }));
      blade.position.set(0, 0, -1.9);
      pivot.add(shaft, blade);
      pivot.rotation.y = -sx * 1.4;   // shaft points out over the water, blade near the surface
      b.add(pivot);
      b.userData.oars.push(pivot);
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
    for (const s of pd.stones || []) if (Math.hypot(x - s.x, z - s.z) < 1.35) return true;
    for (const s of pd.streamStones || []) if (Math.hypot(x - s.x, z - s.z) < 1.0) return true;
  }
  return false;
}
function onDock(x, z) {
  for (const pd of ponds.values()) {
    const d = pd.dock;
    if (!d) continue;
    const ax = x - d.x, az = z - d.z;
    const along = ax * d.dx + az * d.dz, across = Math.abs(ax * d.nx + az * d.nz);
    if (across < 1.3 && along > d.a && along < d.b) return true;
  }
  return false;
}

// ---------------------------------------------------------------- hills + caves
const hills = new Map(), caves = new Map();

// pure in (rx, rz): cached, because caveFor asks it nine times per cell
const hillMemo = new Map();
function hillFor(rx, rz) {
  const mk = `${rx},${rz}`;
  if (hillMemo.has(mk)) return hillMemo.get(mk);
  const f = hillMath(rx, rz);
  hillMemo.set(mk, f);
  return f;
}

function hillMath(rx, rz) {
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

// hills pop in around her, so hillAt() reads zero for any hill that has not been
// built yet: props scattered early end up buried in one later. Ask the maths instead.
function inHill(x, z, pad = 0) {
  const hx = Math.floor(x / R), hz = Math.floor(z / R);
  for (let ax = hx - 1; ax <= hx + 1; ax++) for (let az = hz - 1; az <= hz + 1; az++) {
    const h = hillFor(ax, az);
    if (h && Math.hypot(x - h.x, z - h.z) < h.r * 1.12 + pad) return true;
  }
  return false;
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
  // ponytail: 0.18 leaves too many cells empty once the hill rule rejects a few;
  // 0.22 recovers density without hand-placing caves
  if (rnd() > 0.22) return null;
  const s = spot(rx, rz);
  const [x, z] = warp((rx + 0.5) * R + (rnd() - 0.5) * 80, (rz + 0.5) * R + (rnd() - 0.5) * 80);
  if (Math.hypot(x - s.x, z - s.z) < 26) return null;
  // a cave digs into flat ground: a hill over its mouth buries the door, and the
  // hill's slope lifts her over the roof instead of letting her walk in
  for (let ax = rx - 1; ax <= rx + 1; ax++) for (let az = rz - 1; az <= rz + 1; az++) {
    const h = hillFor(ax, az);
    if (h && Math.hypot(x - h.x, z - h.z) < h.r * 1.12 + 9) return null;
  }
  // a mouth in the water is unreachable, and one on the bank reads as sunken
  for (let ax = rx - 1; ax <= rx + 1; ax++) for (let az = rz - 1; az <= rz + 1; az++) {
    const q = pondFor(ax, az);
    if (!q) continue;
    const a0 = q.r * 0.7, b0 = q.r + 46, [ux, uz] = streamDir(q);
    const t = Math.min(b0, Math.max(a0, (x - q.x) * ux + (z - q.z) * uz));
    if (Math.hypot(x - q.x, z - q.z) < q.r + 13) return null;
    if (Math.hypot(x - (q.x + ux * t), z - (q.z + uz * t)) < 9) return null;
  }
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
    // the fallback exterior, used only until the cave-mouth asset lands
    const oldG = new THREE.Group();
    // the hill it digs into: a half dome, so you cannot see through the back
    // a hill of broken rock, not a smooth dome: few segments, every vertex knocked out of line
    const dg = new THREE.SphereGeometry(1, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    const dp = dg.attributes.position;
    for (let i = 0; i < dp.count; i++) {
      const wob = 1 + 0.17 * Math.sin(i * 12.9898) * Math.cos(i * 7.233);
      dp.setXYZ(i, dp.getX(i) * wob, dp.getY(i) * (1 + 0.12 * Math.sin(i * 4.1)), dp.getZ(i) * wob);
    }
    // nothing of the hill may push through the opening: hold the face flush behind it
    for (let i = 0; i < dp.count; i++) {
      if (dp.getZ(i) * 5.2 > 1.75 && Math.abs(dp.getX(i) * 5.6) < 3.4 && dp.getY(i) * 5.0 < 2.9) dp.setZ(i, 1.75 / 5.2);
    }
    dg.computeVertexNormals();
    const dome = new THREE.Mesh(dg, mat({ color: 0x6d727c, flatShading: true }));
    dome.scale.set(5.6, 5.0, 5.2);   // tall enough to read as a hill behind the shell
    dome.position.set(0, 0, -2.2);
    dome.castShadow = true;
    dome.receiveShadow = true;
    oldG.add(dome);
    // boulders heaped over the whole hill, skipping the apron in front of the mouth
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + 0.42;
      const x = Math.cos(a), z = Math.sin(a);
      if (Math.abs(Math.atan2(x, z)) < 0.62) continue;   // leaves the way in clear
      const rho = 2.5 + ((i * 5) % 7) * 0.34;
      const size = 0.75 + ((i * 3) % 5) * 0.19;
      // nor may a boulder lean over the opening itself
      if (-1.9 + z * rho > 1.7 - size * 1.25 && Math.abs(x * rho) < 2.5 + size * 1.15) continue;
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), mat({ color: i % 3 ? 0x767b84 : 0x6a6f78, flatShading: true }));
      r.position.set(x * rho, 0.34 + (5.0 - rho) * 0.62, -1.9 + z * rho);
      r.scale.set(1.15, 0.85, 1.1);
      r.rotation.set(i * 0.9, i * 1.7, i * 0.4);
      r.castShadow = true;
      r.receiveShadow = true;
      oldG.add(r);
    }
    // a big rock either side of the opening
    for (const sx of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(1.5, 0), mat({ color: 0x71767f, flatShading: true }));
      r.position.set(sx * 3.8, 1.05, 0.2);
      r.scale.set(1.1, 1.2, 1.15);
      r.rotation.set(sx * 0.3, sx * 1.1, 0);
      r.castShadow = true;
      oldG.add(r);
    }
    // the face of the hill on the entrance side is FLAT: one slab of rock she
    // sees head on.  The black half circle is painted on that flat face, so
    // nothing behind it has a surface left to cut through the opening.
    // a boulder with one side carved flat -- not a slab, a rock whose face the
    // opening is cut into.  Vertices past the plane are clamped onto it.
    const fGeo = new THREE.IcosahedronGeometry(1, 1);
    fGeo.scale(2.75, 1.85, 1.75);
    {
      const fp = fGeo.attributes.position, PLANE = 0.62;
      for (let i = 0; i < fp.count; i++) if (fp.getZ(i) > PLANE) fp.setZ(i, PLANE);
      fGeo.computeVertexNormals();
      var faceZ = PLANE;
    }
    const face = new THREE.Mesh(fGeo, mat({ color: 0x6a6f78, flatShading: true }));
    face.position.set(0, 1.45, 1.9);
    face.castShadow = true; face.receiveShadow = true;
    oldG.add(face);
    // the opening: a half circle painted on the flat face, dark at the centre
    // and lifted at the rim so it reads as depth rather than a decal
    const mc = document.createElement('canvas');
    mc.width = mc.height = 128;
    const mx = mc.getContext('2d');
    const gr = mx.createRadialGradient(64, 96, 4, 64, 96, 96);
    gr.addColorStop(0, '#000002'); gr.addColorStop(0.75, '#020208'); gr.addColorStop(1, '#07050f');
    mx.fillStyle = gr; mx.fillRect(0, 0, 128, 128);
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(1.95, 24, 0, Math.PI),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(mc), color: 0xffffff }));
    mouth.position.set(0, 0.03, 1.9 + faceZ + 0.01);
    oldG.add(mouth);
    if (!shellGeo) { g.add(oldG); g.userData.old = oldG; }
    addShell(g);
    // reeds on both flanks of the approach, wildflowers on the bank
    for (let i = 0; i < 10; i++) {
      const sx2 = i % 2 ? 1 : -1;
      reeds.push({ x: f.x + sx2 * (2.6 + Math.random() * 1.7), z: f.z + 1.0 + Math.random() * 2.6, s: 0.85 + Math.random() * 0.3, r: Math.random() * 6.28 });
    }
    for (let i = 0; i < 4; i++) blooms.push({ x: f.x + (Math.random() - 0.5) * 7, z: f.z + 2.6 + Math.random() * 1.8, s: 0.7 + Math.random() * 0.3, r: Math.random() * 6.28 });
    Scatter();
    // the path worn into the dirt, feathered at the edge like the ground path
    const dirt = new THREE.Mesh(new THREE.CircleGeometry(3.6, 24),
      new THREE.MeshStandardMaterial({ map: dirtTex, transparent: true, depthWrite: false, roughness: 1 }));
    dirt.rotation.x = -Math.PI / 2;
    dirt.position.set(0, 0.035, 3.5);
    dirt.scale.set(1.12, 1.45, 1);   // worn ground pulled out into a long apron
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
// each kind brings its own floor plan: how big the hall is, how high the roof
// sits, and where the vault -- the room behind the crystal door -- lives.
// rooms[0] is the hall and always reaches the mouth at z 36.5; rooms[vault] is
// the vault, and the door whose kind is 'crystal' is the one into it.
const CAVE_LAYOUTS = {
  crystal: {   // wide hall, a chamber either side, vault straight ahead
    vault: 3,
    rooms: [
      { x: 0, z: 0, rx: 26, rz: 38, h: 17 },
      { x: -30, z: -4, rx: 13, rz: 11, h: 10 },
      { x: 30, z: -4, rx: 13, rz: 11, h: 10 },
      { x: 0, z: -46, rx: 20, rz: 16, h: 14 },
    ],
    doors: [
      { id: 'deep', axis: 'z', x: 0, z: -34, hw: 1.1, hl: 13, kind: 'crystal' },
      { id: 'west', axis: 'x', x: -21.5, z: -4, hw: 1.1, hl: 11, kind: 'math' },
      { id: 'east', axis: 'x', x: 21.5, z: -4, hw: 1.1, hl: 11, kind: 'math' },
    ],
  },
  gallery: {   // one long hall, no side chambers: the vault is through the west wall
    vault: 2,
    rooms: [
      { x: 0, z: -6, rx: 16, rz: 44, h: 13 },
      { x: 30, z: 14, rx: 12, rz: 11, h: 9 },
      { x: -32, z: -6, rx: 19, rz: 15, h: 11 },
    ],
    doors: [
      { id: 'west', axis: 'x', x: -14, z: -6, hw: 1.1, hl: 12, kind: 'crystal' },
      { id: 'east', axis: 'x', x: 14, z: 14, hw: 1.1, hl: 11, kind: 'math' },
    ],
  },
  den: {       // low and cramped: the vault is through the east wall
    vault: 2,
    rooms: [
      { x: 0, z: 8, rx: 12, rz: 30, h: 9 },
      { x: -26, z: -6, rx: 11, rz: 10, h: 8 },
      { x: 33, z: 6, rx: 19, rz: 15, h: 8 },
    ],
    doors: [
      { id: 'east', axis: 'x', x: 11, z: 6, hw: 1.1, hl: 12, kind: 'crystal' },
      { id: 'west', axis: 'x', x: -11, z: -6, hw: 1.1, hl: 10, kind: 'math' },
    ],
  },
  deep: {      // the stairwell: the vault sits 3.2 m down at the north end
    vault: 3,
    rooms: [
      { x: 0, z: 0, rx: 26, rz: 38, h: 20 },
      { x: -30, z: -4, rx: 13, rz: 11, h: 12 },
      { x: 30, z: -4, rx: 13, rz: 11, h: 12 },
      { x: 0, z: -46, rx: 20, rz: 16, h: 18 },
    ],
    doors: [
      { id: 'deep', axis: 'z', x: 0, z: -34, hw: 1.1, hl: 13, kind: 'crystal' },
      { id: 'west', axis: 'x', x: -21.5, z: -4, hw: 1.1, hl: 11, kind: 'math' },
      { id: 'east', axis: 'x', x: 21.5, z: -4, hw: 1.1, hl: 11, kind: 'math' },
    ],
  },
  summit: {    // a tall narrow chimney, vault through the east wall
    vault: 2,
    rooms: [
      { x: 0, z: 6, rx: 13, rz: 32, h: 30 },
      { x: -2, z: -40, rx: 11, rz: 10, h: 12 },
      { x: 32, z: 10, rx: 19, rz: 15, h: 22 },
    ],
    doors: [
      { id: 'east', axis: 'x', x: 12, z: 10, hw: 1.1, hl: 12, kind: 'crystal' },
      { id: 'north', axis: 'z', x: 0, z: -22, hw: 1.1, hl: 11, kind: 'math' },
    ],
  },
};
// set from the layout at build time, so every reader below stays one line
let CAVE_ROOMS = CAVE_LAYOUTS.crystal.rooms;
let CAVE_DOORS = CAVE_LAYOUTS.crystal.doors;
const LEDGE = { x0: 6, x1: 18.6, z0: -56, z1: -44, h: 4.2, n: 12 };
// the tread height under a local x — the stone and the feet use one formula, so
// she stands on the steps instead of on a diagonal drawn through them
const ledgeY = (lx) => {
  const i = Math.min(LEDGE.n - 1, Math.max(0, Math.floor(((lx - LEDGE.x0) / (LEDGE.x1 - LEDGE.x0)) * LEDGE.n)));
  return ((i + 0.5) / LEDGE.n) * LEDGE.h;
};
// where the hall floor drops into the lower room: 8 m of run for 3.2 m of fall
const STAIR = { z1: -38, z0: -46, h: 3.2, w: 7 };
const inRoom = (r, x, z, t = 0) => ((x - r.x) / (r.rx + t)) ** 2 + ((z - r.z) / (r.rz + t)) ** 2 <= 1;

// every cave gets a name from its key, so it is the same cave every visit with
// no state to save.  Cupcake Cave is the one she tells people about.
const keyNum = (key) => Math.abs([...key].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) | 0, 7));
const CAVE_NAMES = ['Cupcake', 'Mossy', 'Whisper', 'Crystal', 'Sleepy', 'Toadstool', 'Marble',
  'Moonbeam', 'Pebble', 'Honey', 'Bramble', 'Puddle', 'Glimmer', 'Acorn', 'Feather', 'Mittens'];
const CAVE_NOUNS = ['Bend', 'Hill', 'Rest', 'Nook', 'Burrow', 'Creek', 'Pocket', 'Glade',
  'Hush', 'Meadow', 'Shelf', 'Brook', 'Corner', 'Cove', 'Nest', 'Ember'];
// the word a second grader knows for the place itself - no dell/grotto/bower
const CAVE_ENDS = ['Cave', 'Den', 'Cavern', 'Hollow'];
// 16x16x4 = 1024 names from three independent bit fields of one well-mixed hash
const keyHash = (key) => {
  let h = 2166136261;
  for (const ch of key) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13;
  return h >>> 0;
};
const caveName = (c) => {
  const h = keyHash(c.key);
  return `${CAVE_NAMES[h & 15]} ${CAVE_NOUNS[(h >>> 4) & 15]} ${CAVE_ENDS[(h >>> 8) & 3]}`;
};

// four kinds, picked by the same key: what is inside, not just what colour it is
const CAVE_KINDS = [
  { id: 'crystal', rock: 0x8d8478, floor: 0x6b5a46, ledge: 1, nook: 0, stair: 0, bats: 3, moss: 16, spring: 1 },
  { id: 'gallery', rock: 0x7f8a80, floor: 0x5f6a58, ledge: 0, nook: 0, stair: 0, bats: 1, moss: 34, spring: 1 },
  { id: 'den',     rock: 0x8a7a66, floor: 0x6a5643, ledge: 0, nook: 1, stair: 0, bats: 0, moss: 24, spring: 0, glow: 0 },
  { id: 'deep',    rock: 0x7b8496, floor: 0x5a5f6e, ledge: 0, nook: 1, stair: 1, bats: 3, moss: 12, spring: 1 },
  // the climb: no stairwell, just the stone steps up the east side to the old box
  { id: 'summit',  rock: 0x86807a, floor: 0x635a4e, ledge: 1, nook: 0, stair: 0, bats: 2, moss: 18, spring: 1 },
];
const caveKind = (key, force) => force || CAVE_KINDS[keyNum(key) % CAVE_KINDS.length];

// the ledge is a ramp, not a shelf: no vertical face to get stuck in
function caveGround(x, z) {
  if (!caveRoom) return 0;
  // the vault is built in its own local space and then turned to face the hall,
  // so a point is un-turned before it is tested against the ledge
  const R = caveRoom.rot || 0, c = Math.cos(R), s = Math.sin(R);
  const dx = x - caveRoom.vault.x, dz = z - caveRoom.vault.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  // the vault's props are authored 46 m north of the room centre (dv.position.z),
  // so the ledge rect is tested in that same authored frame — without this the
  // ground stayed flat while the stone steps rose 4.2 m and she walked into them
  const L = caveRoom.ledge;
  if (L && lx > L.x0 && lx < L.x1 && lz - 46 > L.z0 && lz - 46 < L.z1) return ledgeY(lx);
  const S = caveRoom.stair;
  if (S && !R && Math.abs(x) < 19) {
    // the neck into the deep room is a ramp, steps drawn on top of it
    return -S.h * Math.min(1, Math.max(0, (S.z1 - z) / (S.z1 - S.z0)));
  }
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
  caveBeacon(d);
}

// a doorway opening is easy to miss in the dark.  A column of light stands in
// it for half a minute, a light pulses on the floor, and the map gets a dot.
function caveBeacon(d) {
  if (!caveRoom) return;
  if (caveRoom.beacon) { caveScene.remove(caveRoom.beacon.g); caveRoom.beacon = null; }
  const g = new THREE.Group();
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.5, 9, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xc9a8ff, transparent: true, opacity: 0.34,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  col.position.y = 4.5;
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1.6, 20),
    new THREE.MeshBasicMaterial({ color: 0xd6bbff, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.06;
  const l = new THREE.PointLight(0xc9a8ff, 4, 18, 2); l.position.y = 2.2;
  g.add(col, pool, l);
  // stand it on her side of the wall, so she can see which way to walk
  const off = d.axis === 'z' ? Math.sign((player.position.z - d.z) || -1) * 3.2 : 0;
  const off2 = d.axis === 'x' ? Math.sign((player.position.x - d.x) || 1) * 3.2 : 0;
  g.position.set(d.x + off2, 0, d.z + off);
  caveScene.add(g);
  caveRoom.beacon = { g, col, pool, l, t: 0 };
  sfx.unlock();
}

function buildCave(key, forceKind) {  if (caveRoom && caveKey === key && !forceKind) return caveRoom;
  if (caveRoom) { caveScene.remove(caveRoom.g); caveRoom = null; }
  const num = keyNum(key);
  const K = caveKind(key, forceKind);
  const LAY = CAVE_LAYOUTS[K.id];
  CAVE_ROOMS = LAY.rooms;
  CAVE_DOORS = LAY.doors;   // placed below, once HALL exists
  const HALL = CAVE_ROOMS[0];
  // a doorway stands halfway across the neck the hall and its room leave between them,
  // measured on the door's own axis. the hand-typed numbers had drifted: summit's north
  // door sat 6 m inside the hall with the room mouth 8 m past it, so the opening in the
  // rock wall faced bare rock and the room you could actually walk into was off to one side
  CAVE_DOORS = LAY.doors.map((d) => {
    const room = CAVE_ROOMS.slice(1).reduce((a, b) =>
      Math.hypot(b.x - d.x, b.z - d.z) < Math.hypot(a.x - d.x, a.z - d.z) ? b : a);
    const ax = d.axis === 'x';
    const dir = ax ? Math.sign(room.x - HALL.x) || 1 : Math.sign(room.z - HALL.z) || 1;
    // how wide each ellipse is where the door line crosses it
    const wide = (r) => Math.sqrt(Math.max(0.04, 1 - (ax ? (d.z - r.z) / r.rz : (d.x - r.x) / r.rx) ** 2));
    const hF = ax ? HALL.x + dir * HALL.rx * wide(HALL) : HALL.z + dir * HALL.rz * wide(HALL);
    const rF = ax ? room.x - dir * room.rx * wide(room) : room.z - dir * room.rz * wide(room);
    return { ...d, room, [ax ? 'x' : 'z']: Math.round((hF + rF) * 5) / 10,   // midpoint, 0.1 m
      n0: Math.min(hF, rF), n1: Math.max(hF, rF),                       // where both floors stop
      gap: (rF - hF) * dir };                                           // >0 = bare neck, <0 = rooms overlap
  });
  const vault = CAVE_ROOMS[LAY.vault];
  // the vault faces away from the hall, so its local -Z always points at the back wall
  const rot = vault.x > HALL.x + 2 ? -Math.PI / 2 : vault.x < HALL.x - 2 ? Math.PI / 2 : 0;
  const cR = Math.cos(rot), sR = Math.sin(rot);
  const W = (lx, lz) => [vault.x + lx * cR + lz * sR, vault.z - lx * sR + lz * cR];
  // where the box will stand has to be known before the walls go up, so the wall rocks can
  // keep off it: a rock leaning over the box leaves it visible and yet out of reach, since
  // the box asks from 2.0 m while a rock face stops her 3-4 m away
  const effX = rot ? vault.rz : vault.rx, effZ = rot ? vault.rx : vault.rz;
  const cxl = Math.round(effX * 0.72 * 10) / 10;
  const czl = -Math.round(effZ * 0.25 * 10) / 10 - (K.nook ? 1.5 : 0);
  const [chX, chZ] = W(cxl, czl);
  const rnd = mulberry(hash2(num, 7, save.seed));
  const g = new THREE.Group();
  const rockMat = new THREE.MeshStandardMaterial({ color: K.rock, emissive: 0x2b2620, roughness: 1, flatShading: true });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x241c38, roughness: 1, flatShading: true });
  const floorMat = new THREE.MeshStandardMaterial({ color: K.floor, emissive: 0x1e1912, roughness: 1, flatShading: true });
  const mouth = { x: 0, z: 36.5 };
  // a small spring in the first hall, the way the cave used to open
  // the spring used to sit at (11.5, 7.5), which is dead in the summit kind's vault
  // doorway (x 12, z 8.9-11.1) -- the pool's push radius plugged the only gap into the
  // secret room. it lives in the south-west of the hall now, clear of every layout door
  const pond = K.spring ? { x: -9, z: 14, r: 3.4 } : null;
  // the deep room sits lower when the way in is a stair
  const y0 = K.stair ? -3.2 : 0;
  const deepRoom = vault;
  const deep = new THREE.Group();   // everything in the lower room rides this
  deep.position.set(vault.x, y0, vault.z);
  deep.rotation.y = rot;
  g.add(deep);
  // the vault's props are authored around a room centred at the origin; this
  // inner group carries the old authored coordinates over unchanged
  const dv = new THREE.Group();
  dv.position.z = 46;
  deep.add(dv);
  // every rock she can see inside is also a rock she can walk into: the room
  // clamp alone stops her at the ellipse, which is metres inside the wall rocks
  const solids = [];

  for (const r of CAVE_ROOMS) {
    const ry = r === deepRoom ? y0 : 0;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 40), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.scale.set(r.rx, r.rz, 1);
    floor.position.set(r.x, ry, r.z);
    floor.receiveShadow = true;
    g.add(floor);

    const roof = new THREE.Mesh(new THREE.SphereGeometry(1, 26, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: K.rock * 0.8, emissive: 0x33302f, roughness: 1, flatShading: true, side: THREE.DoubleSide }));
    roof.scale.set(r.rx, r.h, r.rz);
    roof.position.set(r.x, ry, r.z);
    g.add(roof);

    // wall rocks, with gaps left at the necks and the mouth
    const n = Math.round((r.rx + r.rz) * 1.15);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.2;
      const x = r.x + Math.cos(a) * r.rx * 0.96, z = r.z + Math.sin(a) * r.rz * 0.96;
      const rr0 = 2.3 + rnd() * 1.9;   // drawn here so the pocket check can use its size
      if (CAVE_ROOMS.some((o) => o !== r && inRoom(o, x, z, 4))) continue;
      if (CAVE_DOORS.some((d) => Math.hypot(x - d.x, z - d.z) < d.hw + 5.6)) continue;
      if (Math.hypot(x - mouth.x, z - mouth.z) < 8) continue;
      if (K.stair && Math.abs(x) < 9 && z < STAIR.z1 + 5) continue;   // keep the stairway clear
      // no rock may lean into the box's pocket: its own collider plus her reach and a step
      if (Math.hypot(x - chX, z - chZ) < rr0 * 0.88 + 2.2) continue;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rr0, 0), rockMat);
      rock.position.set(x, ry + 0.5 + rnd() * 1.6, z);
      rock.scale.set(1, 1.7 + rnd() * 1.8, 1);
      rock.rotation.y = rnd() * 3;
      g.add(rock);
      solids.push({ x, z, r: rr0 * 0.88 });
    }
    for (let i = 0; i < Math.round(r.rx / 3); i++) {
      const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * 0.86;
      const sr0 = 0.5 + rnd() * 1.0, sh = 3 + rnd() * 4.5;
      // stalagmites stand on the floor. They used to be flipped (rotation.x = PI)
      // and hung from the roof, but kept a floor collider, so she was stopped in
      // open ground by a rock she could not see at her height.
      const st = new THREE.Mesh(new THREE.ConeGeometry(sr0, sh, 5), rockMat);
      st.position.set(r.x + Math.cos(a) * r.rx * rr, ry + sh / 2, r.z + Math.sin(a) * r.rz * rr);
      if (pond && Math.hypot(st.position.x - pond.x, st.position.z - pond.z) < pond.r + 1.4) continue;
      // the stairway and the doorways stay clear
      if (r === deepRoom && K.stair && Math.abs(st.position.x) < 6) continue;
      if (CAVE_DOORS.some((d) => Math.hypot(st.position.x - d.x, st.position.z - d.z) < d.hw + 4)) continue;
      if (Math.hypot(st.position.x - chX, st.position.z - chZ) < sr0 * 0.92 + 2.2) continue;
      g.add(st);
      solids.push({ x: st.position.x, z: st.position.z, r: sr0 * 0.92 });
    }
  }

  // neither floor covers the neck between a hall and a room, so the doorway opened onto a
  // hole in the ground with the room's floor starting metres further on (den west and
  // summit north had 4.2 m of void). one patch per real gap, a hair under the room floors
  // so the join does not z-fight
  for (const d of CAVE_DOORS) {
    if (d.gap < 1) continue;                     // rooms that overlap need no patch
    const len = d.gap + 4, wid = d.hw * 2 + 8, ax = d.axis === 'x';
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(ax ? len : wid, ax ? wid : len), floorMat);
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(d.x, -0.02, d.z);
    patch.receiveShadow = true;
    g.add(patch);
    // the neck also needs a roof and two sides: without them the doorway was a slot with the
    // outdoors showing past it, because neither room's dome reaches across the gap. an
    // inside-out box is invisible from outside and solid rock from within, so the opening
    // reads as a passage, not a hole in the world
    const h = 7, wall = new THREE.Mesh(new THREE.BoxGeometry(ax ? len : wid, h, ax ? wid : len),
      new THREE.MeshStandardMaterial({ color: K.rock, emissive: 0x241f1a, roughness: 1, flatShading: true, side: THREE.BackSide }));
    wall.position.set(d.x, h / 2 - 0.3, d.z);
    g.add(wall);
  }

  // the way down: a sloped floor with treads on it, from the hall into the
  // lower room.  the ground follows the same line (caveGround), so there is no
  // ledge to catch on and nothing to fall off.
  if (K.stair) {
    const ang = Math.atan2(STAIR.h, STAIR.z1 - STAIR.z0);
    const ramp = new THREE.Mesh(new THREE.PlaneGeometry(22, Math.hypot(STAIR.z1 - STAIR.z0, STAIR.h)), floorMat);
    ramp.rotation.x = -Math.PI / 2 - ang;
    ramp.position.set(0, -STAIR.h / 2, (STAIR.z0 + STAIR.z1) / 2);
    ramp.receiveShadow = true;
    g.add(ramp);
    for (let i = 0; i < 8; i++) {
      const zc = STAIR.z1 - (i + 0.5);
      const top = -STAIR.h * ((i + 0.5) / 8);
      const tread = new THREE.Mesh(new THREE.BoxGeometry(STAIR.w, 0.3, 1.02), rockMat);
      tread.position.set(0, top - 0.15, zc);
      g.add(tread);
    }
    // the hall floor tapers to a point just before the stair, so a flat landing
    // plugs the gap and gives her somewhere to start from
    const landing = new THREE.Mesh(new THREE.BoxGeometry(22, 0.4, 2.4), floorMat);
    landing.position.set(0, -0.2, STAIR.z1 + 1.1);
    g.add(landing);
  }

  // stars where the sky would be, over the hall only
  const sn = 260, spos = new Float32Array(sn * 3);
  for (let i = 0; i < sn; i++) {
    const a = rnd() * Math.PI * 2, y = 0.1 + rnd() * 0.9, rr = Math.sqrt(1 - y * y);
    spos.set([HALL.x + Math.cos(a) * rr * HALL.rx * 0.92, y * 16, HALL.z + Math.sin(a) * rr * HALL.rz * 0.92], i * 3);
  }
  const sgeo = new THREE.BufferGeometry();
  sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
  g.add(new THREE.Points(sgeo, new THREE.PointsMaterial({ map: dotTex, color: 0xffffff, size: 0.3, transparent: true, opacity: 0.35, depthWrite: false })));

  // the pool at the far end, fed by a fall that pours off a rock shelf
  const lx = 0, lz = -52, lr = 7.6;
  const lake = new THREE.Mesh(new THREE.CircleGeometry(lr, 26), new THREE.MeshStandardMaterial({ color: 0x3d86c0, emissive: 0x123048, roughness: 0.15, metalness: 0.35 }));
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(lx, 0.05, lz);
  dv.add(lake);

  // the back wall has to fit under the roof dome: at the old z the dome was only
  // ~7 m high, so the top half of the fall sat behind rock and never showed
  // the lip sits low enough to be in frame from the pool: at 8.6 the whole
  // crest was above the camera, so the fall read as a curtain off a flat wall
  const fallZ = -56.8, fallW = 5.6, fallH = 4.2, lipY = 4.2, lipR = 0.62;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(22, 9.4, 3.2), rockMat);
  wall.position.set(0, 4.2, -60.6);   // set back, so the ledge reads as a shelf in front of it
  dv.add(wall);

  // a rock ledge juts out of the wall and the stream runs along the top of it,
  // so the fall comes over an edge. It used to start under a dark slot box,
  // which read as a rectangle of water sliding out of the wall.
  // the shelf itself is only a lip: below it the rock steps back to the wall,
  // so the water hangs in open air instead of sliding down a flat face
  const ledge = new THREE.Mesh(new THREE.BoxGeometry(fallW + 8, 0.7, 3.6), rockMat);
  ledge.position.set(0, lipY - 0.35, fallZ - lipR - 1.8);
  ledge.receiveShadow = true;
  dv.add(ledge);
  for (const [dx, dz, rr0] of [[-4.3, 0.1, 1.15], [4.4, -0.2, 1.25], [-5.6, -1.5, 1.5], [5.7, -1.4, 1.45], [3.2, -2.4, 1.05], [-3.0, 0.35, 0.85], [3.1, 0.3, 0.9]]) {
    const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(rr0, 0), rockMat);
    rk.position.set(dx, lipY + rr0 * 0.25, fallZ - lipR + dz);
    rk.rotation.set(dx * 0.2, dz, rr0);
    rk.castShadow = true;
    dv.add(rk);
  }
  // rocks flanking the drop, so the sheet's straight sides end in stone
  for (const [x, dz, y, sy, rr0] of [[-3.7, -0.1, 1.5, 2.2, 1.15], [3.8, -0.3, 1.4, 2.0, 1.05], [-5.0, 0.2, 0.6, 1.2, 1.3], [5.1, 0.1, 0.6, 1.1, 1.2]]) {
    const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(rr0, 0), rockMat);
    rk.position.set(x, y, fallZ + dz);
    rk.scale.set(1, sy, 1);
    rk.rotation.y = x * 0.3;
    rk.castShadow = true;
    dv.add(rk);
  }
  // the stream lying on the ledge before it drops
  const ledgeWater = new THREE.Mesh(new THREE.PlaneGeometry(fallW + 0.9, 2.4), streamMat);
  ledgeWater.rotation.x = -Math.PI / 2;
  ledgeWater.position.set(0, lipY + 0.02, fallZ - lipR - 1.2);
  dv.add(ledgeWater);

  // vertical streaks scrolled downward: one texture per sheet so they can run
  // at different speeds and read as depth, not as a wallpaper
  const streakTex = () => {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256;
    const cx = cv.getContext('2d');
    for (let i = 0; i < 70; i++) {
      const w = 1 + Math.random() * 3, h = 40 + Math.random() * 200, y = Math.random() * 256;
      cx.fillStyle = `rgba(205,235,255,${(0.1 + Math.random() * 0.45).toFixed(2)})`;
      cx.fillRect(Math.random() * 64, y, w, h);
      cx.fillRect(Math.random() * 64, y - 256, w, h);   // tile vertically
    }
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, 2);
    return t;
  };
  // falling water does not hang in a perfect rectangle: the sides wander and the
  // face bows, so the silhouette is ragged instead of a cut plane
  const drape = (w, seed) => {
    const g2 = new THREE.PlaneGeometry(w, fallH, 12, 16), p2 = g2.attributes.position;
    for (let i = 0; i < p2.count; i++) {
      const x = p2.getX(i), y = p2.getY(i), k = (y + fallH / 2) / fallH;   // 1 at the lip, 0 in the pool
      const rag = Math.min(1, (1 - k) * 2.5);   // no wobble right at the lip, so it meets the curl
      const edge = 1 + rag * (0.13 * Math.sin(k * 5.5 + seed) + 0.07 * Math.sin(k * 13 + seed * 2));
      p2.setXYZ(i, x * edge, y, Math.sin(x * 1.6 + seed) * 0.18 * rag);
    }
    return g2;
  };
  const sheets = [];
  for (const [w, dz, sp, op] of [[fallW, 0, 1.1, 0.5], [fallW * 0.62, -0.12, 1.7, 0.42], [fallW * 0.34, -0.24, 2.4, 0.3]]) {
    const tex = streakTex();
    const sh = new THREE.Mesh(drape(w, dz * 30 + 1),
      new THREE.MeshBasicMaterial({ map: tex, color: 0xdff2ff, transparent: true, opacity: op, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    sh.position.set(0, lipY - lipR - fallH / 2, fallZ + dz);
    dv.add(sh);
    sheets.push({ tex, sp });
  }
  // the bend over the lip: the same streaks swept round a quarter circle, so the
  // water turns from flat to falling instead of starting at a straight edge
  {
    const g2 = new THREE.PlaneGeometry(fallW, 1, 1, 8), p = g2.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const a = Math.PI * 0.5 * (0.5 - p.getY(i));   // v=+1 back on the ledge, v=-1 at the drop
      p.setXYZ(i, p.getX(i), lipY - lipR + lipR * Math.cos(a), fallZ - lipR + lipR * Math.sin(a));
    }
    const tex = streakTex();
    dv.add(new THREE.Mesh(g2, new THREE.MeshBasicMaterial({ map: tex, color: 0xdff2ff, transparent: true,
      opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false })));
    sheets.push({ tex, sp: 1.4 });
  }
  // foam breaking along the lip, so the crest reads as water turning a corner
  const lipFoam = new THREE.Mesh(new THREE.BoxGeometry(fallW + 0.5, 0.1, 0.5), foamMat);
  lipFoam.position.set(0, lipY - 0.02, fallZ - lipR + 0.2);
  dv.add(lipFoam);
  const foam = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.6, 0.14, 18),
    new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.5, depthWrite: false }));
  foam.position.set(0, 0.12, fallZ + 0.3);
  dv.add(foam);
  // spray where it hits: 34 dots thrown up and outward, recycled forever
  const splash = (() => {
    const n = 34, pos = new Float32Array(n * 3), dat = [];
    for (let i = 0; i < n; i++) {
      const d = { x: (Math.random() - 0.5) * fallW, z: fallZ + 0.35 + Math.random() * 1.0, y: Math.random() * 1.8,
        vy: 1 + Math.random() * 2.6, vx: (Math.random() - 0.5) * 1.2 };
      dat.push(d);
      pos.set([d.x, d.y, d.z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: dotTex, color: 0xdff0ff, size: 0.34,
      transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    dv.add(pts);
    return { pts, pos, dat, n };
  })();
  const mist = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xcfe4ff, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false }));
  mist.position.set(0, 1.6, fallZ + 0.7);
  mist.scale.set(11, 7, 1);
  dv.add(mist);
  // a crack in the roof, and the moon coming through it
  const beam = new THREE.Mesh(new THREE.ConeGeometry(8.5, 17, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xbfa7ff, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.set(lx, 8.5, lz);
  dv.add(beam);
  const crack = new THREE.PointLight(0x9fc0ff, 2.2, 30, 2);
  crack.position.set(lx, 13, lz);
  dv.add(crack);

  const boat = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.5, 3, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0xfdf6ec, flatShading: true, side: THREE.DoubleSide }));
  hull.rotation.set(Math.PI / 2, 0, 0);
  hull.position.y = 0.16;
  boat.add(hull);
  boat.position.set(lx + lr * 0.4, 0.04, lz);
  boat.rotation.y = 0.4;
  dv.add(boat);

  // a small spring in the first hall, the way the cave used to open
  if (pond) {
  const pwater = new THREE.Mesh(new THREE.CircleGeometry(pond.r, 26),
    new THREE.MeshStandardMaterial({ color: 0x2f7ba6, emissive: 0x0d2436, roughness: 0.14, metalness: 0.4 }));
  pwater.rotation.x = -Math.PI / 2;
  pwater.position.set(pond.x, 0.05, pond.z);
  g.add(pwater);
  for (let i = 0; i < 7; i++) {   // stones at the lip
    const a = (i / 7) * Math.PI * 2 + rnd() * 0.3, rr0 = 0.5 + rnd() * 0.35;
    const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(rr0, 0), rockMat);
    rk.position.set(pond.x + Math.cos(a) * (pond.r + 0.35), 0.08 + rnd() * 0.2, pond.z + Math.sin(a) * (pond.r + 0.35));
    rk.rotation.y = rnd() * 3;
    g.add(rk);
  }
  const padMat = new THREE.MeshStandardMaterial({ color: 0x3f8a5c, emissive: 0x0d2418, roughness: 1, flatShading: true, side: THREE.DoubleSide });
  for (let i = 0; i < 4; i++) {   // lily pads
    const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * pond.r * 0.7;
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.42 + rnd() * 0.2, 9), padMat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(pond.x + Math.cos(a) * rr, 0.08, pond.z + Math.sin(a) * rr);
    g.add(pad);
  }
  }

  // the ledge up the east side, and the treasure on it — or, in the caves that
  // keep it, a rock spur that hides the box until she walks around it
  if (K.ledge) {
    const w = (LEDGE.x1 - LEDGE.x0) / LEDGE.n;
    for (let i = 0; i < LEDGE.n; i++) {
      const h = ((i + 0.5) / LEDGE.n) * LEDGE.h;
      const step = new THREE.Mesh(new THREE.BoxGeometry(w, h, LEDGE.z1 - LEDGE.z0), rockMat);
      step.position.set(LEDGE.x0 + (i + 0.5) * w, h / 2, (LEDGE.z0 + LEDGE.z1) / 2);
      dv.add(step);
    }
  }
  if (K.nook) {
    // authored 10.4 east / -51.5 north / 10 long in a 20 x 16 vault, as fractions: 0.52,
    // -0.34 and 0.625. unscaled, a turned 19 x 15 vault put the spur straight through the
    // box, so the box could never be reached (best approach 2.9 m, pickup is closer)
    const sx0 = effX * 0.52, sz0 = -46 - effZ * 0.34375;
    const spur = new THREE.Mesh(new THREE.BoxGeometry(3.2, 7.4, effZ * 0.625), rockMat);
    spur.position.set(sx0, 3.4, sz0);
    dv.add(spur);
    for (const f of [0.0875, 0.34375, 0.6]) { const [sx, sz] = W(sx0, -46 - effZ * f); solids.push({ x: sx, z: sz, r: 2.1 }); }
  }
  const chest = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0xc8a24a, metalness: 0.4, roughness: 0.5, flatShading: true }));
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.14, 0.54), new THREE.MeshStandardMaterial({ color: 0xe6c469, metalness: 0.4, roughness: 0.4, flatShading: true }));
  lid.position.y = 0.3;
  box.position.y = 0.25;
  chest.add(box, lid);
  // cxl / czl are worked out above the wall build, so the rocks could keep off the pocket
  chest.position.set(cxl, K.ledge ? ledgeY(cxl) + 0.02 : 0.02, czl - 46);
  chest.visible = !save.treasure.includes(key);
  dv.add(chest);
  // something up the stairs to walk toward: a gold glow over the box, seen from
  // the hall floor across the whole room
  const shine = new THREE.Group();
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xffd9a0, transparent: true,
    opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  halo.scale.set(3.2, 3.2, 1);
  halo.position.y = 2.0;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.1, 4.4, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffcf8a, transparent: true, opacity: 0.13, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  shaft.position.y = 2.2;
  const shineL = new THREE.PointLight(0xffc978, K.glow === 0 ? 0 : 2.2, 11, 2);
  shineL.position.y = 1.6;
  shine.add(halo, shaft, shineL);
  shine.position.copy(chest.position);
  shine.visible = !save.treasure.includes(key);
  dv.add(shine);

  // three crystals, scattered anywhere on the hall floor
  const crystals = [];
  const crowded = (x, z, m) => solids.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + m)
    || (pond && Math.hypot(pond.x - x, pond.z - z) < pond.r + m);
  const crystalSpot = () => {
    for (let i = 0; i < 40; i++) {
      const x = HALL.x + (rnd() * 2 - 1) * (HALL.rx - 4);
      const z = HALL.z + (rnd() * 2 - 1) * (HALL.rz - 6);
      if (((x - HALL.x) / (HALL.rx - 3)) ** 2 + ((z - HALL.z) / (HALL.rz - 3)) ** 2 > 1) continue;
      if (z > mouth.z - 10) continue;                                 // not in the entry tunnel
      if (CAVE_DOORS.some((d) => Math.hypot(x - d.x, z - d.z) < 8)) continue;   // not in a neck
      // nothing standing where the crystal would go: a rock wall, a stalagmite or the pond
      // pushes her 2-5 m out and the pickup reach is 1.4 m, so a crystal inside one could
      // never be lit. pushOut cannot answer yet, the room only becomes live after this
      // build returns, so read the same collider list directly
      if (crowded(x, z, 1.7)) continue;
      return { x, z };
    }
    // the darts can miss on a rock-heavy roll. scan the hall instead of dropping the
    // crystal on the centre: a fallback there buried it in a rock or stacked it on the
    // last one, and the door needs all three lit. Spacing is 4 m, so this always lands
    const spot = [];
    for (let x = HALL.x - HALL.rx + 5; x < HALL.x + HALL.rx - 4; x += 4)
      for (let z = HALL.z - HALL.rz + 7; z < HALL.z + HALL.rz - 6; z += 4) {
        if (((x - HALL.x) / (HALL.rx - 3)) ** 2 + ((z - HALL.z) / (HALL.rz - 3)) ** 2 > 1) continue;
        if (z > mouth.z - 10) continue;
        if (CAVE_DOORS.some((d) => Math.hypot(x - d.x, z - d.z) < 8)) continue;
        if (crowded(x, z, 1.2) || crystals.some((c) => Math.hypot(c.x - x, c.z - z) < 8)) continue;
        spot.push([x, z]);
      }
    // farthest from the ones already down, so three never bunch up
    spot.sort((a, b) => Math.min(...crystals.map((c) => Math.hypot(c.x - b[0], c.z - b[1])))
      - Math.min(...crystals.map((c) => Math.hypot(c.x - a[0], c.z - a[1]))));
    return spot[0] ? { x: spot[0][0], z: spot[0][1] } : { x: HALL.x, z: HALL.z };
  };
  for (let i = 0; i < 3; i++) {
    const { x, z } = crystalSpot();
    const cg = new THREE.Group();
    const glow = new THREE.PointLight(0xb18ce8, K.glow === 0 ? 0 : 1.5, 8, 2);
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
  }

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
      rk.scale.set(1.15, 1.45, 0.7);   // thinner in Z so the camera doesn't have to pass through it
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
    // where the stair kind puts the stairs, the way down is already open:
    // the stairs are the entrance, not a reward behind a door
    const open = saved.includes(d.id);
    plug.visible = !open;
    ring.visible = open;
    // the stair kind is a stairwell, not a doorway: no rock wall across the neck
    // the stairwell is a hidden room too: its wall stands until the three lights are lit
    return { ...d, g: plug, wall: grp, ring, open };
  });

  const bats = [];
  for (let i = 0; i < K.bats; i++) {
    const b = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 7, 6), darkMat);
    body.scale.set(1, 0.8, 1.5);
    const wing = (sx) => {
      const w = new THREE.Mesh(new THREE.ConeGeometry(0.46, 1.05, 3), darkMat);
      w.rotation.z = sx * 1.35;
      w.position.x = sx * 0.42;
      return w;
    };
    const wl = wing(-1), wr = wing(1);
    b.add(body, wl, wr);
    const bx = HALL.x + (i - 1) * 8 + (rnd() - 0.5) * 4, bz = HALL.z - 6 - rnd() * 18;
    const by = Math.min(HALL.h * 0.42, 6.2) + rnd() * 2.6;
    b.position.set(bx, by, bz);
    g.add(b);
    bats.push({ g: b, x: bx, z: bz, h: by, wl, wr, t: 0, ph: rnd() * 6 });
  }

  // every neck is a tunnel, not a gap between two domes: the hemispheres taper
  // to nothing at their rims, so without a ceiling here the camera rises over
  // the roof and the frame goes blank as she walks from one room to the next
  const tubeMat = new THREE.MeshStandardMaterial({ color: 0x6b6068, emissive: 0x33302f, roughness: 1, flatShading: true, side: THREE.DoubleSide });
  for (const d of CAVE_DOORS) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.4, 9.5, 14, 1, true), tubeMat);
    if (d.axis === 'z') t.rotation.x = Math.PI / 2; else t.rotation.z = Math.PI / 2;
    // over the stairwell the neck hangs lower, so the camera has a roof to slide on
    t.position.set(d.x, 1.9, d.z);
    g.add(t);
  }

  // ivy and twine hanging from the roof along the walls, not sprouting out of the
  // middle of the floor. The roof is a hemisphere scaled (rx, h, rz), so its height
  // at radial fraction f is h*sqrt(1-f^2) — f 0.8-0.9 is near the wall, clear of
  // the wall rocks at 0.96.
  for (const r of CAVE_ROOMS) {
    const nv = 4 + (rnd() < 0.5 ? 2 : 0);
    for (let i = 0; i < nv && caveProps.length; i++) {
      const src = caveProps[Math.floor(rnd() * caveProps.length)];
      const a = rnd() * Math.PI * 2, f = 0.88 + rnd() * 0.06;
      const x = r.x + Math.cos(a) * r.rx * f, z = r.z + Math.sin(a) * r.rz * f;
      const ry = r === deepRoom ? y0 : 0;
      const ceil = ry + r.h * Math.sqrt(1 - f * f);
      const sc = 2.0 + rnd() * 0.6;
      // stretch to a length that ends 1.4 m off the floor (capped at 3.4 m): a vine
      // that stops halfway up the wall reads as a smudge on the ceiling
      const len = Math.min(ceil - ry - 1.4, 3.4);
      const c = src.src.clone(true);
      c.scale.set(sc, len / Math.max(0.2, src.top), sc);
      c.rotation.set(Math.PI, -a + Math.PI, 0);    // flipped: grows down from the roof
      c.position.set(x, ceil - 0.2, z);             // root tucked into the rock
      c.userData.tag = src.tag;
      g.add(c);
    }
  }

  // a dry side room holds one cache: a wrapped bundle on a little cairn, once per room
  // per cave. The hall and the vault are left alone — the hall is a corridor and the
  // vault already has the box
  const caches = [];
  for (let i = 1; i < CAVE_ROOMS.length; i++) {
    const r = CAVE_ROOMS[i];
    if (r === vault) continue;
    if (pond && Math.hypot(r.x - pond.x, r.z - pond.z) < pond.r + 8) continue;   // the room with water keeps its pool
    const spots = [[r.x, r.z], [r.x, r.z + 3], [r.x + 3, r.z], [r.x, r.z - 3]];
    const sp = spots.find(([x, z]) => !solids.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + 1.6));
    if (!sp) continue;
    const ck = `${key}:${i}`;
    const cg = new THREE.Group();
    for (let k2 = 0; k2 < 3; k2++) {
      const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34 - k2 * 0.05, 0), rockMat);
      st.position.set((k2 - 1) * 0.16, 0.2 + k2 * 0.28, (k2 % 2) * 0.1);
      st.scale.y = 0.72;
      cg.add(st);
    }
    const kit = cacheKit(ck);
    const bundle = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.4, 0.44),
      new THREE.MeshStandardMaterial({ color: kit.col, emissive: 0x2a160a, roughness: 0.9, flatShading: true }));
    bundle.position.y = 1.14; bundle.rotation.y = 0.4;
    cg.add(bundle);
    // a warm spot so a dark room still shows it from the doorway
    const cgl = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xffcf8a, transparent: true,
      opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    cgl.scale.set(2.2, 2.2, 1); cgl.position.y = 1.3;
    cg.add(cgl);
    const cgot = save.caches.includes(ck);
    cg.position.set(sp[0], 0, sp[1]);
    cg.visible = !cgot;
    g.add(cg);
    caches.push({ g: cg, x: sp[0], z: sp[1], key: ck, got: cgot, kit });
  }

  const worms = caveWormDots(g);
  const moss = [];
  for (let i = 0; i < K.moss; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0x8fe6c8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.scale.set(1.1, 1.1, 1);
    sp.visible = false;
    g.add(sp);
    moss.push({ sp, t: 99 });
  }

  caveScene.add(g);
  caveKey = key;
  caveRoom = {
    g, rooms: CAVE_ROOMS, crystals, chest, doors, bats, moss, mouth, solids, caches, kind: K.id, floorY: y0,
    vault, rot, vaultG: dv, glow: K.glow !== 0,
    ledge: K.ledge ? LEDGE : null, stair: K.stair ? STAIR : null,
    arch: { g: arch, door: glowM, light: glowL },
    lake: { x: W(0, -6)[0], z: W(0, -6)[1], r: lr }, worms, mist,
    pond, shine, sheets, splash, fall: { x: 0, z: fallZ, w: fallW, h: fallH },
    frogs: [],   // spawned on the first caveTick: the GLB may still be in flight here
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
    buildCave(c.key, c.force);
    inCave = true; caveFound = 0; caveT = 0;
    $('#camp').hidden = true;          // no tents under ten metres of rock
    promptEl.hidden = true; actEl.hidden = true; near = null;  // the fade let one last frame through
    caveScene.add(player, fluffy, lantern);
    player.position.set(0, 0, caveRoom.mouth.z - 9.5);
    player.rotation.y = Math.PI;
    fluffy.position.set(1.2, 0, caveRoom.mouth.z - 10.5);
    mossPrev.x = 0; mossPrev.z = caveRoom.mouth.z - 9.5; mossAcc = 0;
    camYaw = Math.PI; camNear = 6.6;
    lantern.intensity = 9;
    sfx.setEcho(true);
    for (const d of caveRoom.doors) if (d.open && d.kind === 'crystal') caveBeacon(d);
    for (const k of caveRoom.crystals) { k.got = false; k.g.visible = true; k.light.intensity = caveRoom.glow ? 1.5 : 0; }
    caveRoom.chest.visible = !save.treasure.includes(caveKey);
    caveRoom.shine.visible = caveRoom.chest.visible;
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
    $('#camp').hidden = false;
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

function caveTakeTreasure() {
  if (save.treasure.includes(caveKey)) return;
  save.treasure.push(caveKey);
  caveRoom.chest.visible = false;
  caveRoom.shine.visible = false;
  persist(); hud();
  toast('A treasure for your Book 🎁');
  sfx.restore();
  logJournal('I found something old and golden under the hill.');
}

const chVec = new THREE.Vector3();
// the vault is turned to face the hall, so the box's own position is not where it
// stands: ask the scene graph for the world point, or this only ever fires in the
// caves whose vault happens not to be rotated
const chestInReach = (px, py, pz) => {
  const ch = caveRoom.chest.getWorldPosition(chVec);
  return !save.treasure.includes(caveKey) && !gate && py > ch.y - 2.2 && Math.hypot(ch.x - px, ch.z - pz) < 2.0;
};
function caveTick(dt, t) {
  caveT += dt;
  const px = player.position.x, pz = player.position.z, py = player.position.y;

  // falling water: the sheets scroll downward (offset up = pattern down), the
  // spray recycles, rings where it lands
  for (const s of caveRoom.sheets) s.tex.offset.y += dt * s.sp;
  const spray = caveRoom.splash;
  for (let i = 0; i < spray.n; i++) {
    const d = spray.dat[i], k = i * 3;
    d.y += d.vy * dt; d.vy -= 9 * dt; d.x += d.vx * dt;
    if (d.y < 0.02) {
      d.y = 0.02; d.vy = 1 + Math.random() * 2.6; d.vx = (Math.random() - 0.5) * 1.4;
      d.x = (Math.random() - 0.5) * caveRoom.fall.w; d.z = caveRoom.fall.z + 0.35 + Math.random();
    }
    spray.pos[k] = d.x; spray.pos[k + 1] = d.y; spray.pos[k + 2] = d.z;
  }
  spray.pts.geometry.attributes.position.needsUpdate = true;
  caveRoom.ripAcc = (caveRoom.ripAcc || 0) + dt;
  if (caveRoom.ripAcc > 0.30) {
    caveRoom.ripAcc = 0;
    ripple((Math.random() - 0.5) * caveRoom.fall.w * 0.9, caveRoom.fall.z + 0.4 + Math.random() * 0.7, 1.0, caveRoom.vaultG, 0.072);
  }
  caveRoom.pondAcc = (caveRoom.pondAcc || 0) + dt;
  if (caveRoom.pond && caveRoom.pondAcc > 1.5) {
    caveRoom.pondAcc = 0;
    const P = caveRoom.pond;
    ripple(P.x + (Math.random() - 0.5) * P.r, P.z + (Math.random() - 0.5) * P.r, 0.7, caveRoom.g, 0.075);
  }

  for (const c of caveRoom.crystals) {
    if (c.got) continue;
    c.g.rotation.y += dt * 0.9;
    c.g.children[0].intensity = caveRoom.glow ? 1.2 + Math.sin(t * 2 + c.x) * 0.4 : 0;
    if (caveT > 0.5 && Math.hypot(c.x - px, c.z - pz) < 1.4) {
      c.got = true; c.g.visible = false; c.light.intensity = 0;
      caveFound++;
      toast(`Crystal ${caveFound}/3 ✨`);
      sfx.gather(caveFound);
      updateObjective();
      if (caveFound >= 3) {
        // the wall does not open itself: she walks up to it and answers it.
        // light the door now, not when she blunders into it in the dark
        const d = caveRoom.doors.find((o) => o.kind === 'crystal');
        if (d) { d.quiet = false; caveBeacon(d); }
        toast('Three lights are lit — the back wall is waiting for an answer');
      }
    }
  }

  // a cache gives once, then the room is quiet
  for (const c of caveRoom.caches) {
    if (c.got || caveT < 0.4) continue;
    if (py > 2.5 || Math.hypot(c.x - px, c.z - pz) > 1.8) continue;
    c.got = true; c.g.visible = false;
    save.caches.push(c.key);
    const got = [];
    for (const [r2, n] of Object.entries(c.kit)) if (r2 !== 'col') { save.res[r2] += n; got.push(`${n} ${LABEL[r2]}`); }
    burst(new THREE.Vector3(c.x, 0.9, c.z), 0xd9c7a0, 16, 2);
    toast(`A little cache — ${got.join(' · ')} 🎁`);
    sfx.gather(2); hud(); persist();
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
    // every hidden way wants the three lights first, then a question
    if (caveFound < 3) { toast('Three lights sleep in the hall'); continue; }
    openGate({ x: d.x, z: d.z, plain: true, onPass: () => caveDoorOpen(d) });
  }

  if (caveRoom.beacon) {
    const b = caveRoom.beacon;
    b.t += dt;
    const pulse = 0.5 + 0.5 * Math.sin(b.t * 2.4);
    b.col.material.opacity = (b.t < 30 ? 0.34 : 0.12) * (0.6 + pulse * 0.4);
    b.pool.material.opacity = (b.t < 30 ? 0.5 : 0.2) * (0.55 + pulse * 0.45);
    b.pool.scale.setScalar(1 + pulse * 0.18);
    b.l.intensity = (b.t < 30 ? 4 : 1.4) * (0.6 + pulse * 0.4);
  }
  if (caveRoom.shine.visible) {
    const glowPulse = 0.5 + 0.5 * Math.sin(t * 2.2);
    const [halo, shaft, sl] = caveRoom.shine.children;
    halo.material.opacity = 0.3 + glowPulse * 0.35;
    halo.scale.setScalar(2.9 + glowPulse * 0.7);
    halo.position.y = 2.0 + Math.sin(t * 1.1) * 0.16;
    shaft.material.opacity = 0.09 + glowPulse * 0.1;
    sl.intensity = 1.6 + glowPulse * 1.4;
  }
  // the box asks before it gives
  if (chestInReach(px, py, pz)) {
    openGate({ plain: true, head: 'The old box asks one question', onPass: caveTakeTreasure });
  }

  // bats sleep on the ceiling until she runs underneath
  // frogs arrive once their GLB has landed, so build them here and not at cave-build time
  if (!caveRoom.frogs.length && caveRoom.pond && frogProto.ready) caveRoom.frogs = makeFrogs(caveRoom.g, caveRoom.pond);
  for (const f of caveRoom.frogs) frogTick(f, dt);
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

  caveRoom.mist.material.opacity = 0.3 + Math.sin(t * 1.7) * 0.09;
  caveRoom.mist.scale.set(11 + Math.sin(t * 0.8) * 1.4, 7 + Math.sin(t * 1.3) * 1.1, 1);
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

// the spec-sheet deer (buck and doe share one rig); a deer spawned before either
// lands falls back to the primitives below
const deerProto = {};
new GLTFLoader().load('/models/buck.glb', (g) => {
  g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  deerProto.buck = g.scene;
}, undefined, () => {});
new GLTFLoader().load('/models/doe.glb', (g) => {
  g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  deerProto.doe = g.scene;
}, undefined, () => {});
const CM = 1.9 / 180;    // cm -> world units for the hand-built critters (GLB deer use their own h)

// the deer that can actually walk: 46-bone rig, baked Walk / Gallop / Idle.
// Height comes off the loaded bbox so each export's units don't matter.
const ANIM_DEER = {
  doe: { file: '/models/doe_f.glb', h: 1.85 },     // reshaped: small head, slim neck, narrow chest, heavy rump
  buck: { file: '/models/stag.glb', h: 2.25 },      // to the antler tips
  rabbit: { file: '/models/rabbit_cc0.glb', h: 0.42, sh: 0.5, map: { Walk: 'Running', Gallop: 'Running', Idle: 'Basic' } },   // Čestmír Dammer, CC0
};
for (const P of Object.values(ANIM_DEER)) {
  P.src = null; P.clips = []; P.S = 0.35;
  new GLTFLoader().load(P.file, (g) => {
    g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    const bb = new THREE.Box3().setFromObject(g.scene);
    P.S = P.h / Math.max(0.001, bb.max.y - bb.min.y);
    P.src = g.scene; P.clips = g.animations;
  }, undefined, () => {});
}

function makeAnimatedDeer(x, z, kind) {
  const P = ANIM_DEER[kind];
  const g = new THREE.Group(), inst = skClone(P.src);
  inst.traverse((o) => { if (o.isMesh) o.material = o.material.clone(); });
  inst.rotation.y = P.rot || 0;
  g.add(inst);
  g.scale.setScalar(P.S);
  g.position.set(x, 0, z);
  scene.add(g);
  const mix = new THREE.AnimationMixer(inst), A = {};
  for (const n of ['Walk', 'Gallop', 'Idle', 'Idle_Headlow', 'Eating']) {
    const want = (P.map && P.map[n]) || n;
    const c = P.clips.find((k) => k.name === want) || P.clips.find((k) => k.name.split('|').pop().toLowerCase().endsWith(want.toLowerCase()));
    if (!c) continue;
    A[n === 'Idle_Headlow' ? 'low' : n === 'Eating' ? 'eat' : n.toLowerCase()] = mix.clipAction(c);
  }
  // all of them run at once and the weights cross-blend; no crossFade bookkeeping
  for (const k of ['walk', 'gallop', 'idle', 'eat']) if (A[k]) { A[k].play(); A[k].setEffectiveWeight(k === 'idle' ? 1 : 0); }
  return {
    g, kind, anim: true, A, mix, w: { walk: 0, gallop: 0, idle: 1, eat: 0 },
    K: false, hop: false, legs: [], head: null, neck: null, headBase: 0, neckBase: 0, graze: 0,
    sh: shadowBlob(P.sh || 1.1), home: new THREE.Vector2(x, z), t: 0, ph: Math.random() * 6,
    yaw: 0, spd: 0, flee: 0, idle: Math.random() * 4, gy: 0, trust: 0, fed: 0,
  };
}

function makeRiggedDeer(x, z, kind) {
  const buck = kind === 'buck', g = new THREE.Group(), inner = new THREE.Group();
  const src = deerProto[kind] || deerProto.buck || deerProto.doe;   // whichever landed first
  const borrowed = src !== deerProto[kind];   // one sheet standing in for the other
  inner.rotation.y = -Math.PI / 2;            // the asset faces +x, the world faces +z
  const B = {};
  const inst = skClone(src);
  inst.traverse((o) => {
    B[o.name] = o;
    if (o.isMesh) {
      o.material = o.material.clone();
      if (!buck && borrowed && o.material.name === 'Fur') o.material.color.setHex(0xc08a5c);
    }
  });
  if (!buck && borrowed) for (const n of ['antL', 'antR']) if (B[n]) B[n].scale.setScalar(0.001);
  inner.add(inst); g.add(inner);
  g.scale.setScalar(CM);
  g.position.set(x, 0, z);
  scene.add(g);
  return {
    g, kind, K: false, head: B.head, neck: B.neck,
    headBase: B.head.position.y, neckBase: B.neck.rotation.x, graze: -0.45,
    legs: [['frontUpL', 'frontLoL', 'frontHoofL', 1, Math.PI / 2],
           ['frontUpR', 'frontLoR', 'frontHoofR', 1, Math.PI * 1.5],
           ['hindUpL', 'hindMidL', 'hindHoofL', 0, Math.PI],
           ['hindUpR', 'hindMidR', 'hindHoofR', 0, 0]]
      .filter(([u]) => B[u])
      .map(([u, lo, ho, f, off]) => ({ pivot: B[u], lo: B[lo], ho: B[ho], front: !!f, off,
        rest: B[u].quaternion.clone(),
        restLo: B[lo] ? B[lo].quaternion.clone() : null,
        restHo: B[ho] ? B[ho].quaternion.clone() : null })),
    sh: shadowBlob(1.15), home: new THREE.Vector2(x, z), t: 0, ph: Math.random() * 6,
    yaw: 0, spd: 0, flee: 0, idle: Math.random() * 4, gy: 0, trust: 0, fed: 0,
  };
}

// hanging greenery for the caves: ivy sheets and twine ropes
const caveProps = [];
for (const f of ['vines', 'twine']) new GLTFLoader().load(`/models/${f}.glb`, (g) => {
  g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false;
    o.material = o.material.clone(); o.material.side = THREE.DoubleSide;        // leaf sheets read from both sides
    if (o.material.emissive) o.material.emissive.copy(o.material.color).multiplyScalar(0.45); } });   // cave light eats flat green
  const bb = new THREE.Box3().setFromObject(g.scene);
  caveProps.push({ src: g.scene, top: bb.max.y, tag: f });
}, undefined, () => {});

// cave frogs: Quaternius, rigged, Attack/Death/Idle/Jump. Only in caves with a spring.
const frogProto = { ready: false };
new GLTFLoader().load('/models/frog.glb', (gl) => {
  gl.scene.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
  const bb = new THREE.Box3().setFromObject(gl.scene);
  frogProto.src = gl.scene; frogProto.clips = gl.animations;
  frogProto.S = 0.34 / Math.max(0.001, bb.max.z - bb.min.z);   // 34 cm nose to tail: readable in a dim cave
  frogProto.low = bb.min.y;                                    // drop the rig until its feet touch
  frogProto.ready = true;
}, undefined, (e) => { window.__frogErr = String((e && (e.message || e)) || e); });

function makeFrogs(parent, pond) {
  if (!frogProto.ready) return [];
  const out = [];
  for (let i = 0; i < 2; i++) {
    const g = new THREE.Group(), inst = skClone(frogProto.src);
    inst.traverse((o) => { if (o.isMesh) o.material = o.material.clone(); });
    inst.position.y = -frogProto.low;
    g.add(inst);
    g.scale.setScalar(frogProto.S);
    const mix = new THREE.AnimationMixer(inst);
    const find = (n) => frogProto.clips.find((c) => c.name.endsWith('_' + n) || c.name.endsWith('|' + n));   // Frog_Idle, Frog_Jump
    const ci = find('Idle'), cj = find('Jump');
    if (!ci || !cj) return out;
    const idle = mix.clipAction(ci), jump = mix.clipAction(cj);
    idle.play(); jump.play(); jump.setEffectiveWeight(0);
    const a = i * Math.PI + 0.6;
    g.position.set(pond.x + Math.cos(a) * (pond.r + 1.1), 0, pond.z + Math.sin(a) * (pond.r + 1.1));
    parent.add(g);
    out.push({ g, mix, idle, jump, home: { x: pond.x, z: pond.z }, r: pond.r + 2.4,
               sx: g.position.x, sz: g.position.z, tx: g.position.x, tz: g.position.z,
               t: 0.8 + i * 1.6, hop: 0, dur: 0.5, peak: 0.35, yaw: 0 });
  }
  return out;
}

// hops stay leashed to the spring: pick a target inside pond.r + 2.4, arc to it, rest
function frogTick(f, dt) {
  f.mix.update(dt);
  if (f.hop > 0) {
    f.hop -= dt;
    const k = Math.min(1, 1 - f.hop / f.dur);
    f.g.position.x = f.sx + (f.tx - f.sx) * k;
    f.g.position.z = f.sz + (f.tz - f.sz) * k;
    f.g.position.y = Math.sin(k * Math.PI) * f.peak;
    f.g.rotation.y = f.yaw;
    if (f.hop <= 0) { f.g.position.y = 0; f.jump.setEffectiveWeight(0); f.idle.setEffectiveWeight(1); }
    return;
  }
  f.t -= dt;
  if (f.t > 0) return;
  const a = Math.random() * 6.283, d = Math.random() * f.r;
  const tx = f.home.x + Math.cos(a) * d, tz = f.home.z + Math.sin(a) * d;
  const dist = Math.hypot(tx - f.g.position.x, tz - f.g.position.z);
  f.sx = f.g.position.x; f.sz = f.g.position.z; f.tx = tx; f.tz = tz;
  f.dur = Math.max(0.32, dist / 2.4);
  f.peak = 0.16 + Math.min(dist, 3) * 0.08;
  f.hop = f.dur;
  f.yaw = Math.atan2(tx - f.sx, tz - f.sz);
  f.t = 0.9 + Math.random() * 2.4;
  f.jump.setEffectiveWeight(1); f.idle.setEffectiveWeight(0);
  f.jump.reset().play();
}

// the spec-sheet rabbit: 48 cm to the ear tips, 42 cm nose to tail
const rabbitProto = {};
new GLTFLoader().load('/models/rabbit.glb', (g) => {
  g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  rabbitProto.rabbit = g.scene;
}, undefined, () => {});

// A rabbit cannot walk -- it half-bounds. Both hind feet fire together, both
// front feet reach and land a beat later, and the spine curls on landing and
// straightens through the push. Four keys per hop: u 0 leaving the ground,
// 0.25 apex, 0.5 touchdown, 0.75 gather. Values are bone-local X rotation.
const HOP = {
  spine: [-0.06, 0.10, 0.30, 0.04],
  chest: [-0.04, 0.08, 0.24, 0.02],
  neck:  [ 0.08, -0.04, -0.16, 0.02],
  head:  [-0.04, 0.02, 0.10, -0.02],
  fUp:   [ 0.55, 0.20, -0.75, -0.30],
  fLo:   [-0.95, -0.45, 0.45, 0.10],
  fPaw:  [ 0.45, 0.20, 0.05, 0.10],
  hUp:   [ 0.90, 0.35, -0.15, 0.60],
  hLo:   [-1.05, -0.50, 0.20, -0.70],
  hPaw:  [ 0.50, 0.10, -0.05, 0.30],
  ear:   [ 0.26, 0.08, -0.10, 0.16],
};
function hopKey(a, u) {   // four keys, cosine-eased between neighbours
  const f = (((u % 1) + 1) % 1) * 4, i = Math.floor(f) % 4, w = f - Math.floor(f);
  const s = 0.5 - 0.5 * Math.cos(w * Math.PI);
  return a[i] * (1 - s) + a[(i + 1) % 4] * s;
}

function makeRiggedRabbit(x, z) {
  const g = new THREE.Group(), inner = new THREE.Group(), B = {};
  const inst = skClone(rabbitProto.rabbit);
  inst.traverse((o) => { B[o.name] = o; if (o.isMesh) o.material = o.material.clone(); });
  inner.add(inst);
  inner.rotation.y = -Math.PI / 2;            // asset faces +x, the world faces +z
  g.add(inner); g.scale.setScalar(CM); g.position.set(x, 0, z);
  scene.add(g);
  const rig = [];
  const add = (n, k, side = 0) => { if (B[n]) rig.push({ b: B[n], rest: B[n].quaternion.clone(), k, side }); };
  add('spine', 'spine'); add('chest', 'chest'); add('neck', 'neck'); add('head', 'head');
  add('earL', 'ear'); add('earR', 'ear', 0.02);
  for (const s of ['L', 'R']) {
    const d = s === 'L' ? 0 : 0.04;           // the front feet land a few ms apart
    add('frontUp' + s, 'fUp', d); add('frontLo' + s, 'fLo', d); add('frontPaw' + s, 'fPaw', d);
    add('hindUp' + s, 'hUp'); add('hindLo' + s, 'hLo'); add('hindPaw' + s, 'hPaw');
  }
  return {
    g, kind: 'rabbit', K: true, hop: true, rig,
    legs: [], head: null, neck: null, headBase: 0, neckBase: 0, graze: 0,
    sh: shadowBlob(0.55), home: new THREE.Vector2(x, z), t: 0, ph: Math.random() * 6,
    yaw: 0, spd: 0, flee: 0, idle: Math.random() * 4, gy: 0, trust: 0, fed: 0,
  };
}

function makeDeer(x, z, kind = 'doe') {
  const K = kind === 'rabbit', buck = kind === 'buck';
  // the rigged CC-BY rabbit carries its own idle/walk clips, so it rides the
  // deer animation path; K stays true so it keeps rabbit speed and stays unfed
  if (K && ANIM_DEER.rabbit.src) {
    const r = Object.assign(makeAnimatedDeer(x, z, 'rabbit'), { K: true });
    // asset fur is baseColor 0.18/0.10/0.04 at metalness 0.4 -> a black blob at 48 cm
    r.g.traverse((o) => {
      if (!o.isMesh) return;
      const m = (o.material = o.material.clone()), n = m.name;
      m.metalness = 0; m.roughness = 0.9;
      m.color.set(n === 'Fur_white' ? 0xe4d6c0 : n === 'Black' ? 0x2b2521 : 0xffffff);
    });
    return r;
  }
  if (K && rabbitProto.rabbit) return makeRiggedRabbit(x, z);
  if (!K && ANIM_DEER[kind] && ANIM_DEER[kind].src) return makeAnimatedDeer(x, z, kind);
  if (!K && (deerProto.buck || deerProto.doe)) return makeRiggedDeer(x, z, kind);
  const g = new THREE.Group();
  const brown = toon({ color: K ? 0xcfc3b4 : buck ? 0x9a5b36 : 0xb08355 });
  const coat = toon({ color: K ? 0xcfc3b4 : buck ? 0x7a4526 : 0x916742 });
  const legMat = toon({ color: K ? 0xefe6d6 : 0x6d4a33 });
  const cream = toon({ color: 0xefe6d6 }), bone = toon({ color: 0xe9dcbe }), dark = toon({ color: 0x241c19 });
  let body, neck, head;
  if (K) {
    body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), brown);
    body.scale.set(1, 1.15, 1.6); body.position.y = 1.15;
    neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.7, 5), brown);
    neck.position.set(0, 1.7, 0.55); neck.rotation.x = -0.35;
    head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 7, 5), brown);
    head.position.set(0, 2.0, 0.78);
    const rump2 = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), brown);
    rump2.position.set(0, 1.35, -0.84);
    g.add(body, neck, head, rump2);
    for (const sx of [-0.12, 0.12]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.5, 4), brown);
      ear.position.set(sx, 1.0, 0.5); ear.rotation.z = sx * 0.3; g.add(ear);
    }
    g.scale.setScalar(0.55);
  } else {
    // a deer, not a barrel: shallow body, long legs, slim neck, small skull
    body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 9, 7), brown);
    body.scale.set(0.55, 0.8, 1.85); body.position.y = 1.18; body.castShadow = true;
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), coat);
    chest.position.set(0, 1.22, 0.66); chest.scale.set(0.92, 1.15, 0.95); chest.castShadow = true;
    const haunch = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), coat);
    haunch.position.set(0, 1.26, -0.66); haunch.scale.set(0.98, 1.15, 0.98); haunch.castShadow = true;
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), cream);
    belly.position.set(0, 0.85, 0.02); belly.scale.set(0.75, 0.4, 1.4);
    neck = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.135, 0.95, 6), brown);
    neck.position.set(0, 1.62, 0.76); neck.rotation.x = -0.6; neck.castShadow = true;
    const throat = new THREE.Mesh(new THREE.SphereGeometry(0.1, 7, 5), cream);
    throat.position.set(0, 1.6, 0.96); throat.scale.set(0.62, 1.7, 0.55);
    head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 8, 6), coat);
    head.position.set(0, 2.03, 1.06); head.scale.set(1, 0.9, 1.2); head.castShadow = true;
    // the tapered muzzle is the whole difference between "deer" and "goat ball"
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.042, 0.44, 6), brown);
    muzzle.position.set(0, 1.98, 1.3); muzzle.rotation.x = Math.PI / 2 - 0.22;
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), cream);
    jaw.position.set(0, 1.92, 1.24); jaw.scale.set(0.85, 0.75, 1.25);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.042, 6, 5), dark);
    nose.position.set(0, 2.0, 1.5);
    const rump = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), cream);
    rump.position.set(0, 1.2, -0.8); rump.scale.set(0.95, 0.8, 0.35);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.3, 5), brown);
    tail.position.set(0, 1.42, -1.0); tail.rotation.x = -1.37;
    g.add(body, chest, haunch, belly, neck, throat, head, muzzle, jaw, nose, rump, tail);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 5), dark);
      eye.position.set(sx * 0.1, 2.05, 1.14);
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.42, 5), coat);
      ear.position.set(sx * 0.17, 2.12, 1.0);
      ear.rotation.z = sx * 1.2; ear.rotation.x = -0.1; ear.scale.z = 0.45;
      const cup = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.34, 5), cream);
      cup.position.set(0, -0.03, 0.06); cup.scale.set(1, 0.85, 0.4); ear.add(cup);
      g.add(eye, ear);
      if (buck) {   // pedicle, one curved beam swept out and back, brow tine + three points
        const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.058, 0.13, 5), bone);
        ped.position.set(sx * 0.07, 2.14, 1.02); ped.rotation.z = -sx * 0.22;
        const curve = new THREE.CatmullRomCurve3([[0.08, 2.2, 1.02], [0.2, 2.34, 0.98], [0.3, 2.46, 0.86], [0.36, 2.5, 0.68]]
          .map(([x, y, z]) => new THREE.Vector3(sx * x, y, z)));
        const beam = new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.032, 4, false), bone);
        beam.castShadow = true;
        g.add(ped, beam);
        for (const [tt, len, rx] of [[0.28, 0.28, 0.9], [0.66, 0.26, 0.4]]) {
          const pt = curve.getPoint(tt);   // root the tine on the beam, never beside it
          const tine = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.022, len, 4), bone);
          tine.position.set(pt.x, pt.y + Math.cos(rx) * len * 0.5, pt.z + Math.sin(rx) * len * 0.5);
          tine.rotation.x = rx; tine.rotation.z = -sx * 0.15;
          g.add(tine);
        }
      }
    }
  }
  // hips at the top of each leg so they can swing, not just slide
  const HIP = K ? 1.02 : 1.12, LEN = K ? 1.02 : 1.12, legs = [];
  for (const [sx, sz] of (K ? [[-0.22, 0.4], [0.22, 0.4], [-0.22, -0.4], [0.22, -0.4]] : [[-0.22, 0.55], [0.22, 0.55], [-0.22, -0.55], [0.22, -0.55]])) {
    const pivot = new THREE.Group();
    pivot.position.set(sx, HIP, sz);
    const hind = !K && sz < 0, upper = LEN * (hind ? 0.6 : 1);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(K ? 0.06 : hind ? 0.095 : 0.072, K ? 0.045 : 0.045, upper, 4).translate(0, -upper / 2, 0), legMat);
    leg.castShadow = true;
    pivot.add(leg);
    if (!K) {
      // a haunch blob at the hip keeps the leg from reading as a stick
      const thi = new THREE.Mesh(new THREE.SphereGeometry(0.11, 7, 5), brown);
      thi.position.set(0, -0.06, sz > 0 ? -0.02 : 0.02); thi.scale.set(0.85, 1.2, 1.0);
      pivot.add(thi);
      if (hind) {
        // hock: shank hinged back off the thigh, so the hind leg reads angular
        const sl = LEN * 0.47, hock = new THREE.Group();
        hock.position.set(0, -upper, 0); hock.rotation.x = -0.55;
        const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.036, sl, 4).translate(0, -sl / 2, 0), legMat);
        shank.castShadow = true;
        const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.075, 0.13), dark);
        hoof.position.set(0, -sl + 0.03, 0.02);
        hock.add(shank, hoof);
        pivot.add(hock);
      } else {
        const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.075, 0.13), dark);
        hoof.position.set(0, -LEN + 0.03, 0.02);
        pivot.add(hoof);
      }
    }
    g.add(pivot);
    legs.push({ pivot, len: LEN, hip: HIP, front: sz > 0 });
  }
  if (!K) g.scale.setScalar(buck ? 1.06 : 0.97);
  g.position.set(x, 0, z);
  scene.add(g);
  outline(g, 1.07);
  return {
    g, kind, K, legs, head, neck, sh: shadowBlob(K ? 0.75 : 1.15),
    headBase: K ? 2.0 : 2.03, neckBase: K ? -0.35 : -0.6, graze: -0.4,
    home: new THREE.Vector2(x, z), t: 0, ph: Math.random() * 6, yaw: 0, spd: 0,
    flee: 0, idle: Math.random() * 4, gy: 0, trust: 0, fed: 0,
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


function feedDeer(d) {
  if (save.res.bloom < 2) { toast('A deer likes 2 Bloom.'); return; }
  save.res.bloom -= 2;
  d.trust = 1; d.fed = 8;
  burst(new THREE.Vector3(d.g.position.x, 1.5, d.g.position.z), 0xffd0e4, 14, 2.2);
  sfx.chime(); hud(); persist();
  toast('The deer eats from your hand 🌿');
}

const deer = [];
let stillT = 0, pPrevX = 0, pPrevZ = 0, deerToast = false;
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

  // how still she is: a deer will walk up to someone who holds still
  const pSpd = Math.hypot(player.position.x - pPrevX, player.position.z - pPrevZ) / Math.max(dt, 0.001);
  pPrevX = player.position.x; pPrevZ = player.position.z;
  stillT = pSpd < 0.25 ? stillT + dt : 0;
  for (const d of deer) {
    if (d.frozen && !d.wip) continue;
    const dx = d.g.position.x - player.position.x, dz = d.g.position.z - player.position.z;
    const dist = Math.hypot(dx, dz) || 1;
    if (d.fed > 0) d.fed -= dt;
    if (!d.trust && stillT > 4 && dist < 22 && !inCave && !inBoat) {
      d.trust = 1;
      if (!deerToast) { deerToast = true; toast('A deer comes closer — stand still'); sfx.blip(660, 0.4, 'sine', 0.07); }
    }
    // a stumble does not spook it — she has to actually walk off
    if (d.trust && pSpd > 0.9) d.walkT = (d.walkT || 0) + dt; else d.walkT = 0;
    if (d.trust && (d.walkT > 0.25 || dist > 26 || inCave || inBoat)) { d.trust = 0; d.walkT = 0; }
    if (dist < 9 && !(d.trust && pSpd < 2.4)) d.flee = 1.8;
    let tx, tz, want;
    if (d.fed > 0) {   // eating from her hand: stand still, head down
      tx = d.g.position.x; tz = d.g.position.z; want = 0;
    } else if (d.flee > 0) {
      d.flee -= dt;
      tx = d.g.position.x + (dx / dist) * 12;
      tz = d.g.position.z + (dz / dist) * 12;
      want = d.K ? 9 : 5.4;
    } else if (d.trust) {
      const stop = 4.2;
      tx = player.position.x + (dx / dist) * stop;
      tz = player.position.z + (dz / dist) * stop;
      want = dist > stop + 0.5 ? 1.35 : 0;
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
    if (!d.wip) d.spd += (want - d.spd) * Math.min(1, dt * (want > d.spd ? 6 : 8));
    if (d.spd > 0.03 && !d.wip) {
      const ax = tx - d.g.position.x, az = tz - d.g.position.z;
      const am = Math.hypot(ax, az) || 1;
      const nx = d.g.position.x + (ax / am) * d.spd * dt;
      const nz = d.g.position.z + (az / am) * d.spd * dt;
      // deer hold the bank. If they are somehow already out there, let them walk
      // back in rather than freeze mid-lake
      if (inWater(d.g.position.x, d.g.position.z, 1.0) || !inWater(nx, nz, 1.0)) {
        d.g.position.x = nx;
        d.g.position.z = nz;
      }
      const tgt = Math.atan2(ax, az);
      d.yaw += (((tgt - d.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 5);
      d.g.rotation.y = d.yaw;
    }
    if (d.trust && d.spd < 0.2) {   // stopped: turn to look at her
      const fy = Math.atan2(-dx, -dz);
      d.yaw += (((fy - d.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 3);
      d.g.rotation.y = d.yaw;
    }
    // stride follows ground covered: one hop per 0.42 units for the rabbit
    d.ph += (d.spd * dt / (d.hop ? 0.42 : d.K ? 0.95 : 1.4)) * Math.PI * 2;
    const gallop = d.spd > 3.4;
    // follow the hills
    d.gy += (Math.max(hillAt(d.g.position.x, d.g.position.z), 0) - d.gy) * Math.min(1, dt * 6);
    if (d.anim) {
      // baked clips, weight-blended: walk below a trot, gallop when she bolts
      const s = d.spd, W = d.w;
      const tg = Math.min(1, Math.max(0, (s - 2.6) / 1.4));
      W.gallop += (tg - W.gallop) * Math.min(1, dt * 4);
      W.walk += (Math.min(1, s / 0.9) * (1 - tg) - W.walk) * Math.min(1, dt * 4);
      // fed from her hand and holding still: head goes down and chews
      W.eat += ((d.fed > 0 && s < 0.3 ? 1 : 0) - W.eat) * Math.min(1, dt * 3);
      W.idle = Math.max(0, 1 - W.walk - W.gallop - W.eat);
      if (d.A.walk) { d.A.walk.setEffectiveWeight(W.walk); d.A.walk.timeScale = Math.min(2, Math.max(0.55, s / 1.3)); }
      if (d.A.gallop) { d.A.gallop.setEffectiveWeight(W.gallop); d.A.gallop.timeScale = Math.min(1.7, Math.max(0.6, s / 7)); }
      if (d.A.idle) d.A.idle.setEffectiveWeight(W.idle);
      if (d.A.eat) d.A.eat.setEffectiveWeight(W.eat);
      d.mix.update(dt);
      d.g.position.y = d.gy;
    } else if (d.hop) {
      // half-bound: the pose is keyed off the hop phase, and the body only
      // leaves the ground over the first half of it
      const u = d.holdU ?? (((d.ph / (Math.PI * 2)) % 1 + 1) % 1);
      const sp = Math.min(1, d.spd / 2.0);
      for (const e of d.rig) {
        e.b.quaternion.copy(e.rest).multiply(_qx.setFromAxisAngle(_AX, hopKey(HOP[e.k], u + e.side) * sp));
      }
      const air = Math.max(0, Math.sin(u * Math.PI * 2));
      d.g.position.y = d.gy + air * (0.08 + 0.22 * sp) * (d.g.scale.x / CM);
    } else {
      const amp = (gallop ? 0.85 : 0.50) * Math.min(1, d.spd / 1.1);
      // four-beat walk: lateral sequence LH->LF->RH->RF. Hip retracts through stance
      // and swings forward in recovery; the knee folds only during swing -- front
      // carpus back, hind hock forward. Stance must be the half of the cycle where
      // the hoof sweeps backward (that is +hip), recovery the half where it lifts.
      const duty = 0.5;
      d.legs.forEach((l, i) => {
        const off = l.off ?? (gallop ? (l.front ? 0 : Math.PI) : ((i % 2) * Math.PI + (l.front ? 0 : Math.PI)));
        const u = (((d.ph + off) / (Math.PI * 2)) % 1 + 1) % 1;     // 0..1 through the stride
        // -cos: hoof starts forward, sweeps back over the planted half, then recovers
        const hip = -Math.cos(u * Math.PI * 2) * amp;
        // bones carry a rest quaternion, so pose = rest * (rotation about bone-local X)
        if (l.rest) l.pivot.quaternion.copy(l.rest).multiply(_qx.setFromAxisAngle(_AX, hip));
        else l.pivot.rotation.x = hip;
        if (!l.lo) return;
        const swing = u > duty;
        const k = swing ? Math.sin(((u - duty) / (1 - duty)) * Math.PI) : 0;
        const knee = k * amp * (l.front ? 1.3 : -1.3);
        if (l.restLo) l.lo.quaternion.copy(l.restLo).multiply(_qx.setFromAxisAngle(_AX, knee));
        if (l.restHo) l.ho.quaternion.copy(l.restHo).multiply(_qx.setFromAxisAngle(_AX, -(hip + knee)));
      });
      d.g.position.y = d.gy + Math.abs(Math.sin(d.ph)) * (gallop ? 0.14 : 0.03);
      d.head.position.y = d.headBase + Math.sin(d.ph * 2) * (gallop ? 0.05 : 0.015);
      d.neck.rotation.x = d.neckBase + Math.sin(d.ph) * (gallop ? 0.08 : 0.02);
      if (d.trust && d.spd < 0.3 && !d.K) {   // stopped close: head down, grazing
        d.neck.rotation.x = d.neckBase + d.graze;
        d.head.position.y = d.headBase - 0.21 + Math.sin(t * 1.4 + d.ph) * 0.035;
      }
    }
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

// ---------------------------------------------------------------- water fx
// one ring geometry, a fresh material per ripple: cheap, and they all expire
const ripples = [];
const rippleGeo = new THREE.RingGeometry(0.8, 1, 18);
function ripple(x, z, sc = 1, parent = scene, y = 0.078) {
  const m = new THREE.Mesh(rippleGeo, new THREE.MeshBasicMaterial({
    color: 0xe8f7ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, fog: false,
  }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.scale.setScalar(0.25 * sc);
  parent.add(m);
  ripples.push({ m, t: 0, sc });
}
function rippleTick(dt) {
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    r.t += dt;
    const k = r.t / 1.1;
    if (k >= 1) { r.m.removeFromParent(); r.m.material.dispose(); ripples.splice(i, 1); continue; }
    r.m.scale.setScalar((0.25 + k * 1.7) * r.sc);
    r.m.material.opacity = 0.5 * (1 - k);
  }
}
const pondDir = (pd) => {
  const dx = pd.x - player.position.x, dz = pd.z - player.position.z, d = Math.hypot(dx, dz) || 1;
  return new THREE.Vector3(dx / d, 0, dz / d);
};

// ---------------------------------------------------------------- fishing
// the rod is a child of her right arm, so one rotation swings arm and rod together
const LINE_N = 14;
let rodG = null, fishLine = null, bobM = null, catchProp = null;
const _tip = new THREE.Vector3();
const _qx = new THREE.Quaternion();
const _qy = new THREE.Quaternion();
const _qz = new THREE.Quaternion();
const _AZ = new THREE.Vector3(0, 0, 1);
const _AY = new THREE.Vector3(0, 1, 0);
const _AX = new THREE.Vector3(1, 0, 0);
function rigRod() {
  if (rodG) return;
  const { arms } = player.userData;
  rodG = new THREE.Group();
  // the forearm is its own group now, so the rod rides the elbow if there is one
  const hold = player.userData.elbows ? player.userData.elbows[1] : arms[1];
  rodG.position.set(0, player.userData.elbows ? -0.2 : -0.42, 0);
  rodG.rotation.x = 0.62;    // tip up off the arm line, so it reads as a held rod not an arm extension
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.04, 1.5, 5).translate(0, -0.75, 0), mat({ color: 0xe6d3a3 }));
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.16, 6), mat({ color: 0x33241a }));
  grip.position.y = -0.06;
  const tip = new THREE.Object3D();
  tip.position.set(0, -1.53, 0);
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
  bead.position.y = -1.5;
  rodG.add(pole, grip, tip, bead);
  rodG.userData.tip = tip;
  rodG.visible = false;
  hold.add(rodG);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LINE_N * 3), 3));
  fishLine = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xf6f2e2, transparent: true, opacity: 0.8 }));
  fishLine.frustumCulled = false;
  fishLine.visible = false;
  scene.add(fishLine);

  bobM = new THREE.Group();
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), new THREE.MeshBasicMaterial({ color: 0xe4483f }));
  const bot = new THREE.Mesh(new THREE.SphereGeometry(0.062, 8, 6), new THREE.MeshBasicMaterial({ color: 0xf6f2e2 }));
  bot.position.y = -0.055;
  bobM.add(top, bot);
  bobM.visible = false;
  scene.add(bobM);
}
function rodTip() {
  player.updateMatrixWorld(true);
  rodG.userData.tip.getWorldPosition(_tip);
  return _tip.clone();
}
function lineTo(a, b, sag) {
  const p = fishLine.geometry.attributes.position;
  for (let i = 0; i < LINE_N; i++) {
    const k = i / (LINE_N - 1);
    p.setXYZ(i,
      a.x + (b.x - a.x) * k,
      a.y + (b.y - a.y) * k - sag * Math.sin(Math.PI * k),
      a.z + (b.z - a.z) * k);
  }
  p.needsUpdate = true;
}
function dropFish() {
  if (fishing) { fishing = null; }
  actEl.classList.remove('bite');
  if (rodG) rodG.visible = false;
  if (fishLine) fishLine.visible = false;
  if (bobM) bobM.visible = false;
  if (catchProp) { scene.remove(catchProp); catchProp = null; }
}
function petFluffy() {
  if (petT > 0 || (catSit < 0.35 && catLie < 0.35)) return;
  petT = 1.8;
  idleT = 0;
  sfx.blip(300, 0.22, 'sine', 0.08);
  sfx.chime();
  burst(fluffy.position.clone().setY(fluffy.position.y + 0.7), 0xff9fd0, 12, 1.6);
  // ponytail: a straight 28% roll, no pity timer — add one if the dry streaks annoy her
  if (Math.random() < 0.28) {
    const k = ['wood', 'stone', 'bloom', 'spark'][(Math.random() * 4) | 0];
    save.res[k] = (save.res[k] || 0) + 1;
    hud(); persist();
    toast(`Fluffy found a ${LABEL[k]} for you 🐾`);
  } else {
    toast('Fluffy purrs. Everything slows down for a minute.');
  }
}
function startFish() {
  if (fishing) return;
  const q = nearestPond();
  if (!q) return;
  rigRod();
  rodG.visible = true; fishLine.visible = true; bobM.visible = true;
  const { arms } = player.userData;
  arms[1].rotation.x = 1.15;   // +X is forward on these bones; -X swung the rod behind her
  const land = player.position.clone().addScaledVector(pondDir(q.pd), 4.5).setY(0.07);
  fishing = { t: 0, phase: 'cast', pd: q.pd, land, from: rodTip(), wait: 1.2 + Math.random() * 1.6, bob: land.clone(), rip: 0 };
  bobM.position.copy(fishing.from);
  lineTo(fishing.from, fishing.from, 0.1);
  actEl.textContent = 'Wait…';
  sfx.blip(380, 0.09, 'triangle', 0.08);
}
function fishTick(dt) {
  if (!fishing) return;
  const f = fishing;
  f.t += dt;
  const tip = rodTip();
  if (f.phase === 'cast') {
    const k = Math.min(1, f.t / 0.5);
    f.bob.lerpVectors(f.from, f.land, k);
    f.bob.y += Math.sin(Math.PI * k) * 1.2;
    if (k >= 1) {
      f.phase = 'wait'; f.t = 0; f.bob.copy(f.land);
      ripple(f.land.x, f.land.z, 1.1);
      burst(f.land.clone().setY(0.2), 0xbfe9ff, 8, 1.2);
      sfx.splash();
    }
  } else if (f.phase === 'wait') {
    f.bob.y = 0.07 + Math.sin(f.t * 2.4) * 0.018;
    f.rip += dt;
    if (f.rip > 1.6) { f.rip = 0; ripple(f.bob.x, f.bob.z, 0.6); }
    if (f.t > f.wait) { f.phase = 'bite'; f.t = 0; actEl.textContent = 'Reel!'; actEl.classList.add('bite'); sfx.blip(520, 0.12, 'square', 0.18); }
  } else if (f.phase === 'bite') {
    const dip = Math.abs(Math.sin(f.t * 15)) * Math.max(0, 1 - f.t / 0.7);
    f.bob.y = 0.07 - dip * 0.16;
    if (dip > 0.1 && Math.random() < 0.2) ripple(f.bob.x, f.bob.z, 0.7);
    if (f.t > 1.5) { f.phase = 'miss'; f.t = 0; actEl.classList.remove('bite'); actEl.textContent = 'Fish'; f.bob.y = 0.07; toast('It got away. Try again.'); sfx.oops(); }
  } else if (f.phase === 'reel') {
    const k = Math.min(1, f.t / 0.5);
    f.bob.lerpVectors(f.land, tip, k);
    f.bob.y += Math.sin(Math.PI * k) * 0.5;
    if (k >= 1) {
      f.phase = 'show'; f.t = 0;
      const kind = landCatch();
      // hold it at chest height out where the rod points, never up over her head
      f.hold = tip.clone();
      f.hold.y = player.position.y + 1.15;
      if (kind) {
        catchProp = catchMesh(kind);
        catchProp.position.copy(f.hold);
        scene.add(catchProp);
      }
      f.bob.copy(tip);
      ripple(f.land.x, f.land.z, 1.4);
      burst(f.land.clone().setY(0.2), 0xdff3ff, 10, 1.6);
    }
  } else if (f.phase === 'miss') {
    f.bob.y += (0.07 - f.bob.y) * Math.min(1, dt * 6);
    if (f.t > 0.9) { dropFish(); return; }
  } else if (f.phase === 'show') {
    if (catchProp) {
      catchProp.position.copy(f.hold);
      catchProp.position.y += Math.sin(f.t * 8) * 0.05;
      catchProp.rotation.y += dt * 6;
    }
    if (f.t > 1.5) { dropFish(); return; }
  }
  bobM.position.copy(f.bob);
  bobM.visible = fishLine.visible = f.phase !== 'show';
  const sag = f.phase === 'wait' || f.phase === 'bite' ? 0.55 : f.phase === 'cast' ? 0.2 : 0.08;
  lineTo(tip, f.bob, sag);
}
function catchMesh(kind) {
  const g = new THREE.Group();
  if (kind === 'fish') {
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.36, 6), mat({ color: 0xd98b3a }));
    body.rotation.x = -Math.PI / 2;
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.2, 4), mat({ color: 0xc2742a }));
    tail.rotation.x = Math.PI / 2;
    tail.position.z = -0.26;
    g.add(body, tail);
  } else if (kind === 'bottle') {
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.34, 8), new THREE.MeshStandardMaterial({ color: 0x9fd8c0, transparent: true, opacity: 0.55, roughness: 0.2 }));
    const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 6), mat({ color: 0xfdf6ec }));
    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.07, 6), mat({ color: 0xa5794a }));
    cork.position.y = 0.19;
    g.add(glass, paper, cork);
  } else {
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.3), mat({ color: 0x5a3b28 }));
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.36), mat({ color: 0x2f2018 }));
    sole.position.set(0, -0.11, 0.03);
    g.add(boot, sole);
  }
  g.scale.setScalar(1.6);
  return g;
}

function landCatch() {
  const r = Math.random();
  let acc = 0, kind = 'fish', label = CATCHES[0][1];
  for (const [k, l, w] of CATCHES) { acc += w; if (r <= acc) { kind = k; label = l; break; } }
  if (Math.random() < 0.1) { toast('Nothing this time — the pond is being shy.'); sfx.oops(); return null; }
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
  burst(rodTip(), 0x9fe0ff, 16, 3);
  persist(); hud(); checkBadges();
  return kind;
}
let skipStone = null, throwT = 0, skipThrows = 0, skipRestUntil = 0;
const SKIP_REST = 6000;                              // ms on the bank after five throws
const skipCool = () => Math.max(0, (skipRestUntil - performance.now()) / 1000);
function startSkips() {
  if (performance.now() < skipRestUntil) return;     // the arm needs a rest
  if (++skipThrows % 5 === 0) skipRestUntil = performance.now() + SKIP_REST;
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
  if (!mini) return;
  const acc = 1 - Math.abs(mini.x);
  mini = null;
  $('#mini').hidden = true;
  const q = nearestPond();
  if (!q) return;
  const d = pondDir(q.pd);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 7), mat({ color: 0x9aa0a6 }));
  m.position.copy(player.position).addScaledVector(d, 0.55);
  m.position.y = 1.0;
  scene.add(m);
  // the meter sets the throw: a good tap is faster and flatter-facing, so it skips more
  const spd = 5 + acc * 5.5, up = 1.9 + acc * 2.0;
  skipStone = { m, v: new THREE.Vector3(d.x * spd, up, d.z * spd), hops: 0 };
  throwT = 0.35;
  sfx.blip(660, 0.08, 'triangle', 0.1);
}
function skipTick(dt) {
  if (!skipStone) return;
  const s = skipStone;
  s.acc = (s.acc || 0) + dt;
  s.v.y -= 5.4 * dt;
  s.m.position.addScaledVector(s.v, dt);
  s.m.rotation.x += dt * 9;
  if (s.m.position.y <= 0.075 && s.v.y < 0) {
    if (s.hops < 9 && s.v.y < -0.7) {
      s.hops++;
      s.v.y *= -0.5; s.v.x *= 0.72; s.v.z *= 0.72;
      s.m.position.y = 0.078;
      ripple(s.m.position.x, s.m.position.z, 0.7);
      burst(s.m.position.clone().setY(0.12), 0xdff3ff, 4, 0.7);
      sfx.blip(520 + s.hops * 45, 0.05, 'sine', 0.05);
    } else { endSkips(s.hops); return; }
  }
  if (s.m.position.y < -1 || Math.hypot(s.m.position.x - player.position.x, s.m.position.z - player.position.z) > 40) endSkips(s.hops);
}
function endSkips(n) {
  const s = skipStone;
  if (!s) return;
  skipStone = null;
  ripple(s.m.position.x, s.m.position.z, 1.7);
  sfx.splash();
  scene.remove(s.m);
  if (n > (save.bestSkip || 0)) save.bestSkip = n;
  logJournal(`Skipped a stone ${n} time${n === 1 ? '' : 's'}.`);
  toast(n ? `${n} skip${n === 1 ? '' : 's'}! Best: ${save.bestSkip}` : 'Splash. Straight down.');
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
  // nearestPond() answers with the nearest LOADED pond, which can be far off.
  // Folding used to launch the boat onto that distant water, so nothing happened
  // on screen. It has to be water she is standing next to.
  const q = nearestPond();
  if (!q || q.d > 6) { toast('Fold it near water.'); return; }
  if (save.res.bloom < 2) { toast('Needs 2 Bloom to fold a paper boat.'); return; }
  save.res.bloom -= 2; hud(); persist();
  const pd = q.pd;
  // a folded paper boat: pale hull, one upright sail, launched on the near shore
  const m = new THREE.Group();
  const paper = mat({ color: 0xfdf6ec });
  const hull = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.5, 4), paper);
  hull.rotation.x = Math.PI; hull.rotation.y = Math.PI / 4; hull.position.y = 0.1; hull.scale.set(1, 1, 0.55);
  const sail = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.46, 3), paper);
  sail.position.y = 0.44; sail.rotation.y = Math.PI / 6;
  m.add(hull, sail);
  const dx = player.position.x - pd.x, dz = player.position.z - pd.z;
  const dl = Math.hypot(dx, dz) || 1;
  m.position.set(pd.x + (dx / dl) * pd.r * 0.86, 0.12, pd.z + (dz / dl) * pd.r * 0.86);
  scene.add(m);
  sfx.splash();
  paperBoats.push({ m, pd, a: Math.atan2(dz / dl, dx / dl) });
  logJournal('Folded a paper boat and set it on the water.');
  toast('A paper boat sails away ⛵');
}

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
let regionNow = regionKey(player.position.x, player.position.z);
let lastGate = -99, walk = 0, mapAcc = 0, bridgeY = 0, mapYaw = player.rotation.y;
const MAP_TURN = 3;   // marker catch-up per second; drop toward 3 for a heavier lag, raise for a snappier nose
// asked-once-per-thing, this session only: nobody wants the boat quiz twice
const gateSeen = new Set();
const SPD = 6.4, STRIDE = 4.7;
let vel = 0, turnRate = 0, leanZ = 0, leanV = 0, pitchX = 0, pitchV = 0, swingE = 0, lastStep = 0, camNear = 9.6;
const dir = new THREE.Vector3(0, 0, 1), lookAt = new THREE.Vector3(), UPV = new THREE.Vector3(0, 1, 0);
let fPh = 0, earA = 0, earV = 0, idleT = 0, catSit = 0, catLie = 0, petT = 0, tailA = 0, tailV = 0;
const camRay = new THREE.Raycaster();
const CAM_SOLID = [];
const spring = (x, v, tgt, k, d, dt) => { v += ((tgt - x) * k - v * d) * dt; return [x + v * dt, v]; };
let stepAcc = 0, saveAcc = 0, rebuildAcc = 0, skyAcc = 0, started = false;
const fwd = new THREE.Vector3(), right = new THREE.Vector3(), want = new THREE.Vector3();

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  // the map repaints 5x a second, so the body's 8/s turn still lands as a jump.
  // lag the drawn heading a little further and the marker stops swivelling; both
  // the arrow and the nose offset read mapYaw, so the geometry stays consistent
  mapYaw += ((((player.rotation.y - mapYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI)) * Math.min(1, dt * MAP_TURN);

  // movement
  let mx = input.x, my = input.y;
  if (keys.has('w') || keys.has('arrowup')) my -= 1;
  if (keys.has('s') || keys.has('arrowdown')) my += 1;
  if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
  if (keys.has('d') || keys.has('arrowright')) mx += 1;
  if (asleep || bigOpen || gate || riding || !$('#paint').hidden) { mx = 0; my = 0; }
  if (fishing || mini || skipStone) {
    if (Math.hypot(mx, my) > 0.2) { if (fishing) dropFish(); if (mini) { mini = null; $('#mini').hidden = true; } }
    mx = 0; my = 0;
  }
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
    // ponytail: 8 m/s vertical ease hides the 0.35 m tread lip; a real step-up
    // animation is the upgrade if it ever reads as sliding
    player.position.y = inCave
      ? player.position.y + THREE.MathUtils.clamp(bridgeY - player.position.y, -8 * dt, 8 * dt)
      : bridgeY + Math.abs(Math.sin(walk)) * 0.035 * Math.min(1, vel / 4);
  } else {
    vel = 0;
    turnRate *= 0.85;
    if (!riding) player.position.y += (bridgeY - player.position.y) * 0.25;
  }

  // ground height is a property of where you stand, not of whether you move
  bridgeY = groundAt(player.position.x, player.position.z);
  if (!moving) player.position.y += (bridgeY - player.position.y) * Math.min(1, dt * 8);
  if (riding) rideTick(dt);   // last word on her position this frame

  swingE += ((moving && !inBoat ? 0.55 : 0) - swingE) * Math.min(1, dt * 10);
  const { arms, legs } = player.userData;
  const elbowT = [0.16, 0.16];
  if (inBoat) {
    for (const l of legs) { l.rotation.x = -1.5; l.visible = false; }  // knees under the dress
    for (const a of arms) { a.rotation.x = -0.95; a.rotation.z *= 0.6; }
  } else {
    for (const l of legs) l.visible = true;
    legs[0].rotation.x = Math.sin(walk) * swingE;
    legs[1].rotation.x = -Math.sin(walk) * swingE;
    // arms lag the legs a few frames, are not quite symmetrical, and splay out a
    // little more the faster she goes
    const sw = Math.sin(walk - 0.3) * swingE;
    arms[0].rotation.x = -sw * 0.55;
    arms[1].rotation.x = sw * 0.68;
    arms[0].rotation.z = 0.07 + swingE * 0.05;
    arms[1].rotation.z = -0.07 - swingE * 0.05;
    elbowT[0] = 0.08 + Math.max(0, -sw) * 0.32;   // the forearm folds on the forward swing
    elbowT[1] = 0.08 + Math.max(0, sw) * 0.32;
  }
  // hands: the rod, the thrown stone and the oars all drive the same arm bones
  if (throwT > 0) throwT = Math.max(0, throwT - dt);
  if (fishing) {
    const f = fishing;
    let a = 1.15;
    if (f.phase === 'cast') a = 1.15 + (1 - Math.min(1, f.t / 0.5)) * 0.85;
    else if (f.phase === 'bite') a = 1.15 + Math.abs(Math.sin(f.t * 15)) * 0.1;
    else if (f.phase === 'reel') a = 1.15 + Math.min(1, f.t / 0.5) * 0.3;
    arms[1].rotation.x = a;
    arms[1].rotation.z = 0.12;
    arms[0].rotation.x = 0.5;
  } else if (throwT > 0) {
    arms[1].rotation.x = 0.9 + Math.sin((1 - throwT / 0.35) * Math.PI) * 1.25;
    arms[1].rotation.z = 0.4;
  } else if (inBoat) {
    arms[0].rotation.x = arms[1].rotation.x = -0.8 + Math.sin(rowPh) * 0.4;
    arms[0].rotation.z = 0.25; arms[1].rotation.z = -0.25;
  }

  // clavicle and elbow follow whatever the arms just did; the rod and the oars
  // pin the elbows at a fixed bend instead
  const { clavs, elbows } = player.userData;
  if (elbows) {
    if (fishing || throwT > 0 || inBoat) elbowT[0] = elbowT[1] = 0.38;
    for (let i = 0; i < 2; i++) {
      elbows[i].rotation.x += (elbowT[i] - elbows[i].rotation.x) * Math.min(1, dt * 14);
      clavs[i].rotation.x = arms[i].rotation.x * 0.3;
      clavs[i].rotation.z = arms[i].rotation.z * 0.3;
    }
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
  // her right hip, in her own frame: a camera-relative slot made the cat orbit her
  // whenever the camera turned while she stood still
  const efx = Math.sin(player.rotation.y), efz = Math.cos(player.rotation.y);
  const behind = inBoat || deck > 0.2
    ? new THREE.Vector3(-efx, 0, -efz).multiplyScalar(inBoat ? 1.55 : 1.15)
    : new THREE.Vector3(-0.7 * efx - efz, 0, -0.7 * efz + efx);
  const wantF = player.position.clone().add(behind);
  // the cat obeys the same water, trees and hills as Emma does
  const [wfx, wfz] = inBoat ? [wantF.x, wantF.z] : pushOut(wantF.x, wantF.z, fluffy.position);
  const fWas = fluffy.position.clone();
  // ponytail: a plain exponential lerp never arrives — the last few cm crept forever, so the
  // parked cat slid around. Close the loop under 4 cm instead.
  const fGap = Math.hypot(wfx - fluffy.position.x, wfz - fluffy.position.z);
  fluffy.userData.slot = [wfx, wfz]; fluffy.userData.gap = fGap;
  // exponential approach, but with a 0.9 m/s floor: a pure lerp never arrives, so the last
  // metre was a slow skate. This decelerates into the slot and parks on it.
  if (fGap < 0.04) { fluffy.position.set(wfx, fluffy.position.y, wfz); fluffy.userData.step = 0; }
  else {
    const step = Math.min(fGap, Math.max(0.6, fGap * (inBoat ? 9 : 3.2)) * dt);
    fluffy.userData.step = step / Math.max(dt, 1e-4);
    fluffy.position.x += (wfx - fluffy.position.x) / fGap * step;
    fluffy.position.z += (wfz - fluffy.position.z) / fGap * step;
  }
  const fMoved = fWas.distanceTo(fluffy.position);
  const fy = player.rotation.y - fluffy.rotation.y;
  fluffy.rotation.y += (((fy + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 7);
  idleT = fMoved > 0.004 || petT > 0 ? 0 : idleT + dt;
  if (petT > 0) petT = Math.max(0, petT - dt);
  catSit += ((idleT > 6 || petT > 0 ? 1 : 0) - catSit) * Math.min(1, dt * 3.5);
  catLie += ((idleT > 20 ? 1 : 0) - catLie) * Math.min(1, dt * 3);
  if (window.__cs !== undefined) { catSit = window.__cs; catLie = window.__cl || 0; }   // debug pose
  const fGy = inBoat ? 1.0 : groundAt(fluffy.position.x, fluffy.position.z);
  // ponytail: the hop lifted the old procedural legs off the ground; the GLB rig has real
  // clips, so hopping it just bounces the whole cat while it stands.
  const fHop = inBoat || fluffy.userData.tux ? 0
    : Math.sin(t * 7) * 0.03 * (1 - catSit) + (fMoved > 0.01 ? 0.03 : 0);
  // the pelvis drops by exactly what the ~29 deg torso tilt lifts the shoulders, so a
  // sitting cat keeps straight, vertical front legs instead of floating on them
  const catDrop = fluffy.userData.mix ? 0 : 0.60 * Math.sin(0.50 * catSit) * (1 - catLie) + 0.205 * catLie;
  fluffy.position.y += (fGy + fHop - catDrop - fluffy.position.y) * Math.min(1, dt * 12);
  // sitting: the chest lifts and the rump drops onto the folded hind legs
  fluffy.rotation.x = 0;

  // ---- Fluffy's rig. The legs trot, fold under in a sit, and vanish in a loaf.
  const FU = fluffy.userData;
  const catSpd = dt > 1e-4 ? fMoved / dt : 0;   // closing speed: legs keep up while it decelerates
  fPh = (fPh + fMoved / 0.62 * Math.PI * 2) % (Math.PI * 200);
  if (FU.mix) {
    // Sit/Loaf clips are hand-baked in Blender (catbake.py) — the shipped ones left the
    // cat standing. Front paws sit at y=0 and the rump lands within 8 mm of the ground.
    const want = catLie > 0.5 ? 'Loaf' : catSit > 0.5 ? 'Sit'
      : catSpd > 4.2 ? 'Trot' : catSpd > 0.3 ? 'Walk' : 'Idle';
    if (want !== FU.clip && FU.acts[want]) {
      const prev = FU.acts[FU.clip], next = FU.acts[want];
      next.reset().play();
      if (prev) next.crossFadeFrom(prev, 0.26, false);
      FU.clip = want;
    }
    FU.mix.timeScale = FU.clip === 'Walk' ? THREE.MathUtils.clamp(catSpd / 1.7, 0.5, 1.7)
      : FU.clip === 'Trot' ? THREE.MathUtils.clamp(catSpd / 4.6, 0.7, 1.8) : 1;
    FU.mix.update(dt);
    // clips animate legs only, so the body's rise and fall is added on the holder
    if (FU.holder) {
      const t = performance.now() * 0.001;
      FU.holder.position.y = FU.clip === 'Sit' || FU.clip === 'Loaf' ? 0
        : FU.clip === 'Trot' ? Math.abs(Math.sin(fPh)) * 0.026
        : FU.clip === 'Walk' ? Math.abs(Math.sin(fPh)) * 0.014
        : 0;                                   // at rest the Idle clip breathes on its own
    }
    // the rig has one tail bone, so the loose sway of the old Fluffy is added on top
    if (FU.tail) {
      FU.tail.quaternion.multiply(_qz.setFromAxisAngle(_AZ, Math.sin(performance.now() * 0.0017) * 0.14));
      FU.tail.quaternion.multiply(_qx.setFromAxisAngle(_AX, Math.sin(performance.now() * 0.0023) * 0.07));
    }
  }
  if (FU.bones) {
    const amp = Math.min(1, catSpd / 2.2) * 0.5 * (1 - Math.max(catSit, catLie));
    const lift = -0.50 * catSit * (1 - catLie);   // torso up ~29 deg about the hips; flat when loafing
    // front legs cancel the hip tilt so they stay straight and vertical
    if (FU.hips) FU.hips.quaternion.copy(FU.restHips).multiply(_qx.setFromAxisAngle(_AX, lift));
    for (const L of FU.legs) {
      const u = (((fPh + L.off) / (Math.PI * 2)) % 1 + 1) % 1;
      const k = u > 0.5 ? Math.sin((u - 0.5) * Math.PI * 2) : 0;     // knee: swing only
      const swing = Math.cos(u * Math.PI * 2) * amp;
      // sit: front legs stay straight and vertical, hind legs fold with the hock on the
      // ground and the toes forward.  loaf: belly down, every paw tucked forward.
      // (+x swings a leg back, so a fold is thigh -x / hock +x)
      // loaf: the forearm folds back under the chest so no paw shows in front
      const aUp = (L.front ? -lift - 1.05 * catLie : -1.15 * catSit - 1.25 * catLie);
      const aLo = (L.front ? 1.95 * catLie : 1.90 * catSit + 1.95 * catLie);
      const aPaw = (L.front ? 0.60 * catLie : -0.60 * catSit - 0.50 * catLie);
      L.up.quaternion.copy(L.restUp).multiply(_qx.setFromAxisAngle(_AX, swing + aUp));
      L.lo.quaternion.copy(L.restLo).multiply(_qx.setFromAxisAngle(_AX, k * amp * (L.front ? 1.4 : -1.4) + aLo));
      L.paw.quaternion.copy(L.restPaw).multiply(_qx.setFromAxisAngle(_AX, -k * amp * 0.8 + aPaw));
      // a loafing cat shows no legs at all: collapse them into the body
      L.up.scale.setScalar(1 - 0.92 * catLie);
    }
  }

  // tail: lifts when she moves, waves when she stops.  No chain sim needed now
  // that five bones can carry the curl.
  const wantTail = petT > 0 ? 1 : THREE.MathUtils.clamp((catSpd - 1.1) / 3.2, 0, 1);
  [tailA, tailV] = spring(tailA, tailV, wantTail, 26, 9, dt);
  if (FU.bones) {
    for (let i = 0; i < FU.tail.length; i++) {
      const lift = tailA * 0.30 - 0.45 * catLie + Math.sin(t * 1.5 + i * 0.6) * 0.035;
      const swish = Math.sin(t * 2.2 - i * 0.8) * (0.05 + 0.10 * tailA);
      FU.tail[i].quaternion.copy(FU.tailRest[i])
        .multiply(_qx.setFromAxisAngle(_AX, lift))
        .multiply(_qz.setFromAxisAngle(_AZ, swish));
    }
  }
  [earA, earV] = spring(earA, earV, THREE.MathUtils.clamp(-turnRate * 0.05, -0.22, 0.22), 60, 9, dt);
  // a cat's ears stay up: swivel about the ear's own shaft, never pitch forward.
  // compose onto the bind rotation -- writing rotation.set() discards it and
  // drops the blades flat along the skull.
  if (FU.earL && FU.restEarL) {
    FU.earL.quaternion.copy(FU.restEarL)
      .multiply(_qy.setFromAxisAngle(_AY, earA + Math.sin(t * 2.3) * 0.05))
      .multiply(_qx.setFromAxisAngle(_AX, Math.sin(t * 3.1) * 0.02));
    FU.earR.quaternion.copy(FU.restEarR)
      .multiply(_qy.setFromAxisAngle(_AY, -earA - Math.sin(t * 1.9) * 0.05))
      .multiply(_qx.setFromAxisAngle(_AX, Math.sin(t * 3.4) * 0.02));
  }

  // camera: looks where she is heading, and pulls in when a tree gets between
  lookAt.set(player.position.x, player.position.y + 1.25, player.position.z)
    .addScaledVector(dir, Math.min(1.5, vel * 0.22));
  const off = new THREE.Vector3(
    Math.sin(camYaw) * Math.cos(camPitch),
    Math.sin(camPitch),
    Math.cos(camYaw) * Math.cos(camPitch),
  ).normalize();
  if (!CAM_SOLID.length) for (const k of ['tree0', 'tree1', 'tree2', 'rockFlat', 'rockB', 'rockC']) if (pools[k]) CAM_SOLID.push(pools[k]);
  camRay.camera = camera;
  camRay.set(lookAt, off);
  // meshes only: hidden sprites (glow worms, mist) still raycast, and one parked
  // in mid-air was pulling the camera in to arm's length in the middle of a room
  const hit = inCave
    ? (caveRoom ? camRay.intersectObject(caveRoom.g, true).find((h) => h.object.isMesh) : null)
    : camRay.intersectObjects(CAM_SOLID, false)[0];
  const wantD = hit && hit.distance < camDist ? Math.max(1.4, hit.distance - 0.5) : camDist;
  camNear += (wantD - camNear) * Math.min(1, dt * (wantD < camNear ? 16 : 4));
  // squeezed into a doorway the camera has nowhere to stand, so aim over her head
  // instead of straight at the back of it
  lookAt.y += THREE.MathUtils.clamp(1 - camNear / 7, 0, 1) * 1.6;
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
  giantTick(dt, t);
  // ponytail: linear scan of ~25 chunks of nodes each frame; fine at this size, index crystals if it shows up in a profile
  {
    let best = null, bd = 26;
    for (const c of chunks.values()) {
      for (const n of c.nodes) {
        if (n.type !== 'crystal') continue;
        if (isGone(n)) continue;
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
  stars.position.copy(camera.position);   // every frame: on the 5s sky tick it snapped forward
  if (inCave && caveRoom) caveTick(dt, t);
  rippleTick(dt);   // cave rings and pond rings expire even when nothing is fishing

  if ((rebuildAcc += dt) > 0.4) { rebuildAcc = 0; if (!inCave) { refreshChunks(player.position.x, player.position.z); Scatter(); } }
  if (!inCave) paveTrails(player.position.x, player.position.z);
  if ((skyAcc += dt) > 5) { skyAcc = 0; updateSky(); }
  placeSky();
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
    // only spawn once both rigs have landed: the hand-built stand-in used to
    // appear before the GLBs finished and then stayed as a boxy deer forever
    // the big rabbit GLB lands after the deer, and the two slots never refill -- so the
    // roll has to wait for every species or rabbits never make it in
    if (deer.length < 2 && Object.values(ANIM_DEER).every((P) => P.src) && Math.random() < 0.3) {
      const a = Math.random() * Math.PI * 2, d = 32 + Math.random() * 34;
      // a rabbit turns up as often as either deer kind, and every slot rolls its own spot
      const kind = ANIM_DEER.rabbit.src ? ['rabbit', 'buck', 'doe'][(Math.random() * 3) | 0] : Math.random() < 0.44 ? 'buck' : 'doe';
      deer.push(makeDeer(player.position.x + Math.cos(a) * d, player.position.z + Math.sin(a) * d, kind));
    }
    if (birds.length < 2 && Math.random() < 0.35) makeFlock();
    maybeGift();
    if (Math.hypot(1.5 * R - player.position.x, -0.5 * R - player.position.z) < R * 2) ensureGiant();
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

  waterU.t.value = t;
  // foam is unlit, so it has to be dimmed by hand or it glows at midnight
  waterU.foam.value.copy(cFoamDay).multiplyScalar(0.3 + 0.7 * dayLight);
  fishTick(dt); miniTick(dt); skipTick(dt);
  pShadow.visible = fShadow.visible = !inBoat;
  if (inBoat && boatPond) {
    boatPond.boat.g.position.set(player.position.x - boatPond.x, 0.06, player.position.z - boatPond.z);
    boatPond.boat.g.rotation.y = player.rotation.y;
    player.position.y = 0.14 + Math.sin(t * 2) * 0.02;
    // stroke rate follows speed; the blade lifts out of the water on the recovery
    rowPh += dt * (1.6 + vel * 0.45);
    const oars = boatPond.boat.g.userData.oars;
    if (oars) for (let i = 0; i < 2; i++) {
      const sx = i ? 1 : -1, o = oars[i];
      o.rotation.y = -sx * (1.4 - Math.sin(rowPh) * 0.3);
      o.rotation.z = sx * (0.06 + Math.max(0, Math.cos(rowPh)) * 0.14);
    }
    boatPond.boat.g.position.y = 0.06 + Math.sin(rowPh) * 0.015;
  }
  for (const b of paperBoats) {
    b.a += dt * 0.18;
    b.m.position.set(b.pd.x + Math.cos(b.a) * b.pd.r * 0.6, 0.12 + Math.sin(t * 1.6 + b.a) * 0.03, b.pd.z + Math.sin(b.a) * b.pd.r * 0.6);
    b.m.rotation.y = -b.a;
  }
  if (!giant) ensureGiant();   // he is always out there, so the waypoint is never a lie
  lifeTick(dt, t);

  for (const c of camps) {
    c.light.intensity = night * 2.2 * (0.85 + Math.sin(t * 7 + c.g.position.x) * 0.15);
    c.fire.scale.y = 0.85 + Math.sin(t * 9 + c.g.position.z) * 0.2;
    if (c.bird) c.bird.visible = hourNow >= 5 && hourNow < 9;
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

// install prompt: chrome/edge fire beforeinstallprompt, safari has no such event
const installBtn = $('#install');
let installEvent = null;
const isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e;
  installBtn.hidden = false;
});
installBtn.onclick = async () => {
  if (!installEvent) { toast('Tap Share, then "Add to Home Screen"'); return; }
  installEvent.prompt();
  await installEvent.userChoice;
  installEvent = null;
  installBtn.hidden = true;
};
addEventListener('appinstalled', () => { installBtn.hidden = true; });
if (!isStandalone && /iphone|ipad|ipod/i.test(navigator.userAgent)) {
  installBtn.textContent = 'Share → Add to Home Screen';
  installBtn.hidden = false;
}

if ('serviceWorker' in navigator) {
  const hadOne = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadOne) location.reload(); });
  navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
    .then((r) => { r.update(); document.addEventListener('visibilitychange', () => { if (!document.hidden) r.update(); }); })
    .catch(() => {});
}

// ponytail: test hook, only read by the headless harness (?debug)
if (DBG) window.__w = {
  pushOut, save, scene, camera,
  rim: (on) => { let c = 0; scene.traverse((o) => { const mm = o.material; if (mm && mm.isMeshToonMaterial) { mm.userData.rim = on; mm.needsUpdate = true; c++; } }); return c; },
  dump: () => { const out = []; player.traverse((o) => out.push({ n: o.name || o.type, m: o.material ? (o.material.type + (o.material.isMeshToonMaterial ? '/toon' : '')) : '-', v: o.visible, s: +o.scale.x.toFixed(2), k: o.userData.outline ? 'hull' : '' })); return out; },
  outlines: (v) => { let c = 0; scene.traverse((o) => { if (o.userData.outline) { o.visible = v; c++; } }); return c; },
  move: (x, y) => { input.x = x; input.y = y; return [input.x, input.y]; },
  gait: () => ({ walk: +walk.toFixed(2), vel: +vel.toFixed(2), lean: +leanZ.toFixed(3), pitch: +pitchX.toFixed(3), legs: player.userData.legs.map((l) => +l.scale.y.toFixed(2)), y: +player.position.y.toFixed(2) }),
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
  skyNow: () => { updateSky(); placeSky(); return true; },
  look: (y) => { camYaw = y; return camYaw; },
  skyProj: () => { const f = (m) => { const v = m.position.clone().project(camera); return [+v.x.toFixed(2), +v.y.toFixed(2)]; }; return { sun: f(sunDisc), moon: f(moonDisc) }; },
  sky: () => {
    const v = (m) => (m.visible ? +(m.position.y / 140).toFixed(2) : null);
    return { h: +skyH.toFixed(2), alt: +skySun.toFixed(2), sunY: v(sunDisc), moonY: v(moonDisc), sunVis: sunDisc.visible, moonVis: moonDisc.visible, day: +dayLight.toFixed(2) };
  },
  tp: (x, z, r) => { player.position.set(x, 0, z); if (r !== undefined) player.rotation.y = r; },
  near: () => (near ? near.kind : null),
  lit: () => ({ on: sparkLight.intensity > 0.02, i: +sparkLight.intensity.toFixed(2), x: Math.round(sparkLight.position.x), z: Math.round(sparkLight.position.z) }),
  spot: (i, j) => { const q = spot(i, j); return { x: Math.round(q.x), z: Math.round(q.z) }; },
  obj: () => ({ id: objId, list: objList.map((o) => ({ id: o.id, label: o.label, x: Math.round(o.x), z: Math.round(o.z), d: Math.round(Math.hypot(o.x - player.position.x, o.z - player.position.z)) })) }),
  big: () => ({ open: bigOpen, pins: objList.length }),
  caveDoors: () => (caveRoom ? caveRoom.doors.map((d) => ({ id: d.id, open: d.open, plug: d.g ? d.g.visible : null, arch: d.ring ? d.ring.visible : null })) : []),
  caveSolids: () => (caveRoom && caveRoom.solids ? caveRoom.solids.map((r) => ({ x: +r.x.toFixed(1), z: +r.z.toFixed(1), r: +r.r.toFixed(2) })) : []),
  bigR: () => bigRange,
  beacon: () => (caveRoom && caveRoom.beacon ? { t: +caveRoom.beacon.t.toFixed(1), x: +caveRoom.beacon.g.position.x.toFixed(1), z: +caveRoom.beacon.g.position.z.toFixed(1) } : null),
  cdoor: (id) => { const d = caveRoom && caveRoom.doors.find((x) => x.id === id); if (d) caveDoorOpen(d); },
  caveGround: (x, z) => caveGround(x, z),
  pondsDbg: () => [...ponds.values()].map((p) => [Math.round(p.x), Math.round(p.z), Math.round(p.r)]),
  packs: () => ({
    trees: ['tree0', 'tree1', 'tree2'].map((k) => (pools[k] ? pools[k].count : -1)),
    rocks: ['rockFlat', 'rockB', 'rockC'].map((k) => (pools[k] ? pools[k].count : -1)),
    trail: trailMesh ? trailMesh.count : -1,
    reeds: reedMesh ? reedMesh.count : -1,
    reedN: reeds.length, bloomN: blooms.length,
    blooms: bloomPools ? bloomPools.map((m) => m.count) : -1,
    dock: dockGeo ? 1 : 0, dockWait: dockWait.length, shellN: [...caves.values()].filter((c) => c.g && c.g.userData.shell).length,
    grass: pools.grass ? pools.grass.count : -1,
  }),
  dockDbg: () => {
    const d = dockGeo ? dockGeo.boundingBox : null;
    const pd = [...ponds.values()][0];
    return { y: +DOCK_Y.toFixed(2), drop: +dockDrop.toFixed(2), dy: d ? [+d.min.y.toFixed(2), +d.max.y.toFixed(2)] : null, dock: pd ? pd.dock : null, pond: pd ? [pd.x, pd.z, pd.r, pd.axis] : null };
  },
  trailDbg: () => {
    if (!trailMesh) return [0, []];
    const o = [], m = new THREE.Matrix4();
    for (let i = 0; i < trailMesh.count; i++) { trailMesh.getMatrixAt(i, m); o.push([+m.elements[12].toFixed(2), +m.elements[14].toFixed(2)]); }
    return [trailMesh.count, o];
  },
  rocksNear: () => [...chunks.values()].flatMap((c) => c.nodes).filter((n) => n.type === 'rock')
    .map((n) => [n.x, n.z, n.tone, n.s, Math.hypot(n.x - player.position.x, n.z - player.position.z)])
    .sort((a, b) => a[4] - b[4]).slice(0, 4).map((a) => a.map((v) => +v.toFixed(2))),
  cavesDbg: () => [...caves.values()].map((c) => [Math.round(c.x), Math.round(c.z), c.g ? !!c.g.userData.shell : null, c.g ? !!c.g.userData.old : null]),
  // a cave mouth must sit on flat ground: any lifted y here means a hill has
  // swallowed the door again.  empty array = healthy
  caveClash: () => [...caves.values()].flatMap((c) => {
    const ys = [-4, 0, 4].map((dz) => +hillAt(c.x, c.z + dz).toFixed(2));
    return ys.some((y) => y > 0.05) ? [[c.key, ys]] : [];
  }),
  solar: () => ({ rise: +sunRise.toFixed(2), set: +sunSet.toFixed(2), noon: +sunNoon.toFixed(2), maxDeg: +(sunMax * 180 / Math.PI).toFixed(1), now: +hourNow.toFixed(2), altDeg: +(skySun * 180 / Math.PI).toFixed(1), day: +dayLight.toFixed(2) }),
  water: waterU,
  streamsOut: () => [...ponds.values()].filter((p) => p.stream).map((p) => { const s = p.stream; return [Math.round(p.x), Math.round(p.z), Math.round(p.r), Math.round(s.x + s.dx * s.b), Math.round(s.z + s.dz * s.b)]; }),
  pondScan: () => { const out = []; for (let i = 0; i < 120; i++) { const pd = pondFor((i % 10) - 5, Math.floor(i / 10) - 6); if (pd) out.push([Math.round(pd.x), Math.round(pd.z), Math.round(pd.r)]); } return out.slice(0, 6); },
  frogs: () => ({ ic: inCave, ct: +(caveT || 0).toFixed(2), pond: !!(caveRoom && caveRoom.pond), ready: frogProto.ready, err: window.__frogErr || null,
    at: caveRoom ? caveRoom.frogs.map((f) => [+f.g.position.x.toFixed(1), +f.g.position.y.toFixed(2), +f.g.position.z.toFixed(1), +f.hop.toFixed(2)]) : [] }),
  caveProps: () => ({ rooms: CAVE_ROOMS.map((r) => [r.x, r.z, r.rx, r.rz]), n: caveProps.length, hung: caveRoom ? caveRoom.g.children.filter((c) => c.userData.tag).map((c) => { const p = c.getWorldPosition(new THREE.Vector3()); return [c.userData.tag, +p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)]; }) : [] }),
  giantDbg: () => giant && { wet: inWater(giant.x, giant.z, 0), gy: +giant.g.position.y.toFixed(2), eyes: giant.eyes.length, stone: giant.stone.length, kids: giant.g.children.length, awake: giant.awake, lid: +giant.lid.toFixed(2), col: giant.stone[0] && '#' + giant.stone[0].color.getHexString(), at: [+giant.x.toFixed(1), +giant.z.toFixed(1)] },
  grassDbg: () => { const p = pools.grass; if (!p) return 'no pool';
    const bb = p.geometry.boundingBox || (p.geometry.computeBoundingBox(), p.geometry.boundingBox);
    const m = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), out = [];
    for (let i = 0; i < Math.min(3, p.count); i++) { p.getMatrixAt(i, m); m.decompose(v, q, s); out.push([+v.x.toFixed(1), +v.y.toFixed(2), +v.z.toFixed(1), +s.x.toFixed(2)]); }
    return { n: p.count, vis: p.visible, inScene: !!p.parent, mat: p.material.type, map: !!p.material.map,
      size: [+(bb.max.x - bb.min.x).toFixed(2), +(bb.max.y - bb.min.y).toFixed(2), bb.min.y.toFixed(2)], first: out }; },
  caveDump: () => (caveRoom ? caveRoom.g.children.slice(0, 10).map((o) => ({ t: o.geometry && o.geometry.type, p: o.position.toArray().map((v) => +v.toFixed(1)), v: o.visible, s: o.scale.toArray().map((v) => +v.toFixed(1)) })) : []),
  caveSceneInfo: () => ({ kids: caveScene.children.length, near: camera.near, far: camera.far, calls: renderer.info.render.calls, fov: camera.fov }),
  caveInfo: () => ({ kids: caveRoom ? caveRoom.g.children.length : -1, parent: !!(caveRoom && caveRoom.g.parent), cam: camera.position.toArray().map((v) => +v.toFixed(1)), tris: renderer.info.render.triangles }),
  inHill: (x, z, pad = 0) => inHill(x, z, pad),
  ponds: () => [...ponds.values()].map((p) => ({ x: +p.x.toFixed(1), z: +p.z.toFixed(1), r: +p.r.toFixed(1) })),
  fish: () => { startFish(); return fishing ? fishing.phase : null; },
  rod: () => { if (!rodG) return null; const w = new THREE.Vector3(); rodG.getWorldPosition(w);
    const a = player.userData.arms[1];
    return { vis: rodG.visible, w: [+w.x.toFixed(1), +w.y.toFixed(1), +w.z.toFixed(1)],
      arm: +a.rotation.x.toFixed(2), armZ: +a.rotation.z.toFixed(2), line: fishLine.visible, bob: bobM.visible,
      bobW: [+bobM.position.x.toFixed(1), +bobM.position.y.toFixed(2), +bobM.position.z.toFixed(1)] }; },
  zz: (v) => { camDist = v || 5; return camDist; },
  fishPhase: () => (fishing ? { p: fishing.phase, t: +fishing.t.toFixed(2), bob: +fishing.bob.y.toFixed(2) } : null),
  reel: () => { if (!fishing) return null; if (fishing.phase === 'bite') { fishing.phase = 'reel'; fishing.t = 0; } return fishing.phase; },
  skip: (acc) => { if (!mini) startSkips(); if (acc !== undefined) { mini.x = 1 - acc; finishSkips(); return true; } return false; },
  skipTry: (n) => { for (let i = 0; i < n; i++) startSkips(); const open = !!mini; if (mini) { mini = null; $('#mini').hidden = true; } return { throws: skipThrows, cool: +skipCool().toFixed(1), open }; },
  skipAt: () => (skipStone ? { hops: skipStone.hops, y: +skipStone.m.position.y.toFixed(2), acc: +(skipStone.acc || 0).toFixed(2), vy: +skipStone.v.y.toFixed(2) } : null),
  pet: () => { petFluffy(); return +petT.toFixed(2); },
  feed: () => { const dp = (x) => Math.hypot(x.g.position.x - player.position.x, x.g.position.z - player.position.z);
    const d = deer.filter((x) => !x.K).sort((a, b) => dp(a) - dp(b))[0]; if (d) feedDeer(d); return d ? +d.fed.toFixed(1) : 0; },
  deerTrust: (v = 1) => { deer.forEach((d) => { d.trust = v; }); return deer.length; },
  poseDeer: (kind = 'buck', x = 0, z = 0, yaw = 0, s = 1) => {
    const n = deer.length, d = makeDeer(x, z, kind); d.frozen = 1; d.g.rotation.y = yaw; d.g.scale.multiplyScalar(s); deer.push(d);
    return [n, deer.length];
  },
  deer: () => deer.map((d) => {
    const names = [];
    d.g.traverse((o) => { if (o.isMesh) names.push(o.name); });
    return { kind: d.kind, x: +d.g.position.x.toFixed(1), z: +d.g.position.z.toFixed(1), trust: d.trust, spd: +d.spd.toFixed(2), home: [+d.home.x.toFixed(1), +d.home.y.toFixed(1)], d: +Math.hypot(d.g.position.x - player.position.x, d.g.position.z - player.position.z).toFixed(1), mesh: [...new Set(names)], h: +new THREE.Box3().setFromObject(d.g).getSize(new THREE.Vector3()).y.toFixed(2) };
  }),
  rab: (u, spd) => { const rs = deer.filter((q) => q.hop); if (!rs.length) return null;
    const dd = (q) => Math.hypot(q.g.position.x - player.position.x, q.g.position.z - player.position.z);
    const r = rs.sort((a, b) => dd(a) - dd(b))[0]; r.wip = true; r.spd = spd ?? 2.6; r.holdU = u;    return { x: +r.g.position.x.toFixed(2), z: +r.g.position.z.toFixed(2), y: +r.g.position.y.toFixed(2), rig: r.rig.length, yaw: +r.yaw.toFixed(2) }; },
  rabTo: (x, z, yaw) => { for (const r of deer.filter((q) => q.hop)) { r.g.position.set(x, 0, z); if (yaw !== undefined) { r.yaw = yaw; r.g.rotation.y = yaw; } } return [x, z]; },
  rabBig: (k = 4) => { for (const r of deer.filter((q) => q.hop)) r.g.scale.setScalar(CM * k); return k; },
  rabFree: () => { for (const r of deer.filter((q) => q.hop)) { r.holdU = undefined; r.wip = false; } return true; },
  deerSpawn: (kind = 'doe', ahead = 8) => { const a = camera.getWorldDirection(new THREE.Vector3()); const d2 = makeDeer(player.position.x + a.x * ahead, player.position.z + a.z * ahead, kind); deer.push(d2); return kind; },
  doeClips: () => Object.fromEntries(Object.entries(ANIM_DEER).map(([k, P]) => [k, P.clips.length])),
  doeBig: (k = 3) => { for (const d of deer) if (d.anim) d.g.scale.setScalar(ANIM_DEER[d.kind].S * k); return k; },
  doeTracks: (n = 'Walk', kd = 'doe') => { const c = ANIM_DEER[kd].clips.find((k) => k.name === n); if (!c) return null;
    return c.tracks.map((t) => [t.name, t.times.length, Array.from(t.values.slice(0, 3)).map((v) => +v.toFixed(2)), +(t.values[t.values.length - 3]).toFixed(2)]); },
  doeWorld: (i, t) => { const d = deer[i]; if (!d || !d.anim) return null; d.mix.setTime(t); d.g.updateMatrixWorld(true);
    const want = ['FFL', 'FFR', 'FFBL', 'FFBR', 'Head', 'Body'];
    const out = {}; const v = new THREE.Vector3();
    d.g.traverse((o) => { if (o.isBone && want.includes(o.name)) { o.getWorldPosition(v); out[o.name] = [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)]; } });
    return out; },
  doeBones: (i) => { const d = deer[i]; if (!d || !d.anim) return null; const bn = [];
    d.g.traverse((o) => { if (o.isBone) bn.push([o.name, ...o.quaternion.toArray().map((v) => +v.toFixed(3))]); }); return bn; },
  doeDbg: (i) => { const d = deer[i]; if (!d || !d.anim) return null; const bn = [];
    d.g.traverse((o) => { if (o.isBone && bn.length < 6) bn.push([o.name, +o.position.y.toFixed(2), +o.quaternion.x.toFixed(3), +o.quaternion.w.toFixed(3)]); });
    return { spd: d.spd, w: d.w, gy: +d.gy.toFixed(2), y: +d.g.position.y.toFixed(2),
      act: Object.fromEntries(Object.entries(d.A).map(([k, a]) => [k, [+a.getEffectiveWeight().toFixed(2), +a.time.toFixed(2), a.isRunning()]])), bn }; },
  deerDbg: () => deer.map((d) => ({ k: d.kind, fz: !!d.frozen, fl: +((d.flee) || 0).toFixed(2), id: +(d.idle || 0).toFixed(1), wt: +((d.walkT) || 0).toFixed(2), spd: +d.spd.toFixed(2), tr: d.trust, dist: +Math.hypot(d.g.position.x - player.position.x, d.g.position.z - player.position.z).toFixed(2) })),
  deerWip: (kind = 'doe', x = 0, z = 0, yaw = 0, spd = 1.6) => {
    const d = makeDeer(x, z, kind); d.frozen = 1; d.wip = 1; d.spd = spd; d.ph = 0;
    d.g.rotation.y = d.yaw = yaw; deer.push(d); return deer.length - 1;
  },
  deerPh: (i, v) => { const d = deer[i]; if (!d) return false; d.ph = v; return true; },
  cat: () => ({ sit: +catSit.toFixed(2), lie: +catLie.toFixed(2), idle: +idleT.toFixed(1), pet: +petT.toFixed(2) }),
  tailGeo: () => { const w = (o) => { const v = new THREE.Vector3(); o.getWorldPosition(v); return [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)]; };
    const u = fluffy.userData;
    return { cat: w(fluffy), tip: u.tail.length ? w(u.tail[u.tail.length - 1]) : null, legs: u.legs.length, bones: !!u.bones }; },
  tail: () => ({ a: +tailA.toFixed(2) }),
  stones: () => [...landmarks.values()].map((l) => [+l.x.toFixed(1), +l.z.toFixed(1), l.done, l.key]),
  camps: () => camps.map((c) => ({ i: c.i, x: +c.x.toFixed(1), z: +c.z.toFixed(1), kids: c.g.children.length, props: ((save.camps[c.i] || {}).props || []).length })),
  deco: (i = 0) => { const c = camps[i]; if (!c) return -1; decorateCamp(c); return ((save.camps[c.i] || {}).props || []).length; },
  pack: (i = 0) => { const c = camps[i]; if (!c) return -1; packCamp(c); return camps.length; },
  boat: () => ({ in: inBoat, oars: boatPond ? (boatPond.boat.g.userData.oars || []).map((o) => +o.rotation.y.toFixed(2)) : null, cat: +fluffy.position.y.toFixed(2) }),
  // one runnable check for the bridge rails.  side: distance she ends up from
  // the pond centre after trying to step off the deck sideways (1.05 = the rail
  // held, ~3 = she walked off).  end: 0 means the far-side target still passes
  // through untouched, i.e. the ends of the bridge are still open.
  rails: () => [...ponds.values()].map((pd) => {
    const off = pd.axis ? (v) => [pd.x + v, pd.z] : (v) => [pd.x, pd.z + v];
    player.position.set(pd.x, 0, pd.z);
    const [x1, z1] = pushOut(...off(3));
    player.position.set(pd.x, 0, pd.z);
    const [x2, z2] = pushOut(...off(pd.r + 1.5));
    return { key: pd.key,
      side: +Math.hypot(x1 - pd.x, z1 - pd.z).toFixed(2),
      end: +Math.abs(Math.hypot(x2 - pd.x, z2 - pd.z) - (pd.r + 1.5)).toFixed(2) };
  }),
  // one runnable check for the pier: walk her down it one frame-step at a time,
  // through the same pushOut the frame loop uses.  end must land on a+0.2 (she
  // stops at the water end), slip must stay tiny (no shove back up the boards),
  // side must stay inside the 1.05 rails.
  pier: () => [...ponds.values()].filter((pd) => pd.dock).map((pd) => {
    const d = pd.dock, mid = (d.a + d.b) / 2;
    const along = (x, z) => (x - d.x) * d.dx + (z - d.z) * d.dz;
    const across = (x, z) => (x - d.x) * d.nx + (z - d.z) * d.nz;
    let x = d.x + d.dx * mid, z = d.z + d.dz * mid;
    player.position.set(x, 0, z);
    let slip = 0, side = 0, big = null;
    for (let i = 0; i < 60; i++) {                 // 60 x 0.15 m = well past the end
      const px0 = x, pz0 = z;
      const [nx, nz] = pushOut(x - d.dx * 0.15, z - d.dz * 0.15);
      const step = Math.hypot(nx - x, nz - z);
      if (!big && step > 1) big = { i, from: [+px0.toFixed(1), +pz0.toFixed(1)], to: [+nx.toFixed(1), +nz.toFixed(1)], along: +along(px0, pz0).toFixed(2) };
      slip = Math.max(slip, step - 0.15);
      x = nx; z = nz;
      player.position.set(x, 0, z);
    }
    const end = along(x, z);
    player.position.set(d.x + d.dx * mid, 0, d.z + d.dz * mid);
    const [sx, sz] = pushOut(d.x + d.dx * mid + d.nx * 1.8, d.z + d.dz * mid + d.nz * 1.8);
    side = across(sx, sz);
    player.position.set(d.x + d.dx * mid, 0, d.z + d.dz * mid);
    return { key: pd.key, end: +end.toFixed(2), want: +(d.a + 0.2).toFixed(2),
      slip: +slip.toFixed(2), side: +side.toFixed(2), big };
  }),
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
  pick: (nx = 0, ny = 0) => {
    const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(nx, ny), camera);
    return rc.intersectObjects(scene.children, true).slice(0, 3).map((h) => { const o = h.object;
      return { t: o.geometry && o.geometry.type, col: o.material && o.material.color ? o.material.color.getHexString() : null,
        x: +h.point.x.toFixed(1), y: +h.point.y.toFixed(2), z: +h.point.z.toFixed(1), d: +h.distance.toFixed(1) }; });
  },
  caveWater: () => (caveRoom ? {
    pond: caveRoom.pond, fall: caveRoom.fall,
    sheets: caveRoom.sheets.map((s) => +s.tex.offset.y.toFixed(2)),
    spray: caveRoom.splash.dat.slice(0, 3).map((d) => +d.y.toFixed(2)),
    rings: ripples.filter((r) => r.m.parent === caveRoom.g).length,
  } : null),
  gateReset: () => { gate = null; $('#gate').classList.remove('on'); },
  chest: () => (caveRoom ? {
    x: +caveRoom.chest.position.x.toFixed(1), z: +caveRoom.chest.position.z.toFixed(1),
    vis: caveRoom.chest.visible, shine: caveRoom.shine.visible, taken: save.treasure.includes(caveKey),
    w: ((v) => [+v.x.toFixed(1), +v.z.toFixed(1)])(caveRoom.chest.getWorldPosition(camera.position.clone())),
  } : null),
  // generator check: no stream down a bridge, no cave in a pond
  audit: (n = 30) => {
    let badStreams = 0, caves = 0, pondsN = 0, closest = 1e9, first = null;
    for (let rx = -n; rx <= n; rx++) for (let rz = -n; rz <= n; rz++) {
      const q = pondFor(rx, rz);
      if (q) {
        pondsN++;
        const [ux, uz] = streamDir(q);
        if (Math.abs(ux * (q.axis ? 0 : 1) + uz * (q.axis ? 1 : 0)) > 0.35) badStreams++;
      }
      const c = caveFor(rx, rz);
      if (!c) continue;
      caves++; first ||= { x: +c.x.toFixed(1), z: +c.z.toFixed(1) };
      for (let ax = rx - 1; ax <= rx + 1; ax++) for (let az = rz - 1; az <= rz + 1; az++) {
        const w = pondFor(ax, az);
        if (w) closest = Math.min(closest, Math.hypot(c.x - w.x, c.z - w.z) - w.r);
      }
    }
    return { ponds: pondsN, caves, badStreams, closestCaveToShore: +closest.toFixed(1), first };
  },
  g: (x, z) => +groundAt(x, z).toFixed(3),
  by: () => ({ by: +bridgeY.toFixed(3), g: +groundAt(player.position.x, player.position.z).toFixed(3), boat: inBoat, riding, y: +player.position.y.toFixed(3) }),
  ponds: () => [...ponds.values()].map((p) => ({ x: +p.x.toFixed(1), z: +p.z.toFixed(1), r: +p.r.toFixed(1), axis: p.axis, kind: p.kind, wet: !!p.wet, arch: p.arch, stones: (p.stones || []).map((s) => [+s.x.toFixed(1), +s.z.toFixed(1)]) })),
  where: () => ({ inCave, inBoat, x: +player.position.x.toFixed(1), y: +player.position.y.toFixed(2), z: +player.position.z.toFixed(1) }),
  teleportMenu: () => { openTeleport(); return $('#tplist').textContent; },
  rideTo: (i = 0) => { const c = camps[i]; if (!c) return null; startRide(c); return campName(c); },
  ridingNow: () => (riding ? riding.phase : null),
  catDbg: () => ({ slot: (fluffy.userData.slot || []).map((v) => +v.toFixed(2)), gap: +(fluffy.userData.gap || 0).toFixed(3), spd: +(fluffy.userData.step || 0).toFixed(2), clip: fluffy.userData.clip, pos: fluffy.position.toArray().map((v) => +v.toFixed(2)) }),
  tux: () => ({ on: !!fluffy.userData.mix, clip: fluffy.userData.clip, clips: Object.keys(fluffy.userData.acts || {}) }),
  caveGo: (i = 0) => { const c = [...caves.values()][i]; if (!c) return false; enterCave(c); return true; },
  caveTest: (key = 'test-cave', kind) => { const K = CAVE_KINDS.find((x) => x.id === kind); enterCave({ key, force: K }); return kind || caveKind(key).id; },
  caveKindOf: (k) => caveKind(k).id,
  caveList: () => [...caves.values()].map((c) => [c.key, +c.x.toFixed(1), +c.z.toFixed(1)]),
  caveNames: () => [...caves.values()].map((c) => [c.key, caveName(c)]),
  caveNameOf: (k) => caveName({ key: k }),
  pushAt: (x, z) => pushOut(x, z),
  treeNodes: () => [...chunks.values()].flatMap((c) => c.nodes.filter((n) => n.type === 'tree')).map((n) => [n.id, +n.x.toFixed(1), +n.z.toFixed(1)]),
  dupIds: () => { const s = new Set(); let d = 0; for (const c of chunks.values()) for (const p of c.nodes) { if (s.has(p.id)) d++; else s.add(p.id); } return d; },
  caveOff: (v = false) => { if (caveRoom) caveRoom.g.visible = !v; return true; },
  caveTp: (x, z) => { player.position.set(x, caveGround(x, z), z); return __w.where(); },
  caveRoomInfo: () => (caveRoom ? { rot: caveRoom.rot, vault: caveRoom.vault, ledge: caveRoom.ledge, stair: caveRoom.stair, kind: caveRoom.kind, doors: caveRoom.doors.map((d) => [d.id, d.x, d.z, d.axis, d.open]), caches: caveRoom.caches.map((c) => [c.x, c.z, c.got, JSON.stringify(Object.fromEntries(Object.entries(c.kit).filter(([q]) => q !== 'col')))]) } : null),
  caveMask: (hide = []) => { const k = new Set(hide); caveRoom.g.children.forEach((o, i) => { o.visible = !k.has(i); }); return caveRoom.g.children.length; },
  caveInfo: () => caveRoom.g.children.map((o, i) => [i, o.type, o.position.toArray().map((n) => +n.toFixed(1)), o.scale.toArray().map((n) => +n.toFixed(1))]),
  caveKids: () => caveScene.children.map((o) => [o.type, o.position.toArray().map((n) => +n.toFixed(1)), o.visible]),
  caveNear: (x, y, z, r = 5) => { const t = new THREE.Vector3(x, y, z), out = []; caveScene.traverse((o) => { if (!o.isMesh && !o.isSprite) return; const p = new THREE.Vector3(); o.getWorldPosition(p); if (p.distanceTo(t) < r && o.visible) out.push({ k: o.type, p: p.toArray().map((v) => +v.toFixed(1)), c: o.material && o.material.color ? o.material.color.getHexString() : null, s: o.scale.toArray().map((v) => +v.toFixed(1)) }); }); return out; },
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
  // what rebuild ACTUALLY drew: instance positions, not the raw node list
  drawn: () => {
    const out = [], m = new THREE.Matrix4(), v = new THREE.Vector3();
    for (const k of ['tree0', 'tree1', 'tree2']) {
      const im = pools[k];
      for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, m); v.setFromMatrixPosition(m); out.push({ k, x: +v.x.toFixed(1), z: +v.z.toFixed(1) }); }
    }
    return out;
  },
  giantGo: (back = 16) => { ensureGiant(); player.position.set(giant.x, 0, giant.z + back); return { x: giant.x, z: giant.z }; },
  giantInfo: () => (giant ? {
    awake: giant.awake, n: giant.n, lid: +giant.lid.toFixed(2), eyeY: +giant.eyes[0].scale.y.toFixed(2),
    box: (() => { const b = new THREE.Box3().setFromObject(giant.g); return [b.min.toArray().map((v) => +v.toFixed(1)), b.max.toArray().map((v) => +v.toFixed(1))]; })(),
  } : null),
  giantWake: () => {
    if (!giant) return null;
    giant.n = 3; giant.awake = true; save.giant = true; giant.lid = 0.06; giant.bT = 1.6;
    for (const mm of giant.stone) mm.color.set(GIANT_GREEN);
    return true;
  },
};
