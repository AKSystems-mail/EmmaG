import bpy
import bmesh
import math
import sys
import os
import argparse
import random
from mathutils import Vector, Matrix, Euler, noise


# ==============================================================================
# 1. COLOR & MATERIAL HELPERS
# ==============================================================================

def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_linear_rgba(hex_str):
    h = hex_str.lstrip("#")
    r = srgb_to_linear(int(h[0:2], 16) / 255.0)
    g = srgb_to_linear(int(h[2:4], 16) / 255.0)
    b = srgb_to_linear(int(h[4:6], 16) / 255.0)
    return (r, g, b, 1.0)


def make_flat_material(name, hex_color, roughness=0.92):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = hex_to_linear_rgba(hex_color)
        bsdf.inputs["Roughness"].default_value = roughness
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = 0.0
        if "Specular IOR Level" in bsdf.inputs:
            bsdf.inputs["Specular IOR Level"].default_value = 0.15
        elif "Specular" in bsdf.inputs:
            bsdf.inputs["Specular"].default_value = 0.15
    return mat


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


# ==============================================================================
# 2. PROCEDURAL BMesh BUILDERS
# ==============================================================================

def create_mesh_obj(name, bm, mat_list, default_mat_idx=0):
    bm.normal_update()
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()

    for m in mat_list:
        mesh.materials.append(m)
    for poly in mesh.polygons:
        poly.use_smooth = False
        if default_mat_idx != 0:
            poly.material_index = default_mat_idx

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def add_lofted_tube(bm, points_radii, segments=14, cap_ends=True, noise_amp=0.04, noise_freq=1.2):
    """Creates a segmented organic limb/torso loft along 3D (Vector, rx, ry) points."""
    rings = []
    n_pts = len(points_radii)
    for idx, (pt, rx, ry) in enumerate(points_radii):
        if idx == 0:
            tangent = (points_radii[1][0] - pt).normalized()
        elif idx == n_pts - 1:
            tangent = (pt - points_radii[idx - 1][0]).normalized()
        else:
            tangent = (points_radii[idx + 1][0] - points_radii[idx - 1][0]).normalized()

        ref = Vector((1, 0, 0)) if abs(tangent.z) > 0.9 else Vector((0, 0, 1))
        u = tangent.cross(ref).normalized()
        v = tangent.cross(u).normalized()

        ring = []
        for s in range(segments):
            ang = (2.0 * math.pi * s) / segments
            offset = u * (math.cos(ang) * rx) + v * (math.sin(ang) * ry)
            pos = pt + offset
            if noise_amp > 0.0:
                n = noise.noise(pos * noise_freq)
                pos += offset.normalized() * (n * noise_amp)
            ring.append(bm.verts.new(pos))
        rings.append(ring)

    for r in range(len(rings) - 1):
        r0, r1 = rings[r], rings[r + 1]
        for s in range(segments):
            s_next = (s + 1) % segments
            bm.faces.new((r0[s], r0[s_next], r1[s_next], r1[s]))

    if cap_ends:
        # Rounded end caps
        p_start = points_radii[0][0]
        t_start = (points_radii[1][0] - p_start).normalized()
        c_start = bm.verts.new(p_start - t_start * (min(points_radii[0][1], points_radii[0][2]) * 0.45))
        for s in range(segments):
            s_next = (s + 1) % segments
            bm.faces.new((rings[0][s_next], rings[0][s], c_start))

        p_end = points_radii[-1][0]
        t_end = (p_end - points_radii[-2][0]).normalized()
        c_end = bm.verts.new(p_end + t_end * (min(points_radii[-1][1], points_radii[-1][2]) * 0.45))
        for s in range(segments):
            s_next = (s + 1) % segments
            bm.faces.new((rings[-1][s], rings[-1][s_next], c_end))


def add_icosphere_scaled(bm, center, scale_vec, rot_euler=(0, 0, 0), subdivisions=4, noise_amp=0.03):
    rot = Euler(rot_euler, "XYZ").to_matrix().to_4x4()
    scl = Matrix.Diagonal((scale_vec[0], scale_vec[1], scale_vec[2], 1.0))
    trn = Matrix.Translation(center)
    res = bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=1.0)
    for v in res["verts"]:
        p = trn @ rot @ scl @ v.co
        if noise_amp > 0.0:
            p += (p - Vector(center)).normalized() * (noise.noise(p * 1.4) * noise_amp)
        v.co = p
    return res["verts"]


