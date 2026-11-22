"""Rig the Tripo cat scan: 20-bone quadruped, hand-rolled distance weights (bone-heat dies
on scans), five clips named for the game's existing clip switches.

Blender axes here are z-up with the nose at -Y, which exports to glTF +Z facing — the same
way the hand-authored tuxedo.glb faces, so the loader needs no rotation.

    blender -b -P rig.py -- in.glb out.glb [--check]
"""
import bpy, sys, math
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
src, dst = argv[0], argv[1]
CHECK = '--check' in argv
SCALE = 0.40          # the asset it replaces is 0.40 m; the game multiplies by 1.24
FPS = 30

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
mesh = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
bpy.context.view_layer.objects.active = mesh; mesh.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# scale once, in data space: parenting the mesh to the armature means an object-level
# scale would be applied twice (0.4 * 0.4) and the cat arrives at 40% of its size.
# nose-to-tail length of whatever copy of the scan this is; the sheet was 1 m, one
# cat out of it is not, so take the scale from the asset instead of hard-coding 0.40.
L0 = max(v.co.y for v in mesh.data.vertices) - min(v.co.y for v in mesh.data.vertices)
SCALE = 0.40 / L0
ZMIN = min(v.co.z for v in mesh.data.vertices)
for v in mesh.data.vertices:
    v.co = Vector((v.co.x, v.co.y, v.co.z - ZMIN)) * SCALE      # origin on the paws

def P(p):
    return Vector((p[0], p[1], p[2] - ZMIN)) * SCALE

# ---- anchors, measured off the mesh (metres, z up, nose -Y). One cat, whatever copy
# of the scan it came from: proportions, not the sheet's old hard-coded metres.
xs = [v.co.x for v in mesh.data.vertices]
ys = [v.co.y for v in mesh.data.vertices]
zs = [v.co.z for v in mesh.data.vertices]
XMIN, XMAX, YMIN, YMAX, ZMIN0 = min(xs), max(xs), min(ys), max(ys), min(zs)
W, L, HGT = XMAX - XMIN, YMAX - YMIN, max(zs) - ZMIN0
MIDY = (YMIN + YMAX) / 2

def paw(front):
    g = [v.co for v in mesh.data.vertices
         if v.co.z < ZMIN0 + 0.10 * HGT and ((v.co.y < MIDY) == front)]
    l = [c for c in g if c.x < 0]; r = [c for c in g if c.x >= 0]
    pick = lambda s: (sum(c.x for c in s) / len(s), sum(c.y for c in s) / len(s)) if s else (0, MIDY)
    return pick(l), pick(r)

(FLx, FY), (FRx, FYr) = paw(True)
(HLx, HY), (HRx, HYr) = paw(False)
FY = (FY + FYr) / 2; HY = (HY + HYr) / 2               # one y per axle, left/right share it
Z_TOP, Z_KNEE, Z_ANKLE, Z_FOOT = ZMIN0 + 0.52 * HGT, ZMIN0 + 0.30 * HGT, ZMIN0 + 0.11 * HGT, ZMIN0
SPINE = [(0, MIDY + 0.36 * L, ZMIN0 + 0.55 * HGT), (0, MIDY + 0.14 * L, ZMIN0 + 0.58 * HGT),
         (0, MIDY - 0.08 * L, ZMIN0 + 0.60 * HGT), (0, MIDY - 0.26 * L, ZMIN0 + 0.64 * HGT),
         (0, MIDY - 0.36 * L, ZMIN0 + 0.70 * HGT), (0, MIDY - 0.45 * L, ZMIN0 + 0.74 * HGT)]
TAIL = [(0, MIDY + 0.36 * L, ZMIN0 + 0.55 * HGT)] + \
       [(0, MIDY + 0.40 * L, ZMIN0 + h * HGT) for h in (0.42, 0.28, 0.14, 0.05)]

arm_data = bpy.data.armatures.new('cat')
arm = bpy.data.objects.new('cat', arm_data)
bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')

def bone(name, head, tail, parent=None, connect=False):
    b = arm_data.edit_bones.new(name)
    b.head, b.tail = Vector(P(head)), Vector(P(tail))
    if parent:
        b.parent = arm_data.edit_bones[parent]
        b.use_connect = connect
    return b

# spine: hips is the root, everything else chains up to the head
names = ['hips', 'spine', 'chest', 'neck', 'head']
for i in range(len(SPINE) - 1):
    bone(names[i], SPINE[i], SPINE[i + 1], names[i - 1] if i else None, i > 0)

