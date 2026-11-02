# Emma Grace's Adventures 2 — Round 3 (plan for agreement)

**Status:** proposed, not started. No code written.
**Target:** `~/dev/EmmaG-World` → https://emmaga2.web.app
**Rules in force:** ponytail (smallest diff), no git repo, no deploy without a go.

---

## 1. Spark glow turns off when gathered

**Bug:** the shared spark light scans `c.nodes` for `type === 'crystal'` with no
awareness of `takenAt`, so a gathered crystal keeps glowing for the full 8 s
respawn even though its mesh is hidden.

**Fix (root cause, one guard):**

```js
// main.js ~2662, inside the crystal scan
if (takenAt.get(n.id) && performance.now() - takenAt.get(n.id) < TAKEDOWN) continue;
```

Plus: when the last crystal is taken, drop the light to 0 over ~0.15 s instead
of snapping (reuse the existing `fade` term: `fade *= sparkFade`, a value that
lerps to 0/1). ~6 lines total, one file.

**Check:** `__w.lit()` → `{on, x, z}` for the current light; gather a crystal,
assert `lit.on === false` immediately after, and `true` again after `TAKEDOWN`.

---

## 2. Arched bridge

Today: planks at a flat `y = 0.5`, rails at 1.12, and `onBridge()` is a boolean.

**Approach:** make `onBridge()` return the deck height instead of `true`.

```js
const onBridge = (pd, x, z) => {
  const dx = x - pd.x, dz = z - pd.z;
  const along = pd.axis ? dz : dx, across = pd.axis ? dx : dz;
  if (Math.abs(across) >= 1.2 || Math.abs(along) >= pd.r + 3) return 0;
  const t = along / (pd.r + 3);
  return 0.5 + pd.arch * (1 - t * t);       // pd.arch = 1.2 + r * 0.03  → 1.8–2.2
};
```

- `inWater()` already treats a truthy return as "on the bridge" — still correct,
  deck height is never 0 inside the span.
- `bridgeY` becomes `onBridge(...)` (walk up the arch, no new code).
- Planks: `y = 0.5 + arch*(1 - t²)`, `rotation.z = -2*arch*t/(r+3)` so each plank
  sits flush on the curve. Rails and posts take the same `y`.
- Ramp at each end: the first/last plank is at 0.5, ground is 0 — add two short
  ramp planks (or let the existing step-up smoothing handle it; check visually).

**Check:** walk the span; sample `__w.gait().y` at 5 points — expect a smooth
rise-peak-fall, peak ≈ 2.2 at centre, ends ≈ 0.5 → 0.

---

## 3. Landscape: kill the grid feel

**Diagnosis.** Trees per 44-unit chunk are already random *inside* the chunk, but
every region-level feature is placed at `region centre ± small jitter`, one per
130-unit cell: stones, ponds, hills, caves. That lattice is what reads as a grid,
and it is baked into the minimap.

**Proposed (three cheap layers, all deterministic from `save.seed`):**

**a. Warp the coordinate space.** One smooth value-noise function, two octaves,
±20 units. Applied to `spot()`, `pondFor()`, `hillFor()`, `caveFor()` and to every
node's `x/z` in `genChunk()`. Because it is smooth, nothing else has to change —
neighbours stay neighbours, but cells stop lining up.

```js
const warp = (x, z) => { /* 4-corner hash + smoothstep, 2 octaves, ±20 */ };
```

**b. Groves instead of sprinkles.** Scale each chunk's tree/bush count by a
low-frequency density noise (0 → bare clearing, 1.6 → dense grove). Chunks stop
looking like the same tile repeated. ~5 lines in `genChunk`.

**c. Break feature regularity.** Stone offset ±20 → ±45 (post-warp). Hills
0.30 → 0.20 with a second noise gate so hills sometimes pair up inside one cell
instead of exactly one per cell.

**Not changing:** one stone per region (that is the progression backbone), pond
count, cave count, chunk size, view distance.

**Check:** `__w.grid()` — sample the 7×7 regions around spawn, return stone
coordinates and nearest-neighbour distances; assert the distances are no longer a
near-constant (std dev > 8 units) and no two stones are within 40 units.

---

## 4. Minimap → real map + objectives

### 4a. An objective model (new, ~30 lines)

`objectives()` returns an ordered list, filtered by what is actually near and
unfinished:

| id | label | target | ready when |
|---|---|---|---|
| `stone` | Wake the sleeping stone | current region's stone | resources ≥ need |
| `cave` | Find a cave | nearest un-entered cave | — |
| `giant` | Wake the giant (n/3) | giant | — |
| `friend` | Meet someone new | nearest un-met cast member | — |
| `rove` | Wander somewhere new | bearing of travel | always (fallback) |

Selection is sticky: `save.obj` holds the id; tapping the HUD objective line
cycles to the next one. `#obj` renders the selected one; each shows a distance
and a direction.

