"""Build the Creative Characters kit into an animated customer library GLB.

The source kit is modular and contains no actions. This script removes preview
geometry, authors the restaurant customer animation set on the shared humanoid
rig, keeps all outfit parts needed by the runtime variants, and exports one GLB
whose geometry/materials can be shared by every customer clone.
"""

import argparse
import math
from pathlib import Path

import bpy


ANIMATION_BONES = (
    "Hips",
    "Spine",
    "Spine1",
    "Neck",
    "Head",
    "LeftArm",
    "LeftForeArm",
    "LeftHand",
    "LeftHandThumb1",
    "LeftHandThumb2",
    "LeftHandIndex1",
    "LeftHandIndex2",
    "LeftHandMiddle1",
    "LeftHandMiddle2",
    "LeftHandRing1",
    "LeftHandRing2",
    "LeftHandPinky1",
    "LeftHandPinky2",
    "RightArm",
    "RightForeArm",
    "RightHand",
    "RightHandThumb1",
    "RightHandThumb2",
    "RightHandIndex1",
    "RightHandIndex2",
    "RightHandMiddle1",
    "RightHandMiddle2",
    "RightHandRing1",
    "RightHandRing2",
    "RightHandPinky1",
    "RightHandPinky2",
    "LeftUpLeg",
    "LeftLeg",
    "LeftFoot",
    "RightUpLeg",
    "RightLeg",
    "RightFoot",
)

REMOVED_LIBRARY_PARTS = {
    "Icosphere",
    "Male_emotion_angry_003",
    "Male_emotion_happy_002",
    "Male_emotion_usual_001",
    "Pacifier_001",
}


def solid_material(name, color):
    material = bpy.data.materials.new(name=name)
    material.diffuse_color = (*color, 1.0)
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (*color, 1.0)
    principled.inputs["Roughness"].default_value = 0.78
    principled.inputs["Metallic"].default_value = 0.0
    return material


def assign_rigid_weight(obj, bone_name):
    group = obj.vertex_groups.new(name=bone_name)
    group.add(range(len(obj.data.vertices)), 1.0, "REPLACE")


def rounded_box(name, location, scale, material, bone_name, *, rotation=(0, 0, 0), bevel=0.025):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    modifier = obj.modifiers.new(name="Soft worker-uniform edges", type="BEVEL")
    modifier.width = bevel
    modifier.segments = 2
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.data.materials.append(material)
    assign_rigid_weight(obj, bone_name)
    return obj


