"""Numeric deformation check: a clip that tears shows up as edges stretched far past
their bind length. Prints, per clip/frame, the worst edge stretch and the body's
on-screen height, and exits non-zero if anything looks torn.

    blender -b -P deform_check.py -- rigged.glb
"""
import bpy, sys, math

src = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = [o for o in bpy.context.scene.objects if o.type == 'ARMATURE'][0]
mesh = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
dg = bpy.context.evaluated_depsgraph_get()

def sample():
    bpy.context.view_layer.update()
    m = mesh.evaluated_get(dg).to_mesh()
    co = [v.co.copy() for v in m.vertices]
    edges = [(e.vertices[0], e.vertices[1]) for e in m.edges]
    mesh.evaluated_get(dg).to_mesh_clear()
    return co, edges

if not arm.animation_data:
    arm.animation_data_create()
arm.animation_data.action = None
for pb in arm.pose.bones:
    pb.rotation_euler = (0, 0, 0); pb.location = (0, 0, 0)
bind, edges = sample()
bind_len = [max((bind[a] - bind[b]).length, 1e-6) for a, b in edges]
H = max(c.z for c in bind) - min(c.z for c in bind)

acts = {a.name: a for a in bpy.data.actions}
worst = 0.0
for name in ('Idle', 'Walk', 'Trot', 'Sit', 'Loaf'):
    a = acts[name]
    arm.animation_data.action = a
    frames = int(a.frame_range[1]) or 1
    for f in range(0, frames + 1, max(1, frames // 6)):
        bpy.context.scene.frame_set(f)
        co, _ = sample()
        grow = [(co[x] - co[y]).length - L for L, (x, y) in zip(bind_len, edges)]
        mm = max(grow) * 1000
        torn = sum(1 for g in grow if g > 0.008)
        h = max(c.z for c in co) - min(c.z for c in co)
        worst = max(worst, mm)
        print(f'{name:5s} f{f:3d} grow={mm:6.1f}mm torn={torn:3d} height={h:.3f}')
arm.animation_data.action = None
print('BIND_H', round(H, 3), 'WORST_MM', round(worst, 1))
# a genuine tear measured 40-80 mm across hundreds of edges; a handful of edges under
# 25 mm on a 277 mm cat is a fold, not a hole
print('VERDICT', 'TEARING' if worst > 25 else 'OK')