for side, x in (('L', FLx), ('R', FRx)):
    for tag, y in (('front', FY), ('hind', HY)):
        xx = x if tag == 'front' else (HLx if side == 'L' else HRx)
        bone(f'{tag}Up{side}', (xx, y, Z_TOP), (xx, y, Z_KNEE), 'chest' if tag == 'front' else 'hips')
        bone(f'{tag}Lo{side}', (xx, y, Z_KNEE), (xx, y, Z_ANKLE), f'{tag}Up{side}', True)
        bone(f'{tag}Paw{side}', (xx, y, Z_ANKLE), (xx, y - 0.06 * L, Z_FOOT), f'{tag}Lo{side}', True)

for i in range(len(TAIL) - 1):
    bone(f'Tail_{i + 1}', TAIL[i], TAIL[i + 1], 'hips' if i == 0 else f'Tail_{i}', i > 0)

bpy.ops.object.mode_set(mode='OBJECT')
deform = [b.name for b in arm_data.bones]

# ---- weights: inverse-distance to the two nearest bone segments
def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
    return (p - (a + ab * t)).length

segs = [(b.name, b.head_local.copy(), b.tail_local.copy()) for b in arm_data.bones]
verts = mesh.data.vertices
raw = []
for v in verts:
    d = sorted(((seg_dist(v.co, a, b), n) for n, a, b in segs))[:3]
    w = {n: 1.0 / max(dd, 1e-3) ** 2 for dd, n in d}
    t = sum(w.values())
    raw.append({n: x / t for n, x in w.items()})

# A two-bone split tears at the seam the moment a joint bends (measurably: 40-80 mm
# holes on a 277 mm cat). Three neighbours of Laplacian smoothing over the mesh's own
# edges turns that seam into a gradient, which is the cheap version of a weight paint pass.
adj = {i: set() for i in range(len(verts))}
for e in mesh.data.edges:
    a, b = e.vertices
    adj[a].add(b); adj[b].add(a)
for _ in range(5):
    nxt = []
    for i, w in enumerate(raw):
        acc = dict(w)
        for k in acc: acc[k] *= 0.5
        nb = adj[i]
        if nb:
            share = 0.5 / len(nb)
            for j in nb:
                for n, x in raw[j].items():
                    acc[n] = acc.get(n, 0.0) + x * share
        t = sum(acc.values())
        nxt.append({n: x / t for n, x in acc.items() if x / t > 0.01})
    raw = nxt

groups = {n: mesh.vertex_groups.new(name=n) for n in deform}
for i, w in enumerate(raw):
    t = sum(w.values())
    for n, x in w.items():
        groups[n].add([i], x / t, 'REPLACE')

mesh.parent = arm
mod = mesh.modifiers.new('Armature', 'ARMATURE')
mod.object = arm

# ---- clips: idle/walk/trot are cycles, sit/loaf are settled poses
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='POSE')
for pb in arm.pose.bones:
    pb.rotation_mode = 'XYZ'

def key(action, frame, pose):
    arm.animation_data.action = action
    for pb in arm.pose.bones:
        pb.rotation_euler = (0, 0, 0); pb.location = (0, 0, 0)
    for name, rot in pose.items():
        if name in arm.pose.bones:
            arm.pose.bones[name].rotation_euler = [math.radians(a) for a in rot]
    for pb in arm.pose.bones:
        pb.keyframe_insert('rotation_euler', frame=frame)
    if 'hips_down' in pose:
        arm.pose.bones['hips'].location = (0, 0, pose['hips_down'] * SCALE)
        arm.pose.bones['hips'].keyframe_insert('location', frame=frame)

if not arm.animation_data:
    arm.animation_data_create()

def cycle(name, length, fn):
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    for f in range(length + 1):
        key(act, f, fn(f / length))

# diagonal pairs: FL+HR together, FR+HL together — a trot, and a slower version is a walk
# measured: rotation about local X swings a leg fore/aft (X- = forward), Y twists the
# bone, Z sways it sideways. Anything else here is authored against that table.
def gait(swing, lift):
    def pose(t):
        s = math.sin(t * math.tau)
        return {
            'frontUpL': (-s * swing, 0, 0), 'frontUpR': (s * swing, 0, 0),
            'hindUpL': (s * swing * 0.9, 0, 0), 'hindUpR': (-s * swing * 0.9, 0, 0),
            'frontLoL': (-max(0, s) * lift, 0, 0), 'frontLoR': (-max(0, -s) * lift, 0, 0),
            'hindLoL': (-max(0, -s) * lift, 0, 0), 'hindLoR': (-max(0, s) * lift, 0, 0),
            'spine': (0, 0, s * 1.2), 'chest': (0, 0, -s * 0.8),
            'Tail_1': (0, 0, s * 6), 'Tail_2': (0, 0, -s * 8),
            'Tail_3': (0, 0, -s * 10), 'Tail_4': (0, 0, -s * 12),
            'head': (s * 1.6, 0, s * 1.2),
            'hips_down': -0.002 - 0.002 * math.cos(t * math.tau * 2),
        }
    return pose

