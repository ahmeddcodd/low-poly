import bpy
import math
import os
import sys
from mathutils import Vector


def cli_arg(name, default=None):
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    try:
        return argv[argv.index(name) + 1]
    except (ValueError, IndexError):
        return default


path = os.path.abspath(cli_arg("--input"))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)

armature = next(obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE")
print(f"FILE {os.path.basename(path)}")
print("ARMATURE", armature.name)
print("ACTIONS", ",".join(sorted(action.name for action in bpy.data.actions)))

for obj in sorted(bpy.context.scene.objects, key=lambda value: value.name):
    if obj.type != "MESH":
        continue
    coords = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    lo = tuple(round(min(value[i] for value in coords), 4) for i in range(3))
    hi = tuple(round(max(value[i] for value in coords), 4) for i in range(3))
    print("MESH", obj.name, "LO", lo, "HI", hi)

def sample(action_name, frames):
    action = bpy.data.actions.get(action_name)
    if not action:
        return
    armature.animation_data_create()
    armature.animation_data.action = action
    print("CLIP", action_name)
    for frame in frames:
        bpy.context.scene.frame_set(frame)
        values = []
        for bone_name in ("hips", "chest", "head", "upper_arm.L", "upper_arm.R", "thigh.L", "thigh.R"):
            bone = armature.pose.bones.get(bone_name)
            if not bone:
                continue
            euler = bone.rotation_quaternion.to_euler("XYZ")
            values.append(
                f"{bone_name}:loc=({bone.location.x:.3f},{bone.location.y:.3f},{bone.location.z:.3f})"
                f",rot=({math.degrees(euler.x):.1f},{math.degrees(euler.y):.1f},{math.degrees(euler.z):.1f})"
            )
        print("FRAME", frame, " | ".join(values))


sample("Idle", (1, 10, 20, 30, 39))
sample("Walk_Player", (1, 5, 10, 15, 20))
sample("Walk_Customer", (1, 7, 13, 20, 26))
