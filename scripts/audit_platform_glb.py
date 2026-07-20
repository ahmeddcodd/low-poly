"""Audit the refined shop platform against its authored GLB source."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))

from refine_platform_blender import read_glb


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--candidate", required=True)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def triangle_count(obj):
    return sum(max(0, len(face.vertices) - 2) for face in obj.data.polygons)


def rounded_bounds(obj):
    corners = [obj.matrix_world @ obj.data.vertices[index].co for index in range(len(obj.data.vertices))]
    minimum = tuple(round(min(point[axis] for point in corners), 4) for axis in range(3))
    maximum = tuple(round(max(point[axis] for point in corners), 4) for axis in range(3))
    return minimum + maximum


def rounded_local_bounds(obj):
    corners = [vertex.co for vertex in obj.data.vertices]
    minimum = tuple(round(min(point[axis] for point in corners), 4) for axis in range(3))
    maximum = tuple(round(max(point[axis] for point in corners), 4) for axis in range(3))
    return minimum + maximum


def authored_transforms(path):
    document, _ = read_glb(path)
    keys = ("translation", "rotation", "scale", "matrix")
    return {
        node["name"]: tuple((key, tuple(node[key])) for key in keys if key in node)
        for node in document.get("nodes", [])
        if node.get("name")
    }


def inspect(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    for obj in bpy.context.scene.objects:
        if obj.animation_data:
            obj.animation_data.action = None
            for track in obj.animation_data.nla_tracks:
                track.mute = True
    bpy.context.scene.frame_set(0)
    bpy.context.view_layer.update()
    meshes = {obj.name: obj for obj in bpy.context.scene.objects if obj.type == "MESH"}
    return {
        "objects": set(meshes),
        "triangles": sum(triangle_count(obj) for obj in meshes.values()),
        "bounds": {name: rounded_bounds(obj) for name, obj in meshes.items()},
        "local_bounds": {name: rounded_local_bounds(obj) for name, obj in meshes.items()},
        "matrices": {name: tuple(round(value, 4) for row in obj.matrix_world for value in row) for name, obj in meshes.items()},
        "actions": sorted(action.name for action in bpy.data.actions),
    }


def main():
    args = parse_args()
    source_path = Path(args.source).resolve()
    candidate_path = Path(args.candidate).resolve()
    source = inspect(source_path)
    candidate = inspect(candidate_path)
    source_transforms = authored_transforms(source_path)
    candidate_transforms = authored_transforms(candidate_path)
    shared = source["objects"] & candidate["objects"]
    changed_bounds = [
        name
        for name in sorted(shared)
        if not name.startswith("Door_")
        and max(abs(a - b) for a, b in zip(source["bounds"][name], candidate["bounds"][name])) > 0.03
    ]
    changed_door_geometry = [
        name
        for name in sorted(shared)
        if name.startswith("Door_") and source["local_bounds"][name] != candidate["local_bounds"][name]
    ]
    shared_transform_nodes = source_transforms.keys() & candidate_transforms.keys()
    changed_transforms = [
        name
        for name in sorted(shared_transform_nodes)
        if source_transforms[name] != candidate_transforms[name]
    ]
    print("SOURCE_TRIANGLES", source["triangles"])
    print("CANDIDATE_TRIANGLES", candidate["triangles"])
    print("SOURCE_OBJECTS", len(source["objects"]))
    print("CANDIDATE_OBJECTS", len(candidate["objects"]))
    print("MISSING_OBJECTS", sorted(source["objects"] - candidate["objects"]))
    print("EXTRA_OBJECTS", sorted(candidate["objects"] - source["objects"]))
    print("CHANGED_NON_ANIMATED_BOUNDS_OVER_0_03", changed_bounds)
    print("CHANGED_DOOR_LOCAL_BOUNDS", changed_door_geometry)
    print("CHANGED_AUTHORED_NODE_TRANSFORMS", changed_transforms)
    print("SOURCE_ACTIONS", source["actions"])
    print("CANDIDATE_ACTIONS", candidate["actions"])


if __name__ == "__main__":
    main()
