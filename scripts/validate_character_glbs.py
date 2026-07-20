import argparse
import sys
from pathlib import Path

import bpy
from mathutils import Vector


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
EXPECTED_STYLE = "faceless_compact_v2"
MIN_CHARACTER_HEIGHT = 1.55
MAX_CHARACTER_HEIGHT = 1.90


argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
parser = argparse.ArgumentParser()
parser.add_argument("--input-dir", required=True)
args = parser.parse_args(argv)

files = sorted(Path(args.input_dir).resolve().glob("character_*.glb"))
files = [path for path in files if "all_variants" not in path.name]
failures = []

for path in files:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    actions = {action.name for action in bpy.data.actions}
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    meshes = {obj.name for obj in mesh_objects}
    cameras = [obj.name for obj in bpy.context.scene.objects if obj.type == "CAMERA"]
    lights = [obj.name for obj in bpy.context.scene.objects if obj.type == "LIGHT"]
    missing_actions = EXPECTED_ACTIONS - actions
    stale_face = sorted(name for name in meshes if name.startswith("CHR_Face_"))
    character_coords = [obj.matrix_world @ Vector(corner) for obj in mesh_objects if obj.name.startswith("CHR_") for corner in obj.bound_box]
    character_height = max((point.z for point in character_coords), default=0.0) - min((point.z for point in character_coords), default=0.0)
    character_style = armatures[0].get("character_style") if len(armatures) == 1 else None
    problems = []
    if len(armatures) != 1:
        problems.append(f"armatures={len(armatures)}")
    if missing_actions:
        problems.append(f"missing_actions={sorted(missing_actions)}")
    if character_style != EXPECTED_STYLE:
        problems.append(f"style={character_style!r}")
    if not MIN_CHARACTER_HEIGHT <= character_height <= MAX_CHARACTER_HEIGHT:
        problems.append(f"height={character_height:.3f}")
    if stale_face:
        problems.append(f"face_geometry={stale_face}")
    if cameras or lights:
        problems.append(f"camera_or_light={cameras + lights}")
    if path.stat().st_size > 600_000:
        problems.append(f"oversize={path.stat().st_size}")

    if problems:
        failures.append((path.name, problems))
        print("FAIL", path.name, "; ".join(problems))
    else:
        print("PASS", path.name, path.stat().st_size, "bytes", len(actions), "clips", f"height={character_height:.3f}")

if failures:
    raise SystemExit(f"Character validation failed for {len(failures)} file(s)")
print("VALIDATED", len(files), "character GLBs")
