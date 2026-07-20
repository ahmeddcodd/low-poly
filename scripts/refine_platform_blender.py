"""Refine the ice-cream-shop platform without changing its authored layout.

The source GLB already has chamfered walls, so this pass concentrates its
polygon budget on the platform/foundation silhouette, door frames, and
non-collision wall trim. Animated door meshes and solid collision walls are
left untouched. It preserves semantic node names and the Entrance_Open
animation used by the Three.js runtime.
"""

from __future__ import annotations

import argparse
import json
import math
import struct
import sys
from pathlib import Path

import bmesh
import bpy


TARGET_MIN_TRIANGLES = 10_400
TARGET_MAX_TRIANGLES = 11_100
REQUIRED_OBJECTS = {
    "Door_Entrance_Left",
    "Door_Entrance_Right",
    "Floor_Cream_Tiles",
    "Platform_MainHall",
    "Platform_Annex",
}
REFINED_WALL_TRIMS = {
    "Wall_Annex_East_Cap",
    "Wall_Annex_North_Cap",
    "Wall_Annex_South_Cap",
    "Wall_Corridor_Rooms_Cap",
    "Wall_Main_East_Cap",
    "Wall_Main_North_Cap",
    "Wall_Main_South_Cap",
    "Wall_Main_West_Cap",
    "Wall_WC_Gym_Divider_Cap",
    "Wall_Annex_East_Skirting_00",
    "Wall_Annex_North_Skirting_00",
    "Wall_Annex_South_Skirting_00",
    "Wall_Main_North_Skirting_00",
    "Wall_Main_West_Skirting_00",
    "Wall_WC_Gym_Divider_Skirting_00",
}
JSON_CHUNK = 0x4E4F534A


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def read_glb(path):
    payload = path.read_bytes()
    magic, version, declared_length = struct.unpack_from("<4sII", payload, 0)
    if magic != b"glTF" or version != 2 or declared_length != len(payload):
        raise RuntimeError(f"Invalid GLB header: {path}")

    chunks = []
    cursor = 12
    document = None
    while cursor < len(payload):
        length, kind = struct.unpack_from("<II", payload, cursor)
        cursor += 8
        data = payload[cursor : cursor + length]
        cursor += length
        if kind == JSON_CHUNK:
            document = json.loads(data.rstrip(b" \x00").decode("utf-8"))
        chunks.append((kind, data))
    if document is None:
        raise RuntimeError(f"GLB has no JSON chunk: {path}")
    return document, chunks


def write_glb(path, document, chunks):
    encoded = json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    encoded += b" " * ((4 - len(encoded) % 4) % 4)
    rebuilt = []
    replaced_json = False
    for kind, data in chunks:
        if kind == JSON_CHUNK:
            data = encoded
            replaced_json = True
        data += b"\x00" * ((4 - len(data) % 4) % 4)
        rebuilt.append(struct.pack("<II", len(data), kind) + data)
    if not replaced_json:
        raise RuntimeError("Cannot write GLB without a JSON chunk")
    body = b"".join(rebuilt)
    path.write_bytes(struct.pack("<4sII", b"glTF", 2, 12 + len(body)) + body)


def restore_authored_node_transforms(source, destination):
    source_document, _ = read_glb(source)
    destination_document, destination_chunks = read_glb(destination)
    source_nodes = {
        node.get("name"): node
        for node in source_document.get("nodes", [])
        if node.get("name")
    }
    transform_keys = ("translation", "rotation", "scale", "matrix")
    restored = 0
    for node in destination_document.get("nodes", []):
        authored = source_nodes.get(node.get("name"))
        if authored is None:
            continue
        for key in transform_keys:
            node.pop(key, None)
            if key in authored:
                node[key] = authored[key]
        restored += 1
    write_glb(destination, destination_document, destination_chunks)
    return restored


def triangle_count(obj):
    return sum(max(0, len(polygon.vertices) - 2) for polygon in obj.data.polygons)


def refinement_width(name):
    if name.startswith("Frame_"):
        return 0.010
    if name.startswith(("Platform_", "Exterior_")):
        return 0.020
    if name in REFINED_WALL_TRIMS:
        return 0.010
    return None


def weld_and_bevel(obj, width):
    mesh = obj.data
    editable = bmesh.new()
    editable.from_mesh(mesh)
    bmesh.ops.remove_doubles(editable, verts=list(editable.verts), dist=0.00001)
    bmesh.ops.recalc_face_normals(editable, faces=list(editable.faces))
    editable.to_mesh(mesh)
    editable.free()
    mesh.validate(verbose=True)
    mesh.update()

    modifier = obj.modifiers.new("Refined architectural edge", "BEVEL")
    modifier.width = width
    modifier.segments = 1
    modifier.profile = 0.5
    modifier.limit_method = "ANGLE"
    modifier.angle_limit = math.radians(20)
    modifier.harden_normals = True

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)


def main():
    args = parse_args()
    source = Path(args.input).resolve()
    destination = Path(args.output).resolve()
    if not source.exists():
        raise FileNotFoundError(source)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))

    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    missing = sorted(REQUIRED_OBJECTS.difference(obj.name for obj in meshes))
    if missing:
        raise RuntimeError(f"Platform GLB is missing required objects: {missing}")

    # Remove the imported preview action before applying mesh modifiers. This
    # prevents Blender from baking the open entrance pose into local vertices.
    # Muted NLA tracks remain attached and are still available to the exporter.
    for obj in bpy.context.scene.objects:
        if obj.animation_data:
            obj.animation_data.action = None
    bpy.context.scene.frame_set(0)
    bpy.context.view_layer.update()

    before = sum(triangle_count(obj) for obj in meshes)
    refined = []
    for obj in meshes:
        width = refinement_width(obj.name)
        if width is None:
            continue
        weld_and_bevel(obj, width)
        refined.append(obj.name)

    after = sum(triangle_count(obj) for obj in meshes)
    if not TARGET_MIN_TRIANGLES <= after <= TARGET_MAX_TRIANGLES:
        raise RuntimeError(
            f"Refined platform has {after} triangles; expected "
            f"{TARGET_MIN_TRIANGLES}-{TARGET_MAX_TRIANGLES}"
        )


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

    print("PLATFORM_REFINED", f"before={before}", f"after={after}")
    print("RESTORED_NODE_TRANSFORMS", restored)
    print("REFINED_OBJECTS", len(refined), ",".join(refined))
    print("WROTE", destination, destination.stat().st_size)


if __name__ == "__main__":
    main()
