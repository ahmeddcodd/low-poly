"""Validate refined shop GLBs against their authored source assets."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))

from refine_platform_blender import read_glb
from refine_shop_assets_blender import SUPPORT_ROOTS, TARGET_TRIANGLES, descendant_meshes


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--candidate", required=True)
    parser.add_argument("--mode", choices=("scene", "support-library"), default="scene")
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def triangle_count(obj):
    return sum(max(0, len(face.vertices) - 2) for face in obj.data.polygons)


def local_bounds(obj):
    points = [vertex.co for vertex in obj.data.vertices]
    return tuple(round(value, 4) for axis in range(3) for value in (
        min(point[axis] for point in points),
        max(point[axis] for point in points),
    ))


def authored_transforms(path):
    document, _ = read_glb(path)
    keys = ("translation", "rotation", "scale", "matrix")
    transforms = {
        node["name"]: tuple((key, tuple(node[key])) for key in keys if key in node)
        for node in document.get("nodes", [])
        if node.get("name")
    }
    animations = [animation.get("name") for animation in document.get("animations", [])]
    return transforms, animations


def inspect(path, mode):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if mode == "support-library":
        groups = {
            name: descendant_meshes(bpy.context.scene.objects[name])
            for name in SUPPORT_ROOTS
        }
    else:
        groups = {path.stem: meshes}
    return {
        "objects": set(obj.name for obj in bpy.context.scene.objects),
        "groups": {
            name: sum(triangle_count(obj) for obj in objects)
            for name, objects in groups.items()
        },
        "colliders": {
            obj.name: (triangle_count(obj), local_bounds(obj))
            for obj in meshes
            if obj.name.startswith("COL_") or bool(obj.get("is_collider"))
        },
        "bounds": {obj.name: local_bounds(obj) for obj in meshes},
    }


def main():
    args = parse_args()
    source_path = Path(args.source).resolve()
    candidate_path = Path(args.candidate).resolve()
    source = inspect(source_path, args.mode)
    candidate = inspect(candidate_path, args.mode)
    source_transforms, source_animations = authored_transforms(source_path)
    candidate_transforms, candidate_animations = authored_transforms(candidate_path)

    missing = sorted(source["objects"] - candidate["objects"])
    extra = sorted(candidate["objects"] - source["objects"])
    changed_transforms = sorted(
        name for name in source_transforms.keys() & candidate_transforms.keys()
        if source_transforms[name] != candidate_transforms[name]
    )
    changed_colliders = sorted(
        name for name in source["colliders"].keys() | candidate["colliders"].keys()
        if source["colliders"].get(name) != candidate["colliders"].get(name)
    )
    changed_bounds = sorted(
        name for name in source["bounds"].keys() & candidate["bounds"].keys()
        if not name.startswith("COL_")
        and max(abs(a - b) for a, b in zip(source["bounds"][name], candidate["bounds"][name])) > 0.04
    )
    invalid_groups = {
        name: triangles
        for name, triangles in candidate["groups"].items()
        if triangles not in (TARGET_TRIANGLES, TARGET_TRIANGLES + 1)
    }

    print("SOURCE_GROUPS", source["groups"])
    print("CANDIDATE_GROUPS", candidate["groups"])
    print("MISSING_OBJECTS", missing)
    print("EXTRA_OBJECTS", extra)
    print("CHANGED_TRANSFORMS", changed_transforms)
    print("CHANGED_COLLIDERS", changed_colliders)
    print("CHANGED_BOUNDS_OVER_0_04", changed_bounds)
    print("SOURCE_ANIMATIONS", source_animations)
    print("CANDIDATE_ANIMATIONS", candidate_animations)

    failures = [
        missing,
        extra,
        changed_transforms,
        changed_colliders,
        changed_bounds,
        invalid_groups,
        source_animations != candidate_animations,
    ]
    if any(failures):
        raise RuntimeError(f"Asset refinement audit failed: {candidate_path}")
    print("AUDIT_OK", candidate_path)


if __name__ == "__main__":
    main()
