"""Render the eight runtime customer outfit combinations for visual QA."""

import bpy
import math
import os
import sys
from mathutils import Vector


VARIANTS = (
    ("Body_010", "T_Shirt_009", "Pants_010", "Shoe_Sneakers_009", "Hairstyle_male_010"),
    ("Body_010", "Outerwear_029", "Pants_014", "Shoe_Sneakers_009", "Hairstyle_male_012", "Glasses_004"),
    ("Body_010", "T_Shirt_009", "Shorts_003", "Socks_008", "Shoe_Sneakers_009", "Hat_010"),
    ("Body_010", "Outerwear_036", "Pants_010", "Shoe_Sneakers_009", "Hat_057", "Gloves_014"),
    ("Body_010", "T_Shirt_009", "Pants_014", "Shoe_Sneakers_009", "Hairstyle_male_012", "Headphones_002"),
    ("Body_010", "Costume_10_001", "Hat_049", "Moustache_001", "Gloves_006"),
    ("Body_010", "Costume_6_001", "Pants_010", "Shoe_Sneakers_009", "Clown_nose_001", "Hat_010"),
    ("Body_010", "Outerwear_029", "Shorts_003", "Shoe_Slippers_005", "Hairstyle_male_010", "Glasses_006"),
)


def cli_arg(name):
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return argv[argv.index(name) + 1]


def base_name(name):
    chunks = name.rsplit(".", 1)
    return chunks[0] if len(chunks) == 2 and chunks[1].isdigit() else name


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


source = os.path.abspath(cli_arg("--input"))
output = os.path.abspath(cli_arg("--output"))
bpy.ops.wm.read_factory_settings(use_empty=True)

for index, parts in enumerate(VARIANTS):
    previous_objects = set(bpy.context.scene.objects)
    previous_actions = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=source)
    imported = [obj for obj in bpy.context.scene.objects if obj not in previous_objects]
    new_actions = [action for action in bpy.data.actions if action not in previous_actions]
    selected = set(parts)
    kept = []
    for obj in list(imported):
        if obj.type == "MESH" and base_name(obj.name) not in selected:
            bpy.data.objects.remove(obj, do_unlink=True)
        else:
            kept.append(obj)
    placement = bpy.data.objects.new(f"Variant_{index + 1}", None)
    bpy.context.scene.collection.objects.link(placement)
    for obj in kept:
        if obj.parent is None:
            obj.parent = placement
    column = index % 4
    row = index // 4
    placement.location = ((column - 1.5) * 1.75, (0.5 - row) * 1.05, 0.0)
    placement.scale = (0.76, 0.76, 0.76)
    armature = next(obj for obj in imported if obj.type == "ARMATURE")
    idle = next(action for action in new_actions if base_name(action.name) == "Idle")
    armature.animation_data_create()
    armature.animation_data.action = idle

bpy.context.scene.frame_set(20)
bpy.ops.mesh.primitive_plane_add(size=14, location=(0, 0, -0.015))
floor = bpy.context.object
floor_material = bpy.data.materials.new("PreviewFloor")
floor_material.diffuse_color = (0.82, 0.86, 0.72, 1)
floor.data.materials.append(floor_material)

bpy.ops.object.camera_add(location=(6.8, -11.5, 5.8))
camera = bpy.context.object
camera.data.type = "ORTHO"
camera.data.ortho_scale = 7.5
look_at(camera, (0, 0, 0.85))
bpy.context.scene.camera = camera

scene = bpy.context.scene
scene.render.engine = "BLENDER_WORKBENCH"
scene.display.shading.light = "STUDIO"
scene.display.shading.color_type = "TEXTURE"
scene.display.shading.show_shadows = True
scene.display.shading.show_cavity = True
scene.display.shading.cavity_type = "WORLD"
scene.render.resolution_x = 1200
scene.render.resolution_y = 700
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = output
scene.render.film_transparent = False
os.makedirs(os.path.dirname(output), exist_ok=True)
bpy.ops.render.render(write_still=True)
print("RENDERED", output)
