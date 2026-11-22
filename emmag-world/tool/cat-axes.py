"""Which local axis swings a leg, and in which direction? Prints paw-tip travel for a
+30 deg probe on each axis, so the clips can be authored against measured behaviour
instead of guessed signs.

    blender -b -P probe_pose.py -- rigged.glb
"""
import bpy, sys, math
from mathutils import Vector

src = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = [o for o in bpy.context.scene.objects if o.type == 'ARMATURE'][0]
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='POSE')
for pb in arm.pose.bones:
    pb.rotation_mode = 'XYZ'

def tip(name):
    bpy.context.view_layer.update()
    return arm.matrix_world @ arm.pose.bones[name].tail

for bone, probe in (('hindUpL', 'hindPawL'), ('frontUpL', 'frontPawL'), ('Tail_1', 'Tail_2')):
    base = tip(probe)
    for axis in 'XYZ':
        for deg in (30, -30):
            for pb in arm.pose.bones:
                pb.rotation_euler = (0, 0, 0)
            setattr(arm.pose.bones[bone].rotation_euler, axis.lower(), math.radians(deg))
            d = tip(probe) - base
            print(f'{bone:9s} {axis}{deg:+4d}  d=({d.x:+.3f},{d.y:+.3f},{d.z:+.3f})')
for pb in arm.pose.bones:
    pb.rotation_euler = (0, 0, 0)
bpy.context.view_layer.update()
print('REST paw', tuple(round(v, 3) for v in arm.matrix_world @ arm.pose.bones['frontPawL'].tail),
      'hips', tuple(round(v, 3) for v in arm.matrix_world @ arm.pose.bones['hips'].head))