cycle('Idle', 60, lambda t: {
    'chest': (math.sin(t * math.tau) * 1.4, 0, 0),
    'head': (math.sin(t * math.tau) * 2.0, 0, math.sin(t * math.tau) * 1.5),
    'Tail_1': (0, 0, math.sin(t * math.tau) * 7), 'Tail_2': (0, 0, math.sin(t * math.tau + 0.6) * 9),
    'Tail_3': (0, 0, math.sin(t * math.tau + 1.1) * 11), 'Tail_4': (0, 0, math.sin(t * math.tau + 1.6) * 13),
})
cycle('Walk', 24, gait(11, 16))
cycle('Trot', 16, gait(18, 15))

# The old asset's Sit was an all-zero rest pose, so there is nothing to copy: these are
# authored on the same fold-each-joint-one-way rule that keeps distance weights from tearing.
SIT = {
    'hips_down': -0.05, 'spine': (9, 0, 0), 'chest': (4, 0, 0),
    'neck': (-5, 0, 0), 'head': (3, 0, 0),
    'hindUpL': (-48, 0, 0), 'hindLoL': (52, 0, 0), 'hindPawL': (-6, 0, 0),
    'hindUpR': (-48, 0, 0), 'hindLoR': (52, 0, 0), 'hindPawR': (-6, 0, 0),
    'frontUpL': (5, 0, 0), 'frontUpR': (5, 0, 0),
    'Tail_1': (10, 0, 22), 'Tail_2': (0, 0, 18), 'Tail_3': (0, 0, 12),
}
LOAF = {
    'hips_down': -0.062, 'spine': (3, 0, 0), 'chest': (1, 0, 0),
    'neck': (-4, 0, 0), 'head': (7, 0, 0),
    'frontUpL': (-34, 0, 0), 'frontLoL': (36, 0, 0), 'frontPawL': (-6, 0, 0),
    'frontUpR': (-34, 0, 0), 'frontLoR': (36, 0, 0), 'frontPawR': (-6, 0, 0),
    'hindUpL': (-32, 0, 0), 'hindLoL': (34, 0, 0), 'hindPawL': (-5, 0, 0),
    'hindUpR': (-32, 0, 0), 'hindLoR': (34, 0, 0), 'hindPawR': (-5, 0, 0),
    'Tail_1': (8, 0, 30), 'Tail_2': (0, 0, 26), 'Tail_3': (0, 0, 20),
}
for name, pose in (('Sit', SIT), ('Loaf', LOAF)):
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    key(act, 0, pose); key(act, 1, pose)

bpy.ops.object.mode_set(mode='OBJECT')
arm.animation_data.action = None
for pb in arm.pose.bones:                      # leave the file in bind pose
    pb.rotation_euler = (0, 0, 0); pb.location = (0, 0, 0)

# ---- check: every deform bone drives vertices, and the leg bones sit in the legs
if CHECK:
    counts = {n: 0 for n in deform}
    for v in mesh.data.vertices:
        for g in v.groups:
            if g.weight > 0.15:
                counts[mesh.vertex_groups[g.group].name] += 1
    empty = [n for n, c in counts.items() if c == 0]
    print('BONES', len(deform), 'EMPTY', empty)
    for n in ('frontUpL', 'hindUpR', 'head', 'Tail_1', 'Tail_4'):
        g = mesh.vertex_groups[n].index
        pts = [v.co for v in mesh.data.vertices if any(gg.group == g and gg.weight > 0.3 for gg in v.groups)]
        if not pts:
            print(n, 'NO_VERTS'); continue
        c = sum(pts, Vector()) / len(pts)
        print(f'{n:10s} n={len(pts):4d} centroid=({c.x:+.3f},{c.y:+.3f},{c.z:+.3f})')
    zmin = min(v.co.z for v in mesh.data.vertices)
    print('ZMIN', round(zmin, 3))

bpy.context.view_layer.objects.active = arm
for ob in (arm, mesh):
    ob.select_set(True)

bpy.ops.export_scene.gltf(
    filepath=dst, export_format='GLB', export_yup=True, use_selection=True,
    export_animations=True, export_animation_mode='ACTIONS',
    export_apply=False, export_skins=True, export_def_bones=False,
    export_texture_dir='', export_image_format='AUTO',
)
print('WROTE', dst)
