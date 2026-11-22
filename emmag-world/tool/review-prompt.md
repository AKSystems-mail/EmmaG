# Review prompt — EmmaG / emmag-world

Paste this into Gemini (CLI, AI Studio, or Antigravity) with the repo open.

---

You are reviewing `emmag-world`, a three.js endless-world browser game played by a
6-year-old on a tablet. Vanilla JS, one big module (`src/main.js`, ~7.2k lines),
Vite, Firebase Hosting. No framework, no TypeScript, no tests.

**Review only what is listed under SCOPE.** Do not propose rewrites, renames, new
dependencies, a module split, or a framework. This is a shipping game, not a greenfield.

## Hard invariants — a change that breaks one of these is a bug

1. **Caves:** the cave has 3 crystals. Only after all three are collected does the room
   with the waterfall light up and become enterable. That waterfall room is the *only*
   room that ever shows a visible light. The light stays on for that room forever:
   across rooms inside the cave, and across leaving and re-entering the cave.
2. Exactly **one cache bundle per cave**. No glow sprite on it — the bundle is
   self-emissive so it never reads as the waterfall room's shine in the wrong room.
3. The cave minimap must **not** show a pool/water marker.
4. Crystals are moved away from rocks, never granted a bigger pickup radius.
5. `?seed=<n>` pins the world. Anything that consumes `Math.random()` in a new place,
   or reorders `rnd()` calls in the chunk scatter, changes every existing world.
6. Winter draws (snow, snowman, igloo) are appended **after** non-winter scattering so
   the non-winter RNG sequence is untouched.
7. The service worker cache name (`public/sw.js`, `emmaworld-vNNN`) must be bumped on
   every deploy, or the tablet keeps the old bundle.

## SCOPE

Review these, in this order, and skip everything else:

- `src/main.js`: `checkBedtime()`, `caveBeacon()`, `caveDoorOpen()`, the beacon tick in
  the frame loop, `buildCave()` restore block, `feedDeer()`, and the deer branch of
  `lifeTick()`, plus `SOLID` / `PROP_SOLID` / `pushOut()`.
- `tool/cave-audit.mjs` — is it actually asserting the cave rule, or does it pass
  vacuously?

## What I want back

For each real defect: file + line, what breaks, how it breaks (a concrete sequence of
player actions), and the smallest fix. Rank by "a child will hit this", not by code taste.
If a section is fine, say "fine" in one line and move on.

Do not report: style, naming, line length, missing semicolons, "consider splitting this
file", comments, or anything you cannot tie to a behaviour.
