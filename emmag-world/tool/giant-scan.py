#!/usr/bin/env python3
"""Sleeping giant from the uploaded scan (white_mesh.glb).

Blender 5.2:  blender -b -P tool/giant-scan.py -- --out g.glb --preview-dir pv --facing 180

Source scan is 4 loose islands; the one we want is the seated giant with a tiny
girl standing at his side (6,024 tris). This script drops the other islands,
cuts the girl and the stray shards, orients him to face -Y (=> glTF +Z), scales
him to the in-game 7.0 m, lays a texture + vertex-colour moss on the stone and
adds the two Eye nodes the game animates.
"""
import bpy
import bmesh
import math
import sys
from mathutils import Vector, Euler

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


SRC = arg("--src", "tool/giant-scan-source.glb")
OUT = arg("--out", "giant_scan.glb")
PREVIEW = arg("--preview-dir", "preview_scan")
TEX = arg("--tex", "public/models/giant_stone.png")
FACING = float(arg("--facing", "0"))      # extra Z spin, degrees
HEIGHT = 7.0
TARGET_TRIS = 6024
GIRL = Vector((-0.900, -0.125, -0.080))
GIRL_R = 0.115

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)

body = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
bpy.context.view_layer.objects.active = body
body.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.separate(type='LOOSE')
bpy.ops.object.mode_set(mode='OBJECT')

parts = [o for o in bpy.context.scene.objects if o.type == 'MESH']
giant = min(parts, key=lambda p: abs(len(p.data.polygons) - TARGET_TRIS))
for p in parts:
    if p is not giant:
        bpy.data.objects.remove(p, do_unlink=True)
print("[Giant] picked", len(giant.data.polygons), "tris")

# --- cut the girl and anything thinner than a shard ------------------------
bm = bmesh.new()
bm.from_mesh(giant.data)
kill = [f for f in bm.faces if (f.calc_center_median() - GIRL).length < GIRL_R]
bmesh.ops.delete(bm, geom=kill, context='FACES')
bm.to_mesh(giant.data)
bm.free()
print("[Giant] girl faces removed:", len(kill))

bpy.context.view_layer.objects.active = giant
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=0.0008)
bpy.ops.mesh.delete_loose()
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode='OBJECT')

# the scan is an open shell: missing face-side and knee panels are holes, not
# silhouettes -> fill every boundary loop, big ones included
bm = bmesh.new()
bm.from_mesh(giant.data)
seen = set()
loops = []
for e in [e for e in bm.edges if len(e.link_faces) == 1]:
    if e.index in seen:
        continue
    stack, loop = [e], []
    seen.add(e.index)
    while stack:
        cur = stack.pop()
        loop.append(cur)
        for v in cur.verts:
            for n in v.link_edges:
                if n.index not in seen and len(n.link_faces) == 1:
                    seen.add(n.index)
                    stack.append(n)
    loops.append(loop)
print("[Giant] boundary loops", len(loops),
      "perimeters", sorted(round(sum(e.calc_length() for e in l), 3) for l in loops)[-6:])
for loop in loops:
    if len(loop) < 3:
        continue
    cap_r = sum(e.calc_length() for e in loop) / 4.0
    bm.faces.ensure_lookup_table()
    first = len(bm.faces)
    bco = [v.co.copy() for e in loop for v in e.verts]
    bmesh.ops.holes_fill(bm, edges=loop, sides=0)
    bm.faces.ensure_lookup_table()
    cap = [f for f in bm.faces if f.index >= first]
    if not cap:
        continue
    # a bare n-gon reads as a flat plate where the scan was chopped off ->
    # subdivide it and bulge the middle out so the cheek/knee reads round
    pedges = {e for f in cap for e in f.edges}
    bmesh.ops.subdivide_edges(bm, edges=list(pedges), cuts=2, use_grid_fill=True)
    bm.faces.ensure_lookup_table()
    cap = [f for f in bm.faces if f.index >= first]
    nrm = Vector((0, 0, 0))
    for f in cap:
        nrm += f.normal * f.calc_area()
    if nrm.length < 1e-6:
        continue
    nrm.normalize()
    # subdivide rebuilds the boundary verts, so match by position
    verts = {v for f in cap for v in f.verts
             if min((v.co - c).length for c in bco) > 1e-5}
    if not verts:
        continue
    reach = 0.45 * cap_r
    for v in verts:
        d = min((v.co - c).length for c in bco)
        w = min(1.0, d / reach) if reach > 1e-6 else 0.0
        v.co += nrm * (w * 0.55 * cap_r)
    bmesh.ops.smooth_vert(bm, verts=list(verts), factor=0.6, use_axis_x=True,
                          use_axis_y=True, use_axis_z=True)

