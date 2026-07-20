import argparse
import math
import os
import sys

import bpy
from mathutils import Vector


def args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--action", default="Idle")
    parser.add_argument("--frame", type=int, default=10)
    return parser.parse_args(argv)


def look_at(obj, target):
    obj.rotation_euler = ((Vector(target) - obj.location).to_track_quat("-Z", "Y")).to_euler()


options = args()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.abspath(options.input))
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 600
scene.render.resolution_y = 720
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.render.filepath = os.path.abspath(options.output)
scene.view_settings.look = "AgX - Medium High Contrast"

world = bpy.data.worlds.new("PreviewWorld")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.68, 0.82, 0.72, 1.0)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8
scene.world = world

bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -0.012))
ground = bpy.context.object
mat = bpy.data.materials.new("Ground")
mat.diffuse_color = (0.78, 0.82, 0.68, 1.0)
ground.data.materials.append(mat)

bpy.ops.object.light_add(type="AREA", location=(-3.5, -4.0, 6.0))
key = bpy.context.object
key.data.energy = 850
key.data.shape = "DISK"
key.data.size = 4.0
look_at(key, (0.0, 0.0, 1.0))

bpy.ops.object.light_add(type="AREA", location=(4.0, -1.0, 3.0))
fill = bpy.context.object
fill.data.energy = 500
fill.data.size = 3.0
look_at(fill, (0.0, 0.0, 1.1))

bpy.ops.object.light_add(type="AREA", location=(-2.0, 3.0, 4.0))
rim = bpy.context.object
rim.data.energy = 650
rim.data.size = 2.5
look_at(rim, (0.0, 0.0, 1.2))

bpy.ops.object.camera_add(location=(3.3, -5.5, 2.8))
camera = bpy.context.object
camera.data.type = "ORTHO"
camera.data.ortho_scale = 2.65
camera.data.lens = 52
look_at(camera, (0.0, 0.0, 1.05))
scene.camera = camera

armature = next((obj for obj in scene.objects if obj.type == "ARMATURE"), None)
if armature and bpy.data.actions.get(options.action):
    armature.animation_data_create()
    armature.animation_data.action = bpy.data.actions[options.action]
scene.frame_set(options.frame)
bpy.ops.render.render(write_still=True)
print("RENDERED", scene.render.filepath)