def rounded_sphere(name, location, scale, material, bone_name, *, segments=16, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    assign_rigid_weight(obj, bone_name)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def join_skinned_components(components, name, armature):
    bpy.ops.object.select_all(action="DESELECT")
    for component in components:
        component.select_set(True)
    result = components[0]
    bpy.context.view_layer.objects.active = result
    bpy.ops.object.join()
    result.name = name
    result.data.name = name
    result.parent = armature
    modifier = result.modifiers.new(name="Worker uniform rig", type="ARMATURE")
    modifier.object = armature
    return result


def create_worker_uniform(armature):
    orange = solid_material("Worker_Orange", (1.0, 0.35, 0.035))
    button = solid_material("Worker_Button", (1.0, 0.82, 0.46))

    apron_components = [
        rounded_box("Apron_Waist_Belt", (0, 0, 1.065), (0.29, 0.18, 0.045), orange, "Hips", bevel=0.025),
        rounded_box("Apron_Skirt", (0, -0.19, 0.925), (0.255, 0.026, 0.16), orange, "Hips", bevel=0.026),
        rounded_box("Apron_Bib", (0, -0.19, 1.27), (0.205, 0.026, 0.155), orange, "Spine1", bevel=0.024),
    ]
    for side, angle in ((-1, -0.16), (1, 0.16)):
        apron_components.append(
            rounded_box(
                f"Apron_Front_Strap_{side}",
                (side * 0.145, -0.18, 1.425),
                (0.028, 0.018, 0.17),
                orange,
                "Spine1",
                rotation=(0, angle, 0),
                bevel=0.014,
            )
        )
        apron_components.append(
            rounded_box(
                f"Apron_Back_Strap_{side}",
                (side * 0.13, 0.17, 1.42),
                (0.028, 0.018, 0.17),
                orange,
                "Spine1",
                rotation=(0, -angle, 0),
                bevel=0.014,
            )
        )
        apron_components.append(
            rounded_sphere(
                f"Apron_Button_{side}",
                (side * 0.13, -0.222, 1.35),
                (0.032, 0.016, 0.032),
                button,
                "Spine1",
                segments=12,
                rings=6,
            )
        )
    apron = join_skinned_components(apron_components, "Player_Apron", armature)

    cap_components = [
        rounded_sphere("Cap_Crown", (0, 0.0, 1.805), (0.215, 0.20, 0.11), orange, "Head"),
        rounded_sphere("Cap_Visor", (0, -0.16, 1.73), (0.20, 0.105, 0.022), orange, "Head"),
    ]
    cap = join_skinned_components(cap_components, "Player_Cap", armature)
    return apron, cap

def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    argv = []
    if "--" in __import__("sys").argv:
        argv = __import__("sys").argv[__import__("sys").argv.index("--") + 1 :]
    return parser.parse_args(argv)


def action_curves(action):
    for slot in action.slots:
        for layer in action.layers:
            for strip in layer.strips:
                if strip.type != "KEYFRAME":
                    continue
                bag = strip.channelbag(slot, ensure=False)
                if bag:
                    yield from bag.fcurves


def reset_pose(armature):
    armature.location = (0.0, 0.0, 0.0)
    for name in ANIMATION_BONES:
        bone = armature.pose.bones[name]
        bone.rotation_mode = "XYZ"
        bone.rotation_euler = (0.0, 0.0, 0.0)
        bone.location = (0.0, 0.0, 0.0)
        bone.scale = (1.0, 1.0, 1.0)


def key_pose(armature, frame, *, height=0.0, rotations=None):
    reset_pose(armature)
    armature.location.z = height
    for name, degrees in (rotations or {}).items():
        armature.pose.bones[name].rotation_euler = tuple(
            math.radians(value) for value in degrees
        )
    armature.keyframe_insert(data_path="location", frame=frame, group="RootMotion")
    for name in ANIMATION_BONES:
        bone = armature.pose.bones[name]
        bone.keyframe_insert(data_path="rotation_euler", frame=frame, group=name)


def create_action(armature, name, poses, *, linear=False):
    action = bpy.data.actions.new(name=name)
    action.use_fake_user = True
    armature.animation_data.action = action
    for pose in poses:
        key_pose(armature, **pose)
    for curve in action_curves(action):
        for key in curve.keyframe_points:
            key.interpolation = "LINEAR" if linear else "BEZIER"
    armature.animation_data.action = None
    return action


def standing_pose(**rotations):
    pose = {
        "LeftArm": (-42, 0, 0),
        "RightArm": (-42, 0, 0),
    }
    for name, degrees in rotations.items():
        if name in pose:
            pose[name] = tuple(pose[name][axis] + degrees[axis] for axis in range(3))
        else:
            pose[name] = degrees
    return pose


def seated_pose(**extra):
    rotations = {
        "LeftUpLeg": (0, 0, -80),
        "LeftLeg": (0, 0, 80),
        "RightUpLeg": (0, 0, 80),
        "RightLeg": (0, 0, -80),
        "LeftFoot": (0, 0, -4),
        "RightFoot": (0, 0, 4),
        "Spine": (7, 0, 0),
        "Spine1": (4, 0, 0),
        "LeftArm": (-28, 0, -12),
        "RightArm": (-28, 0, 12),
        "LeftForeArm": (0, 0, 54),
        "RightForeArm": (0, 0, -54),
    }
    for name, degrees in extra.items():
        if name in {"LeftArm", "RightArm"}:
            rotations[name] = tuple(
                rotations[name][axis] + degrees[axis] for axis in range(3)
            )
        else:
            rotations[name] = degrees
    return rotations


def hand_grip(side, strength=1.0):
    finger_angles = {
        "Thumb1": 44,
        "Thumb2": 36,
        "Index1": 62,
        "Index2": 70,
        "Middle1": 66,
        "Middle2": 74,
        "Ring1": 64,
        "Ring2": 72,
        "Pinky1": 58,
        "Pinky2": 66,
    }
    return {
        f"{side}Hand{name}": (degrees * strength, 0, 0)
        for name, degrees in finger_angles.items()
    }


def carry_pose(**movement):
    rotations = {
        # Keep the elbow down and the order centered just in front of the torso.
        # standing_pose contributes -42 degrees on the arm X axis.
        "RightArm": (-46, -16, 80),
        "RightForeArm": (0, -2, -129),
        "RightHand": (0, 0, -4),
        "LeftArm": (2, 0, -5),
        "LeftForeArm": (0, 0, 18),
    }
    rotations.update(hand_grip("Right", 0.82))
    rotations.update(movement)
    return standing_pose(**rotations)


def tray_pose(*, grip_strength=0.52, **movement):
    """Two-handed worker pose solved against the runtime tray at (0, -0.48, 1.04)."""
    rotations = {
        # These offsets produce mirrored prop-socket positions near
        # (+/-0.28, -0.39, 1.07), just above the two tray edges.
        "LeftArm": (-17.9, 20.5, -80.0),
        "LeftForeArm": (-31.45, -42.0, 103.5),
        "LeftHand": (0, 0, 4),
        "RightArm": (-17.9, -20.5, 80.0),
        "RightForeArm": (-31.45, 42.0, -103.5),
        "RightHand": (0, 0, -4),
    }
    rotations.update(hand_grip("Left", grip_strength))
    rotations.update(hand_grip("Right", grip_strength))
    rotations.update(movement)
    return standing_pose(**rotations)


def seated_hold_pose(**extra):
    rotations = {
        # Bring the full gripping hand inward and below the face. The resulting
        # prop socket is near (-0.15, -0.25, 1.11), so the ice cream stays in
        # the fingers instead of floating beside the customer's head.
        "RightArm": (-59, -23, 88),
        "RightForeArm": (0, 89, -144),
        "RightHand": (0, 0, -4),
        # Supporting hand rests near the order instead of opening beside the chair.
        "LeftArm": (-59, 20, -108),
        "LeftForeArm": (0, -72, 150),
    }
    rotations.update(hand_grip("Right", 0.82))
    rotations.update(hand_grip("Left", 0.42))
    rotations.update(extra)
    return seated_pose(**rotations)


def seated_bite_pose():
    rotations = {
        "Spine": (9, 0, 0),
        "Spine1": (6, 0, 0),
        "Head": (-4, 0, 0),
        # Move the gripping hand toward the center of the face while keeping
        # the elbow outside the torso. The prop socket lands at mouth height.
        "RightArm": (-9, -117, 70),
        "RightForeArm": (0, 108, -150),
        "RightHand": (0, 0, -5),
        "LeftArm": (-67, 30, -123),
        "LeftForeArm": (0, -62, 155),
    }
    rotations.update(hand_grip("Right", 0.86))
    rotations.update(hand_grip("Left", 0.5))
    return seated_pose(**rotations)


def build_actions(armature):
    create_action(
        armature,
        "Idle",
        (
            {"frame": 0, "rotations": standing_pose()},
            {
                "frame": 20,
                "height": 0.008,
                "rotations": standing_pose(
                    Spine=(1.2, 0, 0),
                    Spine1=(-0.8, 0, 0),
                    Head=(0, 1.5, 0),
                    LeftArm=(0, 0, -1.8),
                    RightArm=(0, 0, 1.8),
                ),
            },
            {"frame": 40, "rotations": standing_pose()},
        ),
    )

    walk_forward = standing_pose(
        Hips=(0, 3, 0),
        LeftUpLeg=(0, 0, -28),
        LeftLeg=(0, 0, 8),
        RightUpLeg=(0, 0, -28),
        RightLeg=(0, 0, -20),
        LeftArm=(0, 0, 24),
        RightArm=(0, 0, 24),
        LeftForeArm=(0, 0, 8),
        RightForeArm=(0, 0, -8),
    )
    walk_back = standing_pose(
        Hips=(0, -3, 0),
        LeftUpLeg=(0, 0, 28),
        LeftLeg=(0, 0, 20),
        RightUpLeg=(0, 0, 28),
        RightLeg=(0, 0, -8),
        LeftArm=(0, 0, -24),
        RightArm=(0, 0, -24),
        LeftForeArm=(0, 0, 8),
        RightForeArm=(0, 0, -8),
    )
    create_action(
        armature,
        "Walk_Customer",
        (
            {"frame": 0, "rotations": walk_forward},
            {"frame": 7, "height": 0.026, "rotations": standing_pose(LeftLeg=(0, 0, 12), RightLeg=(0, 0, -12))},
            {"frame": 14, "rotations": walk_back},
            {"frame": 21, "height": 0.026, "rotations": standing_pose(LeftLeg=(0, 0, 12), RightLeg=(0, 0, -12))},
            {"frame": 28, "rotations": walk_forward},
        ),
    )

    create_action(
        armature,
        "Receive_Order",
        (
            {"frame": 0, "rotations": standing_pose()},
            {
                "frame": 6,
                "rotations": standing_pose(
                    Spine=(2, 0, 0),
                    RightArm=(-23, -8, 40),
                    RightForeArm=(0, -1, -65),
                    **hand_grip("Right", 0.35),
                ),
            },
            {"frame": 14, "rotations": carry_pose(Spine=(2, 0, 0))},
            {"frame": 24, "rotations": carry_pose()},
        ),
    )

    create_action(
        armature,
        "Carry_Walk_Customer",
        (
            {"frame": 0, "rotations": carry_pose(Hips=(0, 2, 0), LeftUpLeg=(0, 0, -22), LeftLeg=(0, 0, 7), RightUpLeg=(0, 0, -22), RightLeg=(0, 0, -16))},
            {"frame": 7, "rotations": carry_pose(LeftLeg=(0, 0, 9), RightLeg=(0, 0, -9))},
            {"frame": 14, "rotations": carry_pose(Hips=(0, -2, 0), LeftUpLeg=(0, 0, 22), LeftLeg=(0, 0, 16), RightUpLeg=(0, 0, 22), RightLeg=(0, 0, -7))},
            {"frame": 21, "rotations": carry_pose(LeftLeg=(0, 0, 9), RightLeg=(0, 0, -9))},
            {"frame": 28, "rotations": carry_pose(Hips=(0, 2, 0), LeftUpLeg=(0, 0, -22), LeftLeg=(0, 0, 7), RightUpLeg=(0, 0, -22), RightLeg=(0, 0, -16))},
        ),
    )

    create_action(
        armature,
        "Sit",
        (
            {"frame": 0, "rotations": carry_pose()},
            {
                "frame": 10,
                "height": -0.075,
                "rotations": carry_pose(
                    LeftUpLeg=(0, 0, -38), LeftLeg=(0, 0, 32),
                    RightUpLeg=(0, 0, 38), RightLeg=(0, 0, -32),
                    Spine=(3, 0, 0),
                ),
            },
            {"frame": 20, "height": -0.17, "rotations": seated_hold_pose()},
        ),
    )

    create_action(
        armature,
        "Eat",
        (
            {"frame": 0, "height": -0.17, "rotations": seated_hold_pose()},
            {"frame": 10, "height": -0.168, "rotations": seated_bite_pose()},
            {"frame": 20, "height": -0.17, "rotations": seated_hold_pose()},
            {"frame": 30, "height": -0.168, "rotations": seated_bite_pose()},
            {"frame": 40, "height": -0.17, "rotations": seated_hold_pose()},
        ),
    )

    create_action(
        armature,
        "Pay",
        (
            {"frame": 0, "rotations": standing_pose()},
            {
                "frame": 10,
                "rotations": standing_pose(
                    Spine=(4, 0, 0),
                    RightArm=(0, 0, 42),
                    RightForeArm=(0, 0, -72),
                    Head=(-3, 0, 0),
                ),
            },
            {"frame": 20, "rotations": standing_pose()},
        ),
    )

    create_action(
        armature,
        "Angry",
        (
            {"frame": 0, "rotations": standing_pose()},
            {
                "frame": 9,
                "height": 0.02,
                "rotations": standing_pose(
                    Spine=(-6, 0, 0),
                    LeftArm=(42, 0, -35),
                    RightArm=(42, 0, 35),
                    LeftForeArm=(0, 0, 62),
                    RightForeArm=(0, 0, -62),
                    Head=(8, 0, 0),
                ),
            },
            {"frame": 18, "rotations": standing_pose(Head=(-8, 0, 0))},
            {"frame": 28, "rotations": standing_pose()},
        ),
    )

    create_action(
        armature,
        "Celebrate",
        (
            {"frame": 0, "rotations": standing_pose()},
            {
                "frame": 8,
                "height": 0.12,
                "rotations": standing_pose(
                    LeftArm=(112, 0, -18),
                    RightArm=(112, 0, 18),
                    LeftForeArm=(0, 0, 18),
                    RightForeArm=(0, 0, -18),
                    Spine=(-5, 0, 0),
                ),
            },
            {"frame": 16, "height": 0.02, "rotations": standing_pose()},
            {
                "frame": 24,
                "height": 0.08,
                "rotations": standing_pose(
                    LeftArm=(95, 0, -12),
                    RightArm=(95, 0, 12),
                ),
            },
            {"frame": 32, "rotations": standing_pose()},
        ),
    )


def build_player_actions(armature):
    walk_forward = standing_pose(
        Hips=(0, 3, 0),
        LeftUpLeg=(0, 0, -28),
        LeftLeg=(0, 0, 8),
        RightUpLeg=(0, 0, -28),
        RightLeg=(0, 0, -20),
        LeftArm=(0, 0, 24),
        RightArm=(0, 0, 24),
        LeftForeArm=(0, 0, 8),
        RightForeArm=(0, 0, -8),
    )
    walk_back = standing_pose(
        Hips=(0, -3, 0),
        LeftUpLeg=(0, 0, 28),
        LeftLeg=(0, 0, 20),
        RightUpLeg=(0, 0, 28),
        RightLeg=(0, 0, -8),
        LeftArm=(0, 0, -24),
        RightArm=(0, 0, -24),
        LeftForeArm=(0, 0, 8),
        RightForeArm=(0, 0, -8),
    )
    create_action(
        armature,
        "Walk_Player",
        (
            {"frame": 0, "rotations": walk_forward},
            {"frame": 7, "height": 0.018, "rotations": standing_pose(LeftLeg=(0, 0, 12), RightLeg=(0, 0, -12))},
            {"frame": 14, "rotations": walk_back},
            {"frame": 21, "height": 0.018, "rotations": standing_pose(LeftLeg=(0, 0, 12), RightLeg=(0, 0, -12))},
            {"frame": 28, "rotations": walk_forward},
        ),
    )

    create_action(
        armature,
        "Carry_Idle",
        (
            {"frame": 0, "rotations": tray_pose()},
            {
                "frame": 20,
                "height": 0.006,
                "rotations": tray_pose(Spine=(1.2, 0, 0), Spine1=(-0.8, 0, 0), Head=(0, 1.4, 0)),
            },
            {"frame": 40, "rotations": tray_pose()},
        ),
    )

    create_action(
        armature,
        "Carry_Walk",
        (
            {"frame": 0, "rotations": tray_pose(Hips=(0, 2, 0), LeftUpLeg=(0, 0, -24), LeftLeg=(0, 0, 8), RightUpLeg=(0, 0, -24), RightLeg=(0, 0, -18))},
            {"frame": 7, "height": 0.012, "rotations": tray_pose(LeftLeg=(0, 0, 10), RightLeg=(0, 0, -10))},
            {"frame": 14, "rotations": tray_pose(Hips=(0, -2, 0), LeftUpLeg=(0, 0, 24), LeftLeg=(0, 0, 18), RightUpLeg=(0, 0, 24), RightLeg=(0, 0, -8))},
            {"frame": 21, "height": 0.012, "rotations": tray_pose(LeftLeg=(0, 0, 10), RightLeg=(0, 0, -10))},
            {"frame": 28, "rotations": tray_pose(Hips=(0, 2, 0), LeftUpLeg=(0, 0, -24), LeftLeg=(0, 0, 8), RightUpLeg=(0, 0, -24), RightLeg=(0, 0, -18))},
        ),
    )

    create_action(
        armature,
        "Pickup",
        (
            {"frame": 0, "rotations": tray_pose(grip_strength=0.12)},
            {
                "frame": 6,
                "rotations": tray_pose(
                    grip_strength=0.9,
                    Spine=(4, 0, 0),
                    Spine1=(2, 0, 0),
                    Head=(-3, 0, 0),
                ),
            },
            {"frame": 12, "rotations": tray_pose()},
        ),
    )

    create_action(
        armature,
        "Serve",
        (
            {"frame": 0, "rotations": tray_pose()},
            {
                "frame": 6,
                "rotations": tray_pose(Spine=(5, 0, 0), Spine1=(2, 0, 0)),
            },
            {"frame": 12, "rotations": tray_pose()},
        ),
    )


def configure_materials():
    for material in bpy.data.materials:
        material.use_nodes = True
        principled = material.node_tree.nodes.get("Principled BSDF")
        if not principled:
            continue
        principled.inputs["Roughness"].default_value = 0.78
        principled.inputs["Metallic"].default_value = 0.0


def main():
    args = parse_args()
    source = Path(args.input).resolve()
    destination = Path(args.output).resolve()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))

    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"Expected one armature, found {len(armatures)}")
    armature = armatures[0]
    missing_bones = set(ANIMATION_BONES) - set(armature.pose.bones.keys())
    if missing_bones:
        raise RuntimeError(f"Missing animation bones: {sorted(missing_bones)}")

    for obj in list(bpy.context.scene.objects):
        data_name = getattr(getattr(obj, "data", None), "name", "")
        if obj.name in REMOVED_LIBRARY_PARTS or data_name in REMOVED_LIBRARY_PARTS:
            bpy.data.objects.remove(obj, do_unlink=True)

    create_worker_uniform(armature)

    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    armature.animation_data_create()
    build_actions(armature)
    build_player_actions(armature)
    configure_materials()
    armature["customer_library"] = "creative_characters_free"
    armature["customer_animation_version"] = 2
    armature.animation_data.action = bpy.data.actions["Idle"]
    bpy.context.scene.frame_set(0)

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
        export_morph=False,
        export_extras=True,
        export_optimize_animation_size=True,
        export_optimize_animation_keep_anim_armature=True,
        export_yup=True,
    )
    print("WROTE", destination, destination.stat().st_size)
    print("ACTIONS", ",".join(sorted(action.name for action in bpy.data.actions)))


if __name__ == "__main__":
    main()
