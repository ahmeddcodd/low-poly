"""Refine shop furniture GLBs to the character-level triangle tier.

Visible meshes receive rounded edge bevels and angle-based smoothing. Remaining
triangle budget is distributed as silhouette-safe planar tessellation. Collision
proxies, semantic node names, transforms, anchors, and animations are preserved.
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bmesh
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))

from refine_platform_blender import restore_authored_node_transforms


TARGET_TRIANGLES = 10_656
BEVEL_SEGMENT_TRIALS = (3, 2, 1)
SUPPORT_ROOTS = (
    "Support_BasicToppingStation",
    "Support_ConeDispenser",
    "Support_CupDispenser",
    "Support_DeluxeToppingStation",
    "Support_IceCreamHolder",
    "Support_ImprovedRefrigeratedStorage",
    "Support_NapkinHolder",
    "Support_PremiumFreezer",
    "Support_SpoonWaferDispenser",
    "Support_StarterStorageShelf",
    "Support_StorageChest",
    "Support_SyrupBottleSet",
)


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--mode", choices=("scene", "support-library"), default="scene")
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def triangle_count(obj):
    return sum(max(0, len(face.vertices) - 2) for face in obj.data.polygons)


def group_triangle_count(objects):
    return sum(triangle_count(obj) for obj in objects)


def is_collision_proxy(obj):
    return obj.name.startswith("COL_") or bool(obj.get("is_collider"))


def prepare_mesh(obj):
    editable = bmesh.new()
    editable.from_mesh(obj.data)
    bmesh.ops.remove_doubles(editable, verts=list(editable.verts), dist=0.00001)
    bmesh.ops.recalc_face_normals(editable, faces=list(editable.faces))
    editable.to_mesh(obj.data)
    editable.free()
    obj.data.validate(verbose=False)
    obj.data.update()


def local_bevel_width(obj):
    if not obj.data.vertices:
        return 0.0
    coordinates = [vertex.co for vertex in obj.data.vertices]
    dimensions = [
        max(point[axis] for point in coordinates) - min(point[axis] for point in coordinates)
        for axis in range(3)
    ]
    positive = [dimension for dimension in dimensions if dimension > 0.0001]
    if not positive:
        return 0.0
    return min(0.028, max(0.0025, min(positive) * 0.055))


def apply_bevel(obj, segments):
    width = local_bevel_width(obj)
    if width <= 0:
        return
    modifier = obj.modifiers.new("Character-tier rounded edges", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.profile = 0.5
    modifier.limit_method = "ANGLE"
    modifier.angle_limit = math.radians(24)
    modifier.harden_normals = True

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)


def smooth_by_angle(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth_by_angle()
    obj.select_set(False)


def poke_mesh_faces(obj, pair_count):
    if pair_count <= 0:
        return
    editable = bmesh.new()
    editable.from_mesh(obj.data)
    bmesh.ops.triangulate(editable, faces=list(editable.faces))
    while pair_count > 0:
        editable.faces.ensure_lookup_table()
        faces = sorted(editable.faces, key=lambda face: face.calc_area(), reverse=True)
        selected = faces[: min(pair_count, len(faces))]
        if not selected:
            raise RuntimeError(f"Cannot add triangle detail to {obj.name}")
        bmesh.ops.poke(
            editable,
            faces=selected,
            offset=0.0,
            use_relative_offset=False,
            center_mode="MEAN_WEIGHTED",
        )
        pair_count -= len(selected)
    bmesh.ops.recalc_face_normals(editable, faces=list(editable.faces))
    editable.to_mesh(obj.data)
    editable.free()
    obj.data.validate(verbose=False)
    obj.data.update()


def distribute_planar_detail(objects, triangle_difference):
    if triangle_difference < 0:
        raise RuntimeError(f"Refinement exceeded target by {-triangle_difference} triangles")
    if triangle_difference % 2:
        raise RuntimeError(f"Triangle difference must be even, got {triangle_difference}")
    pairs = triangle_difference // 2
    weighted = [(obj, max(1, triangle_count(obj))) for obj in objects if obj.data.polygons]
    total_weight = sum(weight for _, weight in weighted)
    allocations = []
    allocated = 0
    for obj, weight in weighted:
        exact = pairs * weight / total_weight
        whole = math.floor(exact)
        allocations.append([obj, whole, exact - whole])
        allocated += whole
    for entry in sorted(allocations, key=lambda item: item[2], reverse=True)[: pairs - allocated]:
        entry[1] += 1
    for obj, pair_count, _ in allocations:
        poke_mesh_faces(obj, pair_count)


def restore_original_meshes(objects, originals):
    for obj in objects:
        obj.data = originals[obj].copy()


def refine_group(label, group_objects):
    visible = [obj for obj in group_objects if not is_collision_proxy(obj)]
    if not visible:
        raise RuntimeError(f"No visible meshes found for {label}")
    before = group_triangle_count(group_objects)
    originals = {obj: obj.data.copy() for obj in visible}
    chosen_segments = 0

    for segments in BEVEL_SEGMENT_TRIALS:
        restore_original_meshes(visible, originals)
        for obj in visible:
            prepare_mesh(obj)
            apply_bevel(obj, segments)
        current = group_triangle_count(group_objects)
        if current <= TARGET_TRIANGLES:
            chosen_segments = segments
            break
    else:
        restore_original_meshes(visible, originals)
        for obj in visible:
            prepare_mesh(obj)
        current = group_triangle_count(group_objects)

    target = TARGET_TRIANGLES
    if (target - current) % 2:
        target += 1
    distribute_planar_detail(visible, target - current)
    for obj in visible:
        smooth_by_angle(obj)
    after = group_triangle_count(group_objects)
    if after != target:
        raise RuntimeError(f"{label} ended at {after} triangles instead of {target}")
    print("REFINED_GROUP", label, f"before={before}", f"after={after}", f"bevel_segments={chosen_segments}")
    return before, after


def descendant_meshes(root):
    objects = [root, *root.children_recursive]
    return [obj for obj in objects if obj.type == "MESH"]


def main():
    args = parse_args()
    source = Path(args.input).resolve()
    destination = Path(args.output).resolve()
    if not source.exists():
        raise FileNotFoundError(source)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    for obj in bpy.context.scene.objects:
        if obj.animation_data:
            obj.animation_data.action = None
    bpy.context.scene.frame_set(0)
    bpy.context.view_layer.update()

    if args.mode == "support-library":
        groups = []
        for name in SUPPORT_ROOTS:
            root = bpy.context.scene.objects.get(name)
            if root is None:
                raise RuntimeError(f"Missing support root: {name}")
            groups.append((name, descendant_meshes(root)))
    else:
        groups = [(source.stem, [obj for obj in bpy.context.scene.objects if obj.type == "MESH"])]

    seen = set()
    for label, objects in groups:
        overlap = seen.intersection(objects)
        if overlap:
            raise RuntimeError(f"Refinement groups overlap at {label}: {[obj.name for obj in overlap]}")
        seen.update(objects)
        refine_group(label, objects)

    destination.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(destination),
        export_format="GLB",
        use_selection=False,
        export_cameras=False,
        export_lights=False,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_skins=False,
        export_morph=False,
        export_extras=True,
        export_optimize_animation_size=True,
        export_yup=True,
    )
    restored = restore_authored_node_transforms(source, destination)
    print("RESTORED_NODE_TRANSFORMS", restored)
    print("WROTE", destination, destination.stat().st_size)


if __name__ == "__main__":
    main()
