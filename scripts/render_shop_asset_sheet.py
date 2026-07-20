"""Render Blender QA sheets for the refined shop asset candidates."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))

from refine_shop_assets_blender import SUPPORT_ROOTS


HERO_FILES = (
    "machine_vanilla.glb",
    "machine_strawberry.glb",
    "machine_chocolate.glb",
    "machine_mint.glb",
    "main_serving_counter.glb",
    "ice_cream_display_counter.glb",
    "counter_corner.glb",
    "counter_extension.glb",
    "dining_set_two_person.glb",
    "dining_table_compact.glb",
    "dining_chair_mint.glb",
    "dining_chair_coral.glb",
)


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--directory", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--mode", choices=("hero", "supports"), required=True)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def attach_imported_to_root(imported, name):
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    imported_set = set(imported)
    for obj in imported:
        if obj.parent not in imported_set:
            matrix = obj.matrix_world.copy()
            obj.parent = root
            obj.matrix_world = matrix
    return root


def root_meshes(root):
    return [obj for obj in root.children_recursive if obj.type == "MESH" and not obj.name.startswith("COL_")]


def normalize_and_place(root, x, y):
    meshes = root_meshes(root)
    points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    minimum = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    maximum = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    center = (minimum + maximum) * 0.5
    span = max(maximum.x - minimum.x, maximum.y - minimum.y, maximum.z - minimum.z)
    scale = 2.45 / max(span, 0.001)
    root.scale = (scale, scale, scale)
    root.location = (x - center.x * scale, y - center.y * scale, -minimum.z * scale)


def load_hero_assets(directory):
    roots = []
    for filename in HERO_FILES:
        before = set(bpy.context.scene.objects)
        bpy.ops.import_scene.gltf(filepath=str(directory / filename))
        imported = [obj for obj in bpy.context.scene.objects if obj not in before]
        roots.append(attach_imported_to_root(imported, f"Preview_{Path(filename).stem}"))
    return roots


def load_support_assets(directory):
    bpy.ops.import_scene.gltf(filepath=str(directory / "trays_support_all.glb"))
    roots = []
    for name in SUPPORT_ROOTS:
        source = bpy.context.scene.objects[name]
        preview_root = bpy.data.objects.new(f"Preview_{name}", None)
        bpy.context.scene.collection.objects.link(preview_root)
        matrix = source.matrix_world.copy()
        source.parent = preview_root
        source.matrix_world = matrix
        roots.append(preview_root)
    return roots


def main():
    args = parse_args()
    directory = Path(args.directory).resolve()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    roots = load_hero_assets(directory) if args.mode == "hero" else load_support_assets(directory)

    columns = 4
    spacing = 3.45
    for index, root in enumerate(roots):
        column = index % columns
        row = index // columns
        normalize_and_place(root, column * spacing, -row * spacing)

    center = Vector(((columns - 1) * spacing * 0.5, -((len(roots) - 1) // columns) * spacing * 0.5, 0.8))
    bpy.ops.object.camera_add(location=center + Vector((9.6, -12.0, 11.0)))
    camera = bpy.context.object
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 13.3
    look_at(camera, center)

    scene = bpy.context.scene
    scene.camera = camera
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = 1100
    scene.render.resolution_y = 780
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.filepath = str(Path(args.output).resolve())
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.display.shading.cavity_type = "WORLD"
    scene.display.shading.show_specular_highlight = True
    scene.display.shading.background_type = "WORLD"
    bpy.ops.render.render(write_still=True)
    print("RENDERED", scene.render.filepath)


if __name__ == "__main__":
    main()