bm.to_mesh(giant.data)
bm.free()

# level the base: the girl's cut left the slab edge ragged
bm = bmesh.new()
bm.from_mesh(giant.data)
zs = [v.co.z for v in bm.verts]
cut = min(zs) + (max(zs) - min(zs)) * 0.10
res = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:],
                             plane_co=(0, 0, cut), plane_no=(0, 0, 1),
                             clear_inner=True)
cut_edges = [g for g in res["geom_cut"] if isinstance(g, bmesh.types.BMEdge)]
# cap only the cut, never the scan's own holes
if cut_edges:
    bmesh.ops.holes_fill(bm, edges=cut_edges, sides=0)
bm.to_mesh(giant.data)
bm.free()
print("[Giant] base levelled at z", round(cut, 3), "cap edges", len(cut_edges))

# drop small floating shards left behind
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.separate(type='LOOSE')
bpy.ops.object.mode_set(mode='OBJECT')
parts = [o for o in bpy.context.scene.objects if o.type == 'MESH']
giant = max(parts, key=lambda p: len(p.data.polygons))
for p in parts:
    if p is not giant:
        bpy.data.objects.remove(p, do_unlink=True)
bpy.context.view_layer.objects.active = giant
print("[Giant] after shard cleanup", len(giant.data.polygons), "tris")

# --- orient, scale, sit on the ground --------------------------------------
bpy.ops.object.select_all(action='DESELECT')
giant.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

bbox = [giant.matrix_world @ Vector(c) for c in giant.bound_box]
mn = Vector((min(v.x for v in bbox), min(v.y for v in bbox), min(v.z for v in bbox)))
mx = Vector((max(v.x for v in bbox), max(v.y for v in bbox), max(v.z for v in bbox)))
scale = HEIGHT / (mx.z - mn.z)
giant.scale = (scale, scale, scale)
bpy.ops.object.transform_apply(scale=True)

giant.rotation_euler = Euler((0, 0, math.radians(FACING)), 'XYZ')
bpy.ops.object.transform_apply(rotation=True)

bbox = [giant.matrix_world @ Vector(c) for c in giant.bound_box]
mn = Vector((min(v.x for v in bbox), min(v.y for v in bbox), min(v.z for v in bbox)))
mx = Vector((max(v.x for v in bbox), max(v.y for v in bbox), max(v.z for v in bbox)))
giant.location = (-(mn.x + mx.x) / 2, -(mn.y + mx.y) / 2, -mn.z)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bbox = [giant.matrix_world @ Vector(c) for c in giant.bound_box]
mn = Vector((min(v.x for v in bbox), min(v.y for v in bbox), min(v.z for v in bbox)))
mx = Vector((max(v.x for v in bbox), max(v.y for v in bbox), max(v.z for v in bbox)))
print("[Giant] size", [round(v, 2) for v in (mx - mn)], "height", round(mx.z, 2))

# --- materials: stone (texture x vertex colour) + grass base --------------
img = bpy.data.images.load(bpy.path.abspath(TEX)) if TEX else None
for im in bpy.data.images:
    if im is img:
        im.colorspace_settings.name = 'sRGB'

