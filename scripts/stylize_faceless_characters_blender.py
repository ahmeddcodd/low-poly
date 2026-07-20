"""Rebuild the playable cast in a compact, faceless hyper-casual style.

The script preserves the existing shared rig, skin weights, materials, and
animation names while changing the rest skeleton and every weighted mesh with
the same spatial profile. It is safe to run repeatedly because the style
version is stored as glTF extras on the armature.
"""

import argparse
import os
import sys
from pathlib import Path

import bpy
from mathutils import Vector


STYLE_NAME = "faceless_compact_v2"
EXPECTED_ACTIONS = {
    "Angry",
    "Carry_Idle",
    "Carry_Walk",
    "Celebrate",
    "Eat",
    "Idle",
    "Pay",
    "Pickup",
    "Serve",
    "Sit",
    "Walk_Customer",
    "Walk_Player",
}

# Original Blender Z -> compact cartoon Z. These landmarks shorten the legs
# and torso while keeping a large spherical head like the supplied reference.
Z_PROFILE = (
    (0.00, 0.00),
    (0.16, 0.13),
    (0.50, 0.32),
    (0.78, 0.52),
    (0.90, 0.57),
    (0.98, 0.64),
    (1.28, 0.93),
    (1.49, 1.12),
    (1.55, 1.17),
    (1.61, 1.23),
    (2.20, 1.75),
)

# Narrower head/shoulder placement and close-set legs match the reference
# silhouette. Limb thickness is restored separately around each mesh center.
X_SCALE_PROFILE = (
    (0.00, 0.95),
    (0.50, 0.93),
    (0.90, 0.94),
    (1.28, 0.98),
    (1.49, 0.98),
    (1.55, 0.96),
    (2.20, 0.96),
)

Y_SCALE_PROFILE = (
    (0.00, 1.04),
    (0.50, 1.02),
    (1.28, 1.00),
    (1.49, 0.98),
    (1.55, 0.96),
    (2.20, 0.96),
)


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--only", default="")
    return parser.parse_args(argv)


def profile_value(value, profile):
    if value <= profile[0][0]:
        source_a, target_a = profile[0]
        source_b, target_b = profile[1]
    elif value >= profile[-1][0]:
        source_a, target_a = profile[-2]
        source_b, target_b = profile[-1]
    else:
        for index in range(1, len(profile)):
            source_b, target_b = profile[index]
            if value <= source_b:
                source_a, target_a = profile[index - 1]
                break
    mix = (value - source_a) / max(source_b - source_a, 0.000001)
    return target_a + (target_b - target_a) * mix


def stylize_point(point):
    return Vector(
        (
            point.x * profile_value(point.z, X_SCALE_PROFILE),
            point.y * profile_value(point.z, Y_SCALE_PROFILE),
            profile_value(point.z, Z_PROFILE),
        )
    )


def bounds_world(obj):
    coords = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    lo = Vector(tuple(min(point[index] for point in coords) for index in range(3)))
    hi = Vector(tuple(max(point[index] for point in coords) for index in range(3)))
    return lo, hi


def remove_expressive_face_geometry():
    face_objects = [obj for obj in bpy.context.scene.objects if obj.name.startswith("CHR_Face_")]
    for obj in face_objects:
        bpy.data.objects.remove(obj, do_unlink=True)
    return len(face_objects)


def radial_scale_for(obj):
    name = obj.name.lower()
    if "hand" in name:
        return 1.18, 1.18
    if "foot" in name:
        return 1.20, 1.14
    if "upperarm" in name or "forearm" in name:
        return 1.16, 1.16
    if "thigh" in name or "shin" in name:
        return 1.15, 1.15
    if "torso" in name or "waist" in name:
        return 1.08, 1.10
    return 1.0, 1.0


def should_smooth(obj):
    name = obj.name.lower()
    return any(
        part in name
        for part in (
            "head",
            "neck",
            "hand",
            "foot",
            "upperarm",
            "forearm",
            "thigh",
            "shin",
            "torso",
            "waist",
        )
    )


def warp_mesh(obj, armature):
    to_rig = armature.matrix_world.inverted() @ obj.matrix_world
    to_object = to_rig.inverted()
    original = [to_rig @ vertex.co for vertex in obj.data.vertices]
    if not original:
        return
    original_center = sum(original, Vector()) / len(original)
    mapped_center = stylize_point(original_center)
    radial_x, radial_y = radial_scale_for(obj)

    for vertex, point in zip(obj.data.vertices, original):
        mapped = stylize_point(point)
        mapped.x = mapped_center.x + (mapped.x - mapped_center.x) * radial_x
        mapped.y = mapped_center.y + (mapped.y - mapped_center.y) * radial_y
        vertex.co = to_object @ mapped

    if should_smooth(obj):
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    obj.data.update()


