# split the scan into its 5 cat copies, keep one, save a single-cat glb
import bpy, bmesh, sys, random
from mathutils import Vector

src, out = sys.argv[sys.argv.index('--') + 1], sys.argv[sys.argv.index('--') + 2]
KEEP = int(sys.argv[sys.argv.index('--') + 3]) if len(sys.argv) > sys.argv.index('--') + 3 else None
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
o = [x for x in bpy.data.objects if x.type == 'MESH'][0]
bpy.context.view_layer.objects.active = o; o.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.separate(type='LOOSE')
bpy.ops.object.mode_set(mode='OBJECT')

parts = [x for x in bpy.data.objects if x.type == 'MESH']
cent = []
for p in parts:
    c = sum((p.matrix_world @ v.co for v in p.data.vertices), Vector()) / len(p.data.vertices)
    cent.append((c.x, c.y, c.z))

# k-means k=5 on the island centroids (the sheet is 5 copies)
random.seed(1)
cent5 = [cent[i] for i in random.sample(range(len(cent)), 5)]
for _ in range(40):
    asg = [min(range(5), key=lambda k: sum((c[j] - cent5[k][j]) ** 2 for j in range(3))) for c in cent]
    for k in range(5):
        grp = [cent[i] for i in range(len(cent)) if asg[i] == k]
        if grp: cent5[k] = tuple(sum(c[j] for c in grp) / len(grp) for j in range(3))

groups = {k: [parts[i] for i in range(len(parts)) if asg[i] == k] for k in range(5)}
info = []
for k, g in groups.items():
    bb = [p.matrix_world @ Vector(c) for p in g for c in p.bound_box]
    x = [v.x for v in bb]; y = [v.y for v in bb]; z = [v.z for v in bb]
    tris = sum(len(p.data.polygons) for p in g)
    info.append((k, tris, round(sum(y)/len(y), 2), round(sum(z)/len(z), 2),
                 round(max(y)-min(y), 2), round(max(z)-min(z), 2), round(max(x)-min(x), 2)))
info.sort(key=lambda r: (-r[3], r[2]))
for r in info:
    print('CLUSTER k=%d tris=%4d cy=%5.2f cz=%5.2f span_y=%4.2f span_z=%4.2f depth_x=%4.2f' % r)
print('KEEP', KEEP, 'clusters', [(r[0], r[1]) for r in info])
if KEEP is None:
    raise SystemExit
for k, g in groups.items():
    if k != KEEP:
        for p in g:
            bpy.data.objects.remove(p, do_unlink=True)
rest = [x for x in bpy.data.objects if x.type == 'MESH']
bpy.context.view_layer.objects.active = rest[0]
for p in rest: p.select_set(True)
if len(rest) > 1:
    bpy.ops.object.join()
cat = [x for x in bpy.data.objects if x.type == 'MESH'][0]
# re-centre so the paws sit on z=0 and the body sits at the origin
bb = [cat.matrix_world @ Vector(c) for c in cat.bound_box]
zmin = min(v.z for v in bb)
cx = (max(v.x for v in bb) + min(v.x for v in bb)) / 2
cy = (max(v.y for v in bb) + min(v.y for v in bb)) / 2
flip = 'flip' in sys.argv[sys.argv.index('--') + 2:]
for v in cat.data.vertices:
    v.co.x -= cx; v.co.y -= cy; v.co.z -= zmin
    if flip: v.co = Vector((-v.co.x, -v.co.y, v.co.z))   # nose to -Y, the way the loader expects
cat.data.update()
bb = [cat.matrix_world @ Vector(c) for c in cat.bound_box]
print('KEPT size=(%.2f,%.2f,%.2f) tris=%d' % (max(v.x for v in bb)-min(v.x for v in bb),
      max(v.y for v in bb)-min(v.y for v in bb), max(v.z for v in bb)-min(v.z for v in bb), len(cat.data.polygons)))
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=False, export_apply=True)
print('wrote', out)
