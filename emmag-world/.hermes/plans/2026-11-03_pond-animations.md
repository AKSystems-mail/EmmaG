# Pond activities + camp pack-up + cat tail — plan (2026-11-03)

## 1. Fishing (dock) — currently a timer with a toast

State machine, all procedural meshes, nothing to download:

1. **Ready** — she turns to face the pond centre, rod group attached at the right hand
   (0.28, 1.0, 0.15), pivot at the grip. Rod: `CylinderGeometry(0.02, 0.035, 1.5, 5)`, dark wood.
   While `fishing` is live, movement input is ignored; any move key cancels the cast.
2. **Cast** (0.7 s) — rod swings from behind the shoulder (-60°) to forward (+25°).
   Line = `THREE.Line`, 10 points, redrawn each frame; sag = catenary, shrinking as it pays out.
   Bobber (sphere r 0.075, red top half) lands 4.5 m out: splash burst + first ripple ring.
3. **Wait** (1.1–2.9 s) — bobber bobs ±2 cm on a slow sine; line sags; a ripple ring every
   ~1.5 s; rod tip drifts.
4. **Bite** — bobber dips hard 3× (y −0.18, 90 ms apart) with a splash each time, rod tip snaps
   down, `Reel!` + existing blip. 1.5 s to react.
5. **Reel** (0.6 s) — rod snaps up, bobber flies back to her in an arc, catch pops out:
   - fish: cone body + cone tail, wiggles 0.6 s, then hops back into the water with a splash.
   - bottle: cylinder + paper roll, hangs a beat, then the note toast (already written).
   - boot: small brown box, drops onto the dock.
   Everything disposes after 1.5 s.
6. **Miss / walk away** — line + rod removed instantly, no toast spam.

Ripple rings: one `RingGeometry` mesh per ripple, scale 0.2→1.4, opacity 0.6→0 over 1.2 s,
max ~10 alive. Shared by fishing and skipping.

## 2. Skipping stones — the meter stays, the stone becomes real

1. She turns to the pond, crouch-dip 0.25 s, flat stone appears in hand
   (`CylinderGeometry(0.09, 0.09, 0.02, 7)`).
2. Tap "Skip" → the existing `#mini` meter sweeps. Tap again → arm swings side-on (0.35 s).
3. **Throw**: launch toward the pond centre at 4.5–10 m/s, 8–14° up, driven by meter accuracy,
   released at hip height.
4. **Flight**: gravity −5.4, bounce on y=0.05: `vy *= −0.5`, horizontal `*= 0.72`,
   each touchdown = ripple ring + white splash burst. Max 9 hops.
5. **End**: hop < 0.05 → final plop + bigger ring. Toast `N skips! Best: N` — N is now the real
   bounce count, and `save.bestSkip` tracks it.
6. Throw direction is pond-centre, not camera-forward (always looks right, no aiming UI).

## 3. Other activities — what's already there

Has feedback: gathering (wood/stone/bloom/spark/star), waking sleeping stones (math),
cave crystals + doors, rowboat, folding a paper boat, camp gift/mailbox, naming things,
recurring cast, the giant, painting postcards, map objectives, balloons.

Exists but thin: **fishing**, **skipping** (the two above), **Fluffy** (no interaction at all),
deer / heron / butterflies (just scenery).

Missing from the earlier feature list: **build/place** (#9) — never built.
Recommendation: add **pet Fluffy** (one tap: purr, tail curl, hearts, +1 sticker once) and
leave build/place out until the world feels thin.

## 4. Pack up camp

New row at the top of the camp menu: **Pack up this camp**.
- 0.6 s fold: tent/swing props shrink toward the tent's origin while a dust puff plays, then the
  group is removed, `save.camps` filtered, `camps` scene list rebuilt, `persist()`.
- Frees one of the 5 camp slots immediately.
- Guard: if it is the last camp, no gift/mailbox can be waiting on it (`giftMesh`, `mailbox`).

## 5. Fluffy's tail

Add one scalar `catTailUp` (0→1) sprung (exist `spring()`, ~6/s, damping 9):
- target 0 while speed < 1.0 m/s, ramps to 1 at 4.5 m/s (she mirrors `vel`).
- Applied inside the verlet loop: per segment `q.p.y += catTailUp * 0.55 * (i / 4)` and gravity
  `-7 * (1 - 0.85 * catTailUp)` — the chain unfurls upward and straightens, tip included.
- Comes back down with the same spring, so both directions are smooth (~0.5 s).

## Build + verify

- `npm test`, build, deploy **v15** (`public/sw.js`), `sw_check`.
- Harness `world_t1.mjs`: stand at a dock → Fish → screenshots at cast/wait/bite/reel;
  stand at a bank → Skip → screenshots mid-flight; pack a camp and confirm count 5→4;
  walk Fluffy 20 m and shoot the tail at walk and at rest.