### 4b. Minimap pins (132 px, existing canvas)

- Selected objective: pink diamond, pulsing.
- Off-map: a chevron clamped to the rim pointing at it (this is the "where am I
  going" bit that is missing today).
- Keep ponds, camps, friends, stones; add caves (purple dot) and the boat.
- Compass `N` at the top so rotation is readable (the map is north-up).

### 4c. Tap → big map (new overlay)

- `#bigmap`: full-screen, backdrop `rgba(18,14,28,.30)` (the 30% you asked for),
  map canvas at `min(86vw, 86vh)`, `RANGE` 420 (vs 240 on the minimap).
- Same painter, one `scale` argument — no second renderer.
- Legend line under the map (stone / cave / camp / water / you).
- A row of objective chips at the bottom: tap one to select it, and the map
  highlights that pin plus a dotted bearing line from the player.
- Movement freezes while it is open (same guard as the paint panel), close with
  the `×` or a tap outside the map.

**Skipped:** turn-by-turn routing, pathfinding around water, fog of war, zoom
gestures on the big map. Say the word if any of those matter.

---

## 5. Caves — what is possible

Today a cave is a prop: a black circle, a ring of rocks, a purple light, three
crystals. "Step in" gives +2 Spark once, then "Just the sound of water
dripping." You never actually go in. Three ways to make it real:

### Option A — a real tunnel in the same world (~40 lines)
Cut a walled trench from the mouth into the hillside, roof it with dark rock,
end in a small chamber with crystals. No scene change, no new systems. You are
still in the world, standing on it, walking downhill into the dark.
*Feels:* a shed with better lighting. Cheapest, least magical.

### Option B — cave as its own little level (recommended, ~120 lines)
A separate `THREE.Scene` per visit, so the outside world does not interfere:
rock walls, a ceiling, no sky, purple crystal light, fireflies, drip audio.
Enter by fading to black, walk a small hand-shaped room, collect 3 crystals —
the third lights the exit arch — walk out, fade back in at the mouth. Deterministic
per cave from its region key, so the same cave is the same room every time.
*Feels:* a proper discovery. Reuses the existing movement, camera, HUD, save, and
pickup code; the only new machinery is `renderer.render(inCave ? caveScene : scene, camera)`
and pausing the streamer while inside.

### Option C — cave as a mirror world (~180 lines)
B is a room; C is a world. Underground: a star ceiling instead of sky, an
underground lake with a paper boat, glowing worms that follow you, a small map of
its own, and a reason to come back (a treasure per cave, counted in the Book).
*Feels:* another game inside the game. Best long-term, most work, and it wants
its own art pass.

**Recommendation:** B now, with the room shaped by the same generator so each cave
is different. C later, once B proves fun — the scene swap is the hard part and B
pays for it.

---

## Order of work (if all approved)

1. Spark glow (5 min) — smallest, ship first.
2. Arched bridge (30 min).
3. Landscape warp + groves (60 min) + `grid()` check.
4. Objectives model + minimap pins (60 min).
5. Big map overlay (60 min).
6. Caves, chosen option (B: 2–3 h including the room generator).

Each step: build → headless harness → vision check → deploy on your go, not before.

## Files touched

- `src/main.js` — all six items (single-file project).
- `index.html` — `#bigmap` markup + CSS, `#obj` tap affordance.
- `public/sw.js` — no change needed (network-first already live).
- New harnesses in `~/.hermes/cache/scratch/`: `world_spark.mjs`, `world_bridge.mjs`,
  `world_grid.mjs`, `world_map.mjs`, `world_cave.mjs`.

## Risks

- **Warp changes the world for existing saves.** Positions come from the seed, so
  a visited region will look different after the update, and `save.restored`
  keys (cell coords) still line up — but a half-collected region will have moved.
  Acceptable? (One-time cosmetic shift; nothing breaks.)
- **Arched bridge + the boat:** the boat is moored at `0.95r`; the arch peak is mid
  span, so no interaction. Stepping stones are unaffected.
- **Big map on a phone in landscape:** 86vh at ~380 px tall is ~330 px of map —
  enough for 420 units at ~0.4 px/unit. Pins need a minimum 6 px radius.
- **Cave scene swap** is the only change that touches the render loop; keep it
  behind a single `inCave` flag with the streamer paused.

## Open questions

1. Caves: A, B, or C?
2. Big map: freeze movement while open, or let her keep drifting?
3. Objectives: is the list right (stone / cave / giant / friend / rove)? Anything
   to add — collecting a specific resource, a set number of stickers?
4. Landscape: subtle de-grid, or lean into it (big groves, bare clearings, lakes
   that straddle regions)?
5. Do you want the old region coordinates in the save to be preserved as-is
   (world shifts around them once) or start everyone on a fresh seed?