# ==============================================================================
# 3. BUILD SLEEPING GIANT COMPONENTS
# ==============================================================================

def build_sleeping_giant(out_glb, preview_dir=None):
    clear_scene()
    rng = random.Random(42)

    # Materials (0..7)
    mat_stone = make_flat_material("Stone", "#9aa7b8", 0.94)
    mat_shadow = make_flat_material("Stone_Shadow", "#6f6f8a", 0.95)
    mat_lichen = make_flat_material("Lichen", "#d9d2b4", 0.95)
    mat_moss_mid = make_flat_material("Moss_Mid", "#6f9b52", 0.93)
    mat_moss_dark = make_flat_material("Moss_Dark", "#4a6b3a", 0.93)
    mat_nest = make_flat_material("Nest_Wood", "#6e5239", 0.95)
    mat_cream = make_flat_material("Cream_Detail", "#e6e2cf", 0.88)
    mat_egg = make_flat_material("Egg_Blue", "#c7d9e0", 0.80)

    all_mats = [
        mat_stone,      # 0
        mat_shadow,     # 1
        mat_lichen,     # 2
        mat_moss_mid,   # 3
        mat_moss_dark,  # 4
        mat_nest,       # 5
        mat_cream,      # 6
        mat_egg,        # 7
    ]

    created_objs = []

    # --------------------------------------------------------------------------
    # A. GRASSY MOUND BASE (Origin bottom-center at Z=0, width ~6.3m, depth ~4.6m)
    # --------------------------------------------------------------------------
    bm_mound = bmesh.new()
    bmesh.ops.create_icosphere(bm_mound, subdivisions=4, radius=1.0)
    for v in bm_mound.verts:
        if v.co.z < 0.0:
            v.co.z = 0.0
        else:
            # Flatten into a broad low mound with organic faceted edges
            v.co.z = (v.co.z ** 0.72) * 0.85
        v.co.x *= 3.18
        v.co.y *= 2.28
        if v.co.z > 0.05:
            v.co.z += noise.noise(v.co * 0.9) * 0.12
            v.co.x += noise.noise(v.co * 0.8 + Vector((10, 0, 0))) * 0.12
            v.co.y += noise.noise(v.co * 0.8 + Vector((0, 10, 0))) * 0.10

    obj_mound = create_mesh_obj("Mound", bm_mound, all_mats, default_mat_idx=3)
    for poly in obj_mound.data.polygons:
        # Steep sides & bottom get Dark Pine Moss, top gets Mid-Green Moss
        if poly.normal.z < 0.55:
            poly.material_index = 4
        else:
            poly.material_index = 3
    created_objs.append(obj_mound)

    # Grass tufts around mound perimeter
    bm_grass = bmesh.new()
    for i in range(18):
        ang = (i / 18.0) * 2.0 * math.pi + rng.uniform(-0.12, 0.12)
        rad_scale = rng.uniform(0.75, 0.94)
        gx = math.cos(ang) * 3.05 * rad_scale
        gy = math.sin(ang) * 2.15 * rad_scale
        gz = 0.42
        for blade in range(3):
            bx = gx + rng.uniform(-0.12, 0.12)
            by = gy + rng.uniform(-0.12, 0.12)
            h = rng.uniform(0.22, 0.38)
            tilt_x = math.cos(ang) * 0.14 + rng.uniform(-0.08, 0.08)
            tilt_y = math.sin(ang) * 0.14 + rng.uniform(-0.08, 0.08)
            v0 = bm_grass.verts.new((bx - 0.05, by, gz - 0.05))
            v1 = bm_grass.verts.new((bx + 0.05, by + 0.04, gz - 0.05))
            v2 = bm_grass.verts.new((bx, by - 0.05, gz - 0.05))
            vt = bm_grass.verts.new((bx + tilt_x, by + tilt_y, gz + h))
            bm_grass.faces.new((v0, v1, vt))
            bm_grass.faces.new((v1, v2, vt))
            bm_grass.faces.new((v2, v0, vt))
    created_objs.append(create_mesh_obj("GrassTufts", bm_grass, all_mats, default_mat_idx=4))

    # --------------------------------------------------------------------------
    # B. STONE GIANT BODY (Torso, Pelvis, Crossed Legs, Arms, Hands, Head)
    # --------------------------------------------------------------------------
    bm_giant = bmesh.new()

    # 1. Pelvis / Seat (sits into mound around Z=0.75..1.85)
    add_icosphere_scaled(
        bm_giant,
        center=(0.0, 0.18, 1.35),
        scale_vec=(1.62, 1.22, 0.72),
        subdivisions=4,
        noise_amp=0.05,
    )

    # 2. Slumped Torso: Width ~3.4m (rx=1.70), Belly Depth ~2.6m (ry=1.30)
    torso_profile = [
        (Vector((0.0,  0.18, 1.45)), 1.50, 1.18),
        (Vector((0.0,  0.02, 2.35)), 1.66, 1.30),  # Belly (depth ~2.6m)
        (Vector((0.0, -0.10, 3.35)), 1.70, 1.24),  # Lower chest (width ~3.4m)
        (Vector((0.0, -0.18, 4.35)), 1.64, 1.14),  # Upper chest
        (Vector((0.0, -0.22, 5.10)), 1.36, 0.92),  # Shoulders
        (Vector((0.0, -0.30, 5.52)), 0.72, 0.62),  # Neck base
    ]
    add_lofted_tube(bm_giant, torso_profile, segments=28, cap_ends=True, noise_amp=0.04, noise_freq=1.0)

    # Shoulder: the cap alone reads as a ball stuck on the side. One tapered mass
    # from the neck base out over the cap gives the deltoid-to-torso slope; a thin
    # proud ridge instead reads as a slit, so this stays wide and inside the body
    for side in (-1.0, 1.0):
        trap_pts = [
            (Vector((side * 0.26, -0.26, 5.44)), 0.50, 0.45),
            (Vector((side * 0.88, -0.22, 5.22)), 0.55, 0.49),
            (Vector((side * 1.40, -0.17, 4.90)), 0.62, 0.57),
        ]
        add_lofted_tube(bm_giant, trap_pts, segments=14, cap_ends=True, noise_amp=0.02)

    # Rounded shoulder caps
    for side in (-1.0, 1.0):
        add_icosphere_scaled(
            bm_giant,
            center=(side * 1.45, -0.16, 4.88),
            scale_vec=(0.68, 0.65, 0.56),
            rot_euler=(0.15, side * -0.25, 0.0),
            subdivisions=3,
            noise_amp=0.03,
        )

    # 3. Crossed Legs (Knee span ~5.5m -> outer knee X reaches ~ +/- 2.75m)
    for side in (-1.0, 1.0):
        # Thigh: Hip -> Knee
        thigh_pts = [
            (Vector((side * 0.95,  0.05, 1.25)), 0.62, 0.58),
            (Vector((side * 1.68, -0.58, 1.34)), 0.56, 0.52),
            (Vector((side * 2.26, -1.10, 1.36)), 0.48, 0.46),
        ]
        add_lofted_tube(bm_giant, thigh_pts, segments=20, cap_ends=True, noise_amp=0.03)

        # Knee bulge (pushes span to ~5.5m)
        add_icosphere_scaled(
            bm_giant,
            center=(side * 2.32, -1.12, 1.36),
            scale_vec=(0.45, 0.46, 0.44),
            subdivisions=3,
            noise_amp=0.02,
        )

        # Shin / Calf folding inward across front (left shin slightly in front of right)
        y_off = -0.18 if side > 0 else 0.05
        z_off = 0.06 if side > 0 else -0.04
        shin_pts = [
            (Vector((side * 2.20, -1.18 + y_off * 0.3, 1.28 + z_off)), 0.44, 0.42),
            (Vector((side * 1.10, -1.65 + y_off, 1.12 + z_off)), 0.40, 0.38),
            (Vector((-side * 0.15, -1.82 + y_off, 1.02 + z_off)), 0.34, 0.32),
            (Vector((-side * 1.15, -1.65 + y_off, 0.96 + z_off)), 0.30, 0.28),
        ]
        add_lofted_tube(bm_giant, shin_pts, segments=18, cap_ends=True, noise_amp=0.025)

        # Foot: Foot Length ~1.4m, Foot Thickness ~0.7m
        # Foot: the forward one is turned on its side -- sole out, toes forward --
        # the lotus read where the underside of the foot shows from the side
        if side > 0:
            add_icosphere_scaled(
                bm_giant,
                center=Vector((-1.58, -1.86, 1.06)),
                scale_vec=(0.70, 0.40, 0.33),
                rot_euler=(0.0, 1.02, -0.20),
                subdivisions=3,
                noise_amp=0.02,
            )
        else:
            add_icosphere_scaled(
                bm_giant,
                center=Vector((1.46, -1.50, 0.88)),
                scale_vec=(0.70, 0.40, 0.35),
                rot_euler=(0.0, 0.08 * side, -side * 0.32),
                subdivisions=3,
                noise_amp=0.02,
            )
    # 4. Arms & Hands
    # Upper Arm Diameter ~0.9m (r=0.45), Forearm Diameter ~0.75m (r=0.375), Hand Length ~1.1m
    for side in (-1.0, 1.0):
        # Upper Arm: Shoulder -> Elbow
        upper_arm_pts = [
            (Vector((side * 1.55, -0.15, 4.78)), 0.46, 0.45),
            (Vector((side * 1.82, -0.35, 3.85)), 0.45, 0.44),
            (Vector((side * 1.92, -0.62, 3.05)), 0.42, 0.41),
        ]
        add_lofted_tube(bm_giant, upper_arm_pts, segments=18, cap_ends=True, noise_amp=0.025)

        # Elbow: the joint is a rounded stone knob, wider than either tube end, so
        # the arm bends through a ball instead of two cones butted together
        add_icosphere_scaled(
            bm_giant,
            center=(side * 1.91, -0.63, 3.02),
            scale_vec=(0.45, 0.44, 0.44),
            subdivisions=3,
            noise_amp=0.015,
        )

        # Forearm: Elbow -> Wrist on knee/lap
        forearm_pts = [
            (Vector((side * 1.90, -0.64, 3.00)), 0.39, 0.38),
            (Vector((side * 1.56, -1.16, 2.38)), 0.375, 0.365),
            (Vector((side * 1.12, -1.52, 1.88)), 0.34, 0.32),
        ]
        add_lofted_tube(bm_giant, forearm_pts, segments=18, cap_ends=True, noise_amp=0.02)

        # Hand: a mitten. Stone does not have knuckles, and four tubes read as
        # claws at gameplay distance -- one lobe plus a thumb is the whole hand
        hand_center = Vector((side * 0.72, -1.68, 1.66))
        add_icosphere_scaled(
            bm_giant,
            center=hand_center,
            scale_vec=(0.46, 0.42, 0.20),
            rot_euler=(0.25, side * -0.22, side * 0.55),
            subdivisions=4,
            noise_amp=0.015,
        )
        add_icosphere_scaled(
            bm_giant,
            center=(hand_center.x - side * 0.30, hand_center.y - 0.18, hand_center.z + 0.05),
            scale_vec=(0.17, 0.26, 0.14),
            rot_euler=(0.20, side * -0.15, side * 0.45),
            subdivisions=4,
            noise_amp=0.01,
        )

    # 5. Head (Dimensions ~1.6H x 1.3W x 1.5D, slumped forward)
    head_center = Vector((0.0, -0.84, 6.00))
    head_rot = (math.radians(36.0), 0.0, 0.0)
    HRM = Euler(head_rot, "XYZ").to_matrix()

    def head_world(local):
        # props on the skull are placed in head space so a deeper bow carries them
        return head_center + HRM @ Vector(local)
    head_verts = add_icosphere_scaled(
        bm_giant,
        center=head_center,
        scale_vec=(0.65, 0.75, 0.80),  # W=1.3m, D=1.5m, H=1.6m
        rot_euler=head_rot,
        subdivisions=4,
        noise_amp=0.02,
    )

    # Sculpt subtle brow, nose wedge, shut-eye slits, and relaxed mouth indentation
    head_rot_inv = Euler(head_rot, "XYZ").to_matrix().inverted()
    for v in head_verts:
        local = head_rot_inv @ (v.co - head_center)
        # Front of face is local -Y
        if local.y < -0.35:
            # Flatten cheeks/face slightly
            local.y *= 0.92
            # Brow ridge
            if 0.14 < local.z < 0.34 and abs(local.x) < 0.44:
                local.y -= 0.11
            # Nose bridge & tip
            if -0.15 < local.z < 0.22 and abs(local.x) < 0.13:
                nose_factor = 1.0 - (abs(local.x) / 0.13)
                local.y -= 0.20 * nose_factor * (0.28 - local.z) * 2.0
            # Recessed shut-eye slits
            if 0.02 < local.z < 0.12 and 0.14 < abs(local.x) < 0.40:
                local.y += 0.085
            # Relaxed mouth slit
            if -0.36 < local.z < -0.26 and abs(local.x) < 0.22:
                local.y += 0.065
            # Jaw / chin definition
            if local.z < -0.36 and abs(local.x) < 0.34:
                local.y -= 0.05
        v.co = head_center + (Euler(head_rot, "XYZ").to_matrix() @ local)

    # Low-poly ears
    for side in (-1.0, 1.0):
        add_icosphere_scaled(
            bm_giant,
            center=(side * 0.64, -0.68, 6.02),
            scale_vec=(0.10, 0.16, 0.22),
            rot_euler=(0.35, 0.0, side * 0.12),
            subdivisions=2,
            noise_amp=0.0,
        )

    obj_giant = create_mesh_obj("GiantBody", bm_giant, all_mats, default_mat_idx=0)

    # Assign Stone_Shadow, Lichen, and Moss zones directly on the giant's stone polygons
    for poly in obj_giant.data.polygons:
        c = poly.center
        n = poly.normal

        # Recessed eye slits & mouth shadow
        is_eye_zone = (c.y < -1.15 and 5.95 < c.z < 6.18 and 0.12 < abs(c.x) < 0.42 and n.y < -0.3)
        is_mouth_zone = (c.y < -1.10 and 5.65 < c.z < 5.78 and abs(c.x) < 0.24 and n.y < -0.3)
        is_deep_underside = (n.z < -0.45 and c.z > 1.2)

        # Pale Cream Lichen patches (belly right-center, left shin, crown)
        # body is one grey; the pale patches read as paint on stone
        is_belly_lichen = False
        is_shin_lichen = False

        # Moss patches on shoulders, upper back, and head crown
        is_shoulder_moss = (
            c.z > 4.30 and c.z < 5.55 and n.z > 0.22
            and (abs(c.x) > 0.55 or c.y > 0.1)
            and noise.noise(c * 1.6) > -0.30
        )
        is_back_moss = (
            c.y > 0.30 and c.z > 2.20 and n.y > 0.20
            and noise.noise(c * 1.3) > -0.05
        )
        is_head_moss = (
            c.z > 6.45 and n.z > 0.35
            and (c.x > -0.15 or c.y > -0.65)
            and noise.noise(c * 2.1) > -0.18
        )

        if is_eye_zone or is_mouth_zone or is_deep_underside:
            poly.material_index = 1  # Dusty Violet Shadow
        elif is_head_moss or is_shoulder_moss or is_back_moss:
            poly.material_index = 4 if noise.noise(c * 3.0) > 0.15 else 3
        elif is_belly_lichen or is_shin_lichen:
            poly.material_index = 2  # Pale Cream Lichen
        else:
            poly.material_index = 0  # Cool Grey-Blue Stone

    created_objs.append(obj_giant)

    # --------------------------------------------------------------------------
    # C. BIRD'S NEST + 3 EGGS ON GIANT'S LEFT SHOULDER (+X)
    # --------------------------------------------------------------------------
    nest_pos = Vector((1.42, -0.16, 5.38))
    nest_rot = (0.12, 0.18, 0.0)
    bm_nest = bmesh.new()

    # Bowl ring of twigs
    segs = 14
    outer_r = 0.50
    inner_r = 0.30
    rot_m = Euler(nest_rot, "XYZ").to_matrix().to_4x4()
    trn_m = Matrix.Translation(nest_pos)

    ring_bot_out, ring_top_out, ring_top_in, ring_bot_in = [], [], [], []
    for s in range(segs):
        a = (2.0 * math.pi * s) / segs
        wobble = 1.0 + 0.08 * math.sin(a * 5.0)
        ca, sa = math.cos(a), math.sin(a)
        p_bo = Vector((ca * outer_r * 0.88 * wobble, sa * outer_r * 0.88 * wobble, -0.10))
        p_to = Vector((ca * outer_r * wobble, sa * outer_r * wobble, 0.14 + 0.03 * math.cos(a * 3.0)))
        p_ti = Vector((ca * inner_r, sa * inner_r, 0.10))
        p_bi = Vector((ca * inner_r * 0.75, sa * inner_r * 0.75, -0.05))
        for lst, p in ((ring_bot_out, p_bo), (ring_top_out, p_to), (ring_top_in, p_ti), (ring_bot_in, p_bi)):
            lst.append(bm_nest.verts.new(trn_m @ rot_m @ p))

    for s in range(segs):
        sn = (s + 1) % segs
        bm_nest.faces.new((ring_bot_out[s], ring_bot_out[sn], ring_top_out[sn], ring_top_out[s]))
        bm_nest.faces.new((ring_top_out[s], ring_top_out[sn], ring_top_in[sn], ring_top_in[s]))
        bm_nest.faces.new((ring_top_in[s], ring_top_in[sn], ring_bot_in[sn], ring_bot_in[s]))
    bm_nest.faces.new(ring_bot_in)
    bm_nest.faces.new(list(reversed(ring_bot_out)))
    created_objs.append(create_mesh_obj("BirdsNest", bm_nest, all_mats, default_mat_idx=5))

    # 3 Eggs inside nest
    bm_eggs = bmesh.new()
    egg_offsets = [
        Vector((-0.11, -0.04, 0.04)),
        Vector((0.09, -0.06, 0.04)),
        Vector((0.00, 0.10, 0.05)),
    ]
    for off in egg_offsets:
        ep = trn_m @ rot_m @ off
        add_icosphere_scaled(
            bm_eggs,
            center=ep,
            scale_vec=(0.085, 0.085, 0.115),
            rot_euler=(rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), 0.0),
            subdivisions=3,
            noise_amp=0.0,
        )
    created_objs.append(create_mesh_obj("NestEggs", bm_eggs, all_mats, default_mat_idx=7))

    # --------------------------------------------------------------------------
    # D. CREAM MUSHROOMS & WILDFLOWER TUFTS ON HEAD
    # --------------------------------------------------------------------------
    bm_mush = bmesh.new()
    mush_specs = [
        (head_world((0.46, 0.533, 0.341)), (0.2, 0.35, 0.0), 1.0),
        (head_world((0.55, 0.391, 0.299)), (0.35, 0.55, 0.2), 0.72),
        (head_world((0.36, 0.658, 0.369)), (0.15, 0.22, -0.2), 0.58),
    ]
    for mpos, mrot, mscl in mush_specs:
        mr = Euler(mrot, "XYZ").to_matrix().to_4x4()
        mt = Matrix.Translation(mpos)
        # Stem
        stem = bmesh.ops.create_cone(
            bm_mush, cap_ends=True, cap_tris=False, segments=7,
            radius1=0.035 * mscl, radius2=0.025 * mscl, depth=0.14 * mscl
        )
        for v in stem["verts"]:
            v.co = mt @ mr @ (v.co + Vector((0, 0, 0.06 * mscl)))
        # Cap
        cap = bmesh.ops.create_icosphere(bm_mush, subdivisions=3, radius=0.11 * mscl)
        for v in cap["verts"]:
            if v.co.z < 0:
                v.co.z *= 0.25
            else:
                v.co.z *= 0.65
            v.co = mt @ mr @ (v.co + Vector((0, 0, 0.14 * mscl)))
    created_objs.append(create_mesh_obj("Mushrooms", bm_mush, all_mats, default_mat_idx=6))

    # Wildflower/moss tufts on head crown
    bm_head_tufts = bmesh.new()
    tuft_spots = [
        head_world((-0.05, 0.423, 0.639)),
        head_world((-0.26, 0.281, 0.575)),
        head_world((0.18, 0.495, 0.559)),
    ]
    for tp in tuft_spots:
        for _ in range(4):
            ang = rng.uniform(0, 2 * math.pi)
            h = rng.uniform(0.14, 0.24)
            dx, dy = math.cos(ang) * 0.08, math.sin(ang) * 0.08
            v0 = bm_head_tufts.verts.new(tp + Vector((-0.03, 0, -0.05)))
            v1 = bm_head_tufts.verts.new(tp + Vector((0.03, 0.02, -0.05)))
            v2 = bm_head_tufts.verts.new(tp + Vector((0, -0.03, -0.05)))
            vt = bm_head_tufts.verts.new(tp + Vector((dx, dy, h)))
            bm_head_tufts.faces.new((v0, v1, vt))
            bm_head_tufts.faces.new((v1, v2, vt))
            bm_head_tufts.faces.new((v2, v0, vt))
    created_objs.append(create_mesh_obj("HeadTufts", bm_head_tufts, all_mats, default_mat_idx=4))

    # --------------------------------------------------------------------------
    # 4. JOIN INTO SINGLE MESH, TARGET ~8,500 TRIANGLES, NORMALIZE SCALE & ORIGIN
    # --------------------------------------------------------------------------
    bpy.ops.object.select_all(action="DESELECT")
    for obj in created_objs:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = obj_giant
    bpy.ops.object.join()

    giant = bpy.context.active_object
    giant.name = "SleepingGiant"
    giant.data.name = "SleepingGiantMesh"

    def count_tris(obj):
        return sum(max(1, len(p.vertices) - 2) for p in obj.data.polygons)

    tris = count_tris(giant)
    print(f"[SleepingGiant] Initial triangle count: {tris}")

    # Calibrate into target range (6,000 - 9,000, target ~8,500)
    if tris < 18000:
        sub = giant.modifiers.new(name="Subdiv", type="SUBSURF")
        sub.subdivision_type = "SIMPLE"
        sub.levels = 1
        sub.render_levels = 1
        bpy.ops.object.modifier_apply(modifier=sub.name)
        tris = count_tris(giant)
        print(f"[SleepingGiant] After Simple Subdiv: {tris}")

    if tris > 22000:
        dec = giant.modifiers.new(name="Decimate", type="DECIMATE")
        dec.decimate_type = "COLLAPSE"
        dec.ratio = 20000.0 / float(tris)
        bpy.ops.object.modifier_apply(modifier=dec.name)
        tris = count_tris(giant)
        print(f"[SleepingGiant] After Decimate: {tris}")

    # Ensure flat shading across all polygons
    for poly in giant.data.polygons:
        poly.use_smooth = False

    # Normalize origin to bottom-center (0, 0, 0) and exact Seated Height = 7.0m
    coords = [v.co for v in giant.data.vertices]
    min_x = min(c.x for c in coords)
    max_x = max(c.x for c in coords)
    min_y = min(c.y for c in coords)
    max_y = max(c.y for c in coords)
    min_z = min(c.z for c in coords)
    max_z = max(c.z for c in coords)

    cx = 0.5 * (min_x + max_x)
    cy = 0.5 * (min_y + max_y)
    cur_h = max_z - min_z
    scale_factor = 7.0 / cur_h if cur_h > 0 else 1.0

    for v in giant.data.vertices:
        v.co.x = (v.co.x - cx) * scale_factor
        v.co.y = (v.co.y - cy) * scale_factor
        v.co.z = (v.co.z - min_z) * scale_factor

    giant.data.update()

    # --------------------------------------------------------------------------
    # 4b. EYES AS SEPARATE NODES -- the game opens and closes them by name
    # --------------------------------------------------------------------------
    HEAD_C = head_center

    def to_final(p):
        return Vector(((p.x - cx) * scale_factor, (p.y - cy) * scale_factor, (p.z - min_z) * scale_factor))

    eye_mat = make_flat_material("Eye", "#2b3140", 0.55)
    eye_objs = []
    zc = to_final(HEAD_C).z + 0.04 * scale_factor
    for side, tag in ((-1.0, "EyeL"), (1.0, "EyeR")):
        # cast back from in front of the face so the eye lands on real geometry
        ok, loc, nrm, _ = giant.ray_cast(Vector((side * 0.26, -14.0, zc)), Vector((0.0, 1.0, 0.0)))
        if not ok:
            local = Vector((side * 0.27 * 0.65, -0.66 * 0.75, 0.07 * 0.80))
            loc = to_final(HEAD_C + HRM @ local)
        loc = Vector(loc) + Vector((0.0, -0.02, 0.0))
        bm_eye = bmesh.new()
        bmesh.ops.create_icosphere(bm_eye, subdivisions=3, radius=1.0)
        for v in bm_eye.verts:
            v.co.x *= 0.105 * scale_factor
            v.co.y *= 0.045 * scale_factor
            v.co.z *= 0.085 * scale_factor
        eye = create_mesh_obj(tag, bm_eye, [eye_mat], default_mat_idx=0)
        eye.location = loc
        eye_objs.append(eye)
    print(f"[SleepingGiant] Eyes: {[o.name for o in eye_objs]}")

    final_tris = count_tris(giant)
    final_coords = [v.co for v in giant.data.vertices]
    print(
        f"[SleepingGiant] Final Tris: {final_tris} | "
        f"Size X: {max(c.x for c in final_coords) - min(c.x for c in final_coords):.2f}m | "
        f"Size Y: {max(c.y for c in final_coords) - min(c.y for c in final_coords):.2f}m | "
        f"Height Z: {max(c.z for c in final_coords) - min(c.z for c in final_coords):.2f}m"
    )

    # --------------------------------------------------------------------------
    # 5. EXPORT GLB (glTF 2.0 binary, +Y Up for Three.js)
    # --------------------------------------------------------------------------
    out_dir = os.path.dirname(os.path.abspath(out_glb))
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    bpy.ops.object.select_all(action="DESELECT")
    giant.select_set(True)
    for e in eye_objs:
        e.select_set(True)
    bpy.context.view_layer.objects.active = giant

    bpy.ops.export_scene.gltf(
        filepath=out_glb,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_materials="EXPORT",
        export_yup=True,
    )
    print(f"[SleepingGiant] Exported GLB -> {out_glb}")

    # --------------------------------------------------------------------------
    # 6. OPTIONAL HEADLESS ORTHOGRAPHIC PREVIEW RENDERS (CPU CYCLES)
    # --------------------------------------------------------------------------
    if preview_dir:
        os.makedirs(preview_dir, exist_ok=True)
        scene = bpy.context.scene
        scene.render.engine = "CYCLES"
        scene.cycles.device = "CPU"
        scene.cycles.samples = 16
        scene.render.resolution_x = 640
        scene.render.resolution_y = 640

        # Soft Front-Left late afternoon sunlight + Violet shadow fill world
        world = bpy.data.worlds.new("PreviewWorld")
        scene.world = world
        world.use_nodes = True
        bg = world.node_tree.nodes.get("Background")
        if bg:
            bg.inputs["Color"].default_value = hex_to_linear_rgba("#6f6f8a")
            bg.inputs["Strength"].default_value = 0.65

        sun_data = bpy.data.lights.new("Sun", type="SUN")
        sun_data.energy = 3.2
        sun_obj = bpy.data.objects.new("Sun", sun_data)
        sun_obj.rotation_euler = (math.radians(48), math.radians(-18), math.radians(-35))
        bpy.context.collection.objects.link(sun_obj)

        cam_data = bpy.data.cameras.new("OrthoCam")
        cam_data.type = "ORTHO"
        cam_data.ortho_scale = 8.5
        cam_obj = bpy.data.objects.new("OrthoCam", cam_data)
        bpy.context.collection.objects.link(cam_obj)
        scene.camera = cam_obj

        views = {
            "front": ((0.0, -12.0, 3.5), (math.radians(90), 0.0, 0.0)),
            "side":  ((12.0, 0.0, 3.5),  (math.radians(90), 0.0, math.radians(90))),
            "back":  ((0.0, 12.0, 3.5),  (math.radians(90), 0.0, math.radians(180))),
            "top":   ((0.0, 0.0, 14.0),  (0.0, 0.0, 0.0)),
            "face":  ((0.0, -8.0, 6.05), (math.radians(90), 0.0, 0.0)),
        }
        for vname, (loc, rot) in views.items():
            cam_obj.data.ortho_scale = 2.6 if vname == "face" else 8.5
            cam_obj.location = loc
            cam_obj.rotation_euler = rot
            scene.render.filepath = os.path.join(preview_dir, f"giant_{vname}.png")
            bpy.ops.render.render(write_still=True)
            print(f"[SleepingGiant] Rendered preview -> {scene.render.filepath}")


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="sleeping-giant.glb", help="Output GLB path")
    parser.add_argument("--preview-dir", default=None, help="Optional folder for orthographic PNG previews")
    args = parser.parse_args(argv)
    build_sleeping_giant(args.out, args.preview_dir)