attr = giant.data.color_attributes.new(name="Col", type='BYTE_COLOR', domain='CORNER')
stone_lo = Vector((0.86, 0.88, 0.92))
stone_hi = Vector((1.0, 1.0, 1.0))
for poly in giant.data.polygons:
    up = poly.normal.z
    for li in poly.loop_indices:
        co = giant.data.vertices[giant.data.loops[li].vertex_index].co
        # soft moss on up-facing shelves, pale dust in crevices
        n = 0.5 + 0.5 * math.sin(co.x * 2.3) * math.cos(co.z * 1.7)
        t = min(1.0, max(0.0, 0.45 + 0.55 * n)) * (0.55 + 0.45 * max(0.0, up))
        c = stone_lo.lerp(stone_hi, t)
        if up > 0.25 and co.z < HEIGHT * 0.06:
            c = Vector((0.30, 0.46, 0.20))        # grass under him
        giant.data.color_attributes["Col"].data[li].color = (c.x, c.y, c.z, 1.0)

mat = bpy.data.materials.new("Stone")
mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes["Principled BSDF"]
bsdf.inputs["Roughness"].default_value = 0.92
bsdf.inputs["Metallic"].default_value = 0.0
if img:
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.location = (-620, 120)
    vcol = nt.nodes.new("ShaderNodeVertexColor")
    vcol.layer_name = "Col"
    vcol.location = (-620, -140)
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs["Factor"].default_value = 1.0
    mix.location = (-330, 0)
    nt.links.new(tex.outputs["Color"], mix.inputs[6])
    nt.links.new(vcol.outputs["Color"], mix.inputs[7])
    nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
else:
    nt.links.new(bsdf.inputs["Base Color"], bsdf.inputs["Base Color"])

giant.data.materials.clear()
giant.data.materials.append(mat)
for p in giant.data.polygons:
    p.use_smooth = False

# --- UVs ----------------------------------------------------------------
bpy.ops.object.select_all(action='DESELECT')
giant.select_set(True)
bpy.context.view_layer.objects.active = giant
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
# UVs shrunk so the moss pattern reads at 8-15 m instead of per-island camo
uv = giant.data.uv_layers.active.data
for loop in uv:
    loop.uv = (loop.uv[0] * 0.45 + 0.27, loop.uv[1] * 0.45 + 0.27)
bpy.ops.object.mode_set(mode='OBJECT')

# --- eyes the game can open ---------------------------------------------
# --- export -------------------------------------------------------------
for o in bpy.context.scene.objects:
    o.select_set(o.type == 'MESH')
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    use_selection=True,
    export_apply=True,
    export_yup=True,
    export_normals=True,
    export_texcoords=True,
)

# --- previews -----------------------------------------------------------
bpy.context.scene.render.engine = 'CYCLES'
bpy.context.scene.cycles.samples = 16
bpy.context.scene.render.resolution_x = 700
bpy.context.scene.render.resolution_y = 700
if not bpy.context.scene.world:
    bpy.context.scene.world = bpy.data.worlds.new("W")
bpy.context.scene.world.use_nodes = True
bpy.context.scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.13, 0.16, 0.2, 1)

sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", 'SUN'))
bpy.context.collection.objects.link(sun)
sun.data.energy = 3.2
sun.rotation_euler = (math.radians(52), 0, math.radians(38))

cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
bpy.context.collection.objects.link(cam)
cam.data.type = 'ORTHO'
cam.data.ortho_scale = HEIGHT * 1.15
bpy.context.scene.camera = cam
import os
os.makedirs(PREVIEW, exist_ok=True)
target = Vector((0, 0, HEIGHT * 0.45))
for name, d in (("front", (0, -1, 0)), ("side", (1, 0, 0)), ("back", (0, 1, 0)), ("threequarter", (-0.8, -1, 0.35))):
    cam.location = target + Vector(d) * (HEIGHT * 3)
    cam.rotation_euler = (target - cam.location).normalized().to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.render.filepath = f"{PREVIEW}/giant_{name}.png"
    bpy.ops.render.render(write_still=True)
print("[Giant] DONE")