def warp_character_meshes(armature):
    meshes = [
        obj
        for obj in bpy.context.scene.objects
        if obj.type == "MESH" and obj.name.startswith("CHR_")
    ]
    for obj in meshes:
        warp_mesh(obj, armature)
    return len(meshes)


def warp_armature(armature):
    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="EDIT")
    for bone in armature.data.edit_bones:
        original_head = bone.head.copy()
        original_tail = bone.tail.copy()
        bone.head = stylize_point(original_head)
        bone.tail = stylize_point(original_tail)
    bpy.ops.object.mode_set(mode="OBJECT")


def action_curves(action):
    for slot in action.slots:
        for layer in action.layers:
            for strip in layer.strips:
                if strip.type != "KEYFRAME":
                    continue
                bag = strip.channelbag(slot, ensure=False)
                if not bag:
                    continue
                yield from bag.fcurves


def scale_curve_values(curve, factor):
    for key in curve.keyframe_points:
        key.co.y *= factor
        key.handle_left.y *= factor
        key.handle_right.y *= factor


def normalize_animation_translations():
    hips_path = 'pose.bones["hips"].location'
    for action in bpy.data.actions:
        factor = 0.30 if action.name in {"Sit", "Eat"} else 0.80
        for curve in action_curves(action):
            if curve.data_path == hips_path and curve.array_index == 2:
                scale_curve_values(curve, factor)


def normalize_glasses(head):
    head_lo, _ = bounds_world(head)
    target_front = head_lo.y - 0.007
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or "Glasses_" not in obj.name:
            continue
        glasses_lo, _ = bounds_world(obj)
        delta_world = Vector((0.0, target_front - glasses_lo.y, 0.0))
        delta_local = obj.matrix_world.inverted().to_3x3() @ delta_world
        for vertex in obj.data.vertices:
            vertex.co += delta_local
        obj.data.update()


def configure_materials():
    for material in bpy.data.materials:
        material.diffuse_color[3] = 1.0
        if not material.use_nodes:
            continue
        principled = material.node_tree.nodes.get("Principled BSDF")
        if not principled:
            continue
        principled.inputs["Roughness"].default_value = max(
            principled.inputs["Roughness"].default_value,
            0.72,
        )
        principled.inputs["Metallic"].default_value = 0.0


def find_head():
    return next(
        (
            obj
            for obj in bpy.context.scene.objects
            if obj.type == "MESH" and "__Head" in obj.name and "Hair" not in obj.name
        ),
        None,
    )


def export_character(destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(destination),
        export_format="GLB",
        use_selection=False,
        export_cameras=False,
        export_lights=False,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_skins=True,
        export_morph=True,
        export_extras=True,
        export_optimize_animation_size=True,
        export_optimize_animation_keep_anim_armature=True,
        export_yup=True,
    )


def stylize_file(source, destination):
    print(f"STYLIZE {source.name}")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"Expected one armature in {source.name}, found {len(armatures)}")
    armature = armatures[0]
    missing_actions = EXPECTED_ACTIONS - {action.name for action in bpy.data.actions}
    if missing_actions:
        raise RuntimeError(f"Missing actions in {source.name}: {sorted(missing_actions)}")

    removed_faces = remove_expressive_face_geometry()
    already_styled = armature.get("character_style") == STYLE_NAME
    armature.animation_data_create()
    armature.animation_data.action = None
    armature.data.pose_position = "REST"
    bpy.context.scene.frame_set(0)

    if not already_styled:
        mesh_count = warp_character_meshes(armature)
        warp_armature(armature)
        normalize_animation_translations()
        armature["character_style"] = STYLE_NAME
        armature["character_style_version"] = 2
        print(f"RESHAPED {mesh_count} meshes; removed {removed_faces} face-detail meshes")
    else:
        print(f"REFRESHED faceless style; removed {removed_faces} stale face-detail meshes")

    head = find_head()
    if not head:
        raise RuntimeError(f"Head mesh missing in {source.name}")
    normalize_glasses(head)
    configure_materials()
    armature.data.pose_position = "POSE"
    armature.animation_data.action = bpy.data.actions.get("Idle")
    bpy.context.scene.frame_set(1)
    export_character(destination)
    print(f"WROTE {destination} ({destination.stat().st_size} bytes)")


def main():
    args = parse_args()
    input_dir = Path(args.input_dir).resolve()
    output_dir = Path(args.output_dir).resolve()
    files = sorted(input_dir.glob("character_*.glb"))
    files = [path for path in files if "all_variants" not in path.name]
    if args.only:
        files = [path for path in files if args.only.lower() in path.stem.lower()]
    if not files:
        raise RuntimeError("No matching individual character GLBs found")
    for source in files:
        stylize_file(source, output_dir / source.name)
    print(f"COMPLETE {len(files)} faceless compact character files")


if __name__ == "__main__":
    main()
