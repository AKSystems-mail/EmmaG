# Emma Grace — character sheet

Source of truth: `src/main.js` lines 476–537 (build), 4313–4428 (motion), 4323 tick loop.
She is not a model file, a glTF, or a skinned mesh. She is ~15 primitives in one
`THREE.Group`, assembled at boot, animated by rotating named pivots.

## 1. Visual identity

**Read at a glance:** a small girl in a purple cone dress with a black-brown hair
helmet and two low pigtails, a pink bow on her left, tiny bead eyes, no mouth, no
nose — a faceted low-poly toy that matches the rest of the world's 3-band toon look,
drawn with a hard ink outline so she never disappears into the grass.

**Proportions** (world units, 1 u ≈ 1 small step):
- Standing height 2.03 u to the crown of the head, 2.09 u to the top of the hair.
- Head is 0.62 u across = **30% of total height → 3.3 heads tall** (chibi/1st-grader shorthand).
- Shoulders 0.54 u, hips 0.28 u, dress hem 0.92 u, feet at y = 0.
- Context: an oak is 4.8 u, so she is ~40% of a small tree; rock props are 0.85 u.

**Palette**
- Skin `0xac7c58` (warm mid-brown), used for head, arms, legs.
- Dress `0x8e5fd0` (lilac), bodice `0x7a4ec0` (deeper purple), shoes `0x6d45b5` (third purple step down).
- Hair and pigtails `0x2b1b12` (warm near-black brown), not blue-black.
- Bow and hair ties `0xf2a0c8` (the game's signature "bloom" pink — same pink as the Bloom resource dot).
- Eyes `0x241509` (ink brown, unlit `MeshBasicMaterial` so they never shade out).
- Outline `0x1a1224`; rim light add `vec3(1.0, 0.76, 0.92)` — pink, not white.

**Part by part**

| part | geometry | position | notes |
|---|---|---|---|
| dress | `ConeGeometry(0.46, 0.88, 8)` | y 0.94 | 8-sided skirt, base at 0.50, apex 1.38 — the silhouette anchor |
| bodice | `CylinderGeometry(0.19, 0.24, 0.36, 8)` | y 1.34 | flares down into the skirt, no waist seam |
| head | `SphereGeometry(0.31, 12, 9)` | y 1.72 | no neck: head bottom 1.41 sinks into the torso top 1.52 |
| hair | `SphereGeometry(0.33, 12, 9)` | (0, 1.76, −0.03), z-scale 1.02 | a near-concentric shell pulled 0.03 back; skin clears it only ~0.002 u at eye level, so the face reads as a small oval framed by hair from chin to brow |
| pigtails | `SphereGeometry(0.15, 9, 7)` ×2 | (±0.30, 1.60, −0.05), scale (0.85, 1.55, 0.85) | 0.26 × 0.47 u ovoids hanging behind the hair, tips at y 1.37 — low pigtails, not twin-tails |
| ties | `CylinderGeometry(0.075, 0.075, 0.055, 8)` ×2 | (±0.265, 1.78, −0.05), rotated 90° on z | horizontal pink bands capping each pigtail |
| bow | `OctahedronGeometry(0.13, 0)` | (0.24, 1.94, 0) | 8-triangle faceted diamond, 0.26 u across, above her **left** eye at the hairline. Only asymmetry on the body |
| eyes | `SphereGeometry(0.045, 7, 6)` ×2 | (±0.11, 1.75, 0.285) | centres 0.22 u apart; 0.09 u wide beads recessed ~0.02 u into the face. No whites, no pupils, no blink, no mouth, no nose |
| arms | `CylinderGeometry(0.055, 0.05, 0.42, 6)` under a pivot | pivot (±0.27, 1.42, 0.02), rest z-rot ±0.18 | pivot at the shoulder, geometry translated so the pivot is the joint; bare hands, resting hands reach y ≈ 1.0 |
| legs | `CylinderGeometry(0.075, 0.065, 0.5, 6)` under a pivot | pivot (±0.14, 0.50, 0) | bare legs, hidden by the skirt in most shots |
| shoes | `BoxGeometry(0.16, 0.09, 0.25)` | (0, −0.49, 0.05) in leg space | flat purple bricks, toes forward |

**Shading & line**
- `MeshToonMaterial` with a 3×1 `DataTexture` ramp (0 / 150 / 255, `NearestFilter`) → hard cel bands, no smoothing.
- `flatShading: true` everywhere: every sphere shows its facets. She is faceted on purpose.
- Custom rim in `onBeforeCompile`: `pow(1 - dot(normal, viewDir), 2.2) * 0.95` pink added at the terminator, so the shadow side glows instead of going black.
- Outline: `outline(player, 1.055)` — a `BackSide` shell at 1.055× on every toon mesh, colour `0x1a1224`. Eyes are excluded (basic material). The cat gets 1.09×, so hers is the tighter line.
- Shadows: dress, bodice, head, hair, bow, arms, legs, shoes all `castShadow`; pigtails and ties do not. Plus a fake soft blob `shadowBlob(1.25)` under her, opacity 0.42, that always faces the camera — the real shadow drops it at distance.

## 2. Technical build

**Hierarchy** — `player` (Group) → 15 children: dress, bodice, head, hair, bow, 2 eyes, 2 pigtails, 2 ties, 2 arm pivots (each holding one arm mesh), 2 leg pivots (each holding a leg mesh + a shoe). `player.userData = { arms, legs }` is the only rig handle; nothing else is parented to the joints, so attachments (fishing rod at line 4013) are added to `arms[1]` at runtime.

**Cost**
- 17 visible meshes, 15 outline shells = **32 draw calls**, ~1,820 triangles (980 body + 840 outline), ~16 materials.
- Zero textures except the shared ramp; zero loaded assets. Total character payload is about 40 lines of code.

**Rig behaviour** — no skeleton, no skinning, no morph targets. Animation is direct rotation of 4 pivots plus a `scale.y` on each leg pivot for ground contact. That is why the walk can be overridden per-frame by fishing, throwing, rowing, or being in a boat without a blend tree.

**Motion model** (`tick()`, dt clamped to 0.05)
- Camera-relative input → `want` vector in world space; `dir` normalised; movement disabled while asleep, map open, a gate question is up, painting, fishing or the minigame.
- Speed `SPD = 6.4` u/s, eased in at `dt*11` and out at `dt*14` so starts are quick and stops are quicker — weight without lag.
- Turn: `atan2(dir.x, dir.z)` tracked at `dt*8`, then `player.rotation.z` leans into the turn via an under-damped spring (stiffness 90, damping 13, clamped ±0.17 rad) so she overshoots once and settles. `rotation.x` pitches on a second spring (70/11): −0.05 walking, +0.12 in a boat.
- Stride advances with **distance covered**, not time: `walk += moved / STRIDE * 2π` with `STRIDE = 4.7` u → no foot skating at any speed, and a footstep SFX fires each half cycle with surface-swapped material (grass / wood / gravel).
- Swing amplitude eases to 0.55 rad while moving; legs oppose, arms counter-swing at 0.6×. Vertical bob `|sin(walk)| * 0.035 * min(1, vel/4)`.
- One-bone leg IK: each leg pivot's `scale.y` = `((player.y + 0.5) − groundUnderThatFoot) / 0.5`, clamped 0.68–1.2, so she stretches down a slope instead of hovering.
- Boat pose: legs rotated −1.5 and hidden ("knees under the dress"), arms −0.95; oars then drive `arms[].rotation.x` off `rowPh`.
- Spawn: `player.position.set(save.x, 0, save.z)` from `localStorage['emmaworld.v2']`, default (65, 0) — the middle of the first 130 u region.

**Camera** — third-person orbit, yaw/pitch driven by drag, `camDist` 9.6 default, clamped 4–18, wheel and pinch zoom, pitch rest 0.30 rad. A forward raycast pulls the camera to `hit − 0.5` (floor 1.4) so terrain never occludes her; the cave re-poses it to 6.6.

**Debug surface** — `window.__w` exposes `gait()` (walk phase, velocity, lean, pitch, leg scales, y), `dist()`, `zoom()`, `look()`, `bed(minutes)` to force the bedtime state. That is the cheapest way to eyeball her rig without touching gameplay.

## 3. Character in play

- Full name in copy: **Emma Grace**. First grader, the player. Title card: "Emma Grace's Adventures 2"; subtitle "Wander, gather, and wake up the sleeping places. Fluffy is coming too."
- Companion: **Fluffy**, a tuxedo cat — black coat, white bib/muzzle/socks, pink collar, verlet tail. Follows at 0.7 forward / 1.0 to her right, trails in a boat, hops.
- Core loop: gather Wood / Stone / Bloom / Spark, spend it to wake sleeping stones, cross bridges, fish, skip stones, row, find caves, meet four NPCs (Marlow, Pip, Bramble, Nix) with one hand-written line each.
- She keeps **her Book**: Collection, Journal (dated, capped at 60 entries), Postcards, Badges (10). She can fold a paper boat for 2 Bloom and paint pictures.
- Blocked paths are **math gates**: 2nd-grade add/sub within 20 and 100, skip counting, place value; level 5 is 3rd-grade times tables and rounding, and some problems are word problems about what she is actually carrying. Wrong answers are free and retryable — the game never punishes her.
- She sleeps at camp 22:30–05:00 local time; the overlay says "She's tucked into her tent at camp. Fluffy is curled up by the fire." `?awake=1` bypasses it.
- Voice: none. No dialogue lines, no barks, no VO — she is characterised by what she does and by the journal/toast prose. All audio is synthesised (`src/audio.js`), no files.

## 4. Gaps worth knowing before you touch her

- No mouth or nose: any "expression" work means new geometry, and there is no face rig to hang it on.
- Hair and head are near-coincident spheres (~0.002 u clearance at eye level). Push the hair forward 0.01 and you get z-fighting on her face, not a fringe.
- No LOD, no culling, no instancing — irrelevant at 32 draw calls, but do not clone her 50×.
- Pigtails/ties do not cast shadows and are not on pivots, so they cannot swing; hair is rigid with the head.
- Her left/right: `arms[0]`/`legs[0]` are at −x (her right), `arms[1]` at +x (her left, and the one that holds the rod). Bow is +x = her left.
