"""
プッシュアップのデモ動画を手続き的に生成するBlenderスクリプト。
実写やMixamo等の第三者素材を使わず、単純なプリミティブ形状を組み合わせた
簡易人型モデルにキーフレームアニメーションを付けて書き出す。

使い方 (コマンドラインから、GUIなしで実行):
  blender --background --python build_pushup.py -- preview   # frame15の静止画を1枚だけ書き出す(確認用)
  blender --background --python build_pushup.py -- render    # 全フレームをmp4として書き出す
"""

import bpy
import math
import mathutils
import os
import sys

OUTPUT_DIR = r"C:\Users\takub\OneDrive\ドキュメント\takutolibrary\training-menu\media\exercises"
PREVIEW_PATH = r"C:\Users\takub\AppData\Local\Temp\claude\C--Users-takub-OneDrive--------takutolibrary\281411d1-79ed-44b4-a16f-2f93e4a0224b\scratchpad\pushup_preview.png"


def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(collection):
            if block.users == 0:
                collection.remove(block)


def new_material(name, color, roughness=0.6):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (*color, 1.0)
        bsdf.inputs['Roughness'].default_value = roughness
    return mat


def add_empty(name, parent, location):
    empty = bpy.data.objects.new(name, None)
    empty.empty_display_size = 0.05
    bpy.context.collection.objects.link(empty)
    empty.location = location
    if parent:
        empty.parent = parent
    return empty


def add_box(name, size, location, parent, material):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.location = location
    obj.data.materials.append(material)
    obj.parent = parent
    return obj


def add_cylinder(name, radius, depth, location, parent, material):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, location=(0, 0, 0))
    obj = bpy.context.active_object
    obj.name = name
    obj.location = location
    obj.data.materials.append(material)
    obj.parent = parent
    return obj


def add_sphere(name, radius, location, parent, material):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=(0, 0, 0))
    obj = bpy.context.active_object
    obj.name = name
    obj.location = location
    obj.data.materials.append(material)
    obj.parent = parent
    return obj


def build_scene():
    clear_scene()

    mat_skin = new_material('Skin', (0.85, 0.65, 0.52))
    mat_shirt = new_material('Shirt', (0.31, 0.82, 0.65))  # アプリのアクセントカラーに合わせる
    mat_shorts = new_material('Shorts', (0.32, 0.35, 0.4))
    mat_ground = new_material('Ground', (0.22, 0.24, 0.28), roughness=0.9)

    bpy.ops.mesh.primitive_plane_add(size=4, location=(0, 0, 0))
    ground = bpy.context.active_object
    ground.name = 'Ground'
    ground.data.materials.append(mat_ground)

    # 上腕+前腕が伸び切った状態でちょうど手が床(z=0)に着くように上位置の高さを合わせる
    body = add_empty('Body', None, (0, 0, 0.53))

    add_box('Torso', (0.56, 0.27, 0.2), (0.12, 0, 0), body, mat_shirt)
    add_sphere('Head', 0.095, (0.44, 0, 0), body, mat_skin)

    for side, y in (('L', 0.09), ('R', -0.09)):
        leg = add_cylinder(f'Leg_{side}', 0.06, 0.65, (-0.42, y, 0), body, mat_shorts)
        leg.rotation_euler = (0, math.radians(90), 0)
        add_box(f'Foot_{side}', (0.12, 0.08, 0.05), (-0.72, y, -0.02), body, mat_skin)

    shoulders, elbows = {}, {}
    for side, y in (('L', 0.15), ('R', -0.15)):
        shoulder = add_empty(f'Shoulder_{side}', body, (0.3, y, 0))
        add_cylinder(f'UpperArm_{side}', 0.045, 0.28, (0, 0, -0.14), shoulder, mat_skin)
        elbow = add_empty(f'Elbow_{side}', shoulder, (0, 0, -0.28))
        add_cylinder(f'ForeArm_{side}', 0.04, 0.25, (0, 0, -0.125), elbow, mat_skin)
        add_box(f'Hand_{side}', (0.1, 0.06, 0.03), (0, 0, -0.25), elbow, mat_skin)
        shoulders[side] = shoulder
        elbows[side] = elbow

    bpy.context.preferences.edit.keyframe_new_interpolation_type = 'SINE'

    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = 30
    scene.render.fps = 24

    def keyframe_pose(frame, body_z, shoulder_deg, elbow_deg):
        scene.frame_set(frame)
        body.location.z = body_z
        body.keyframe_insert(data_path='location', index=2)
        for side in ('L', 'R'):
            shoulders[side].rotation_euler.y = math.radians(shoulder_deg)
            shoulders[side].keyframe_insert(data_path='rotation_euler', index=1)
            elbows[side].rotation_euler.y = math.radians(elbow_deg)
            elbows[side].keyframe_insert(data_path='rotation_euler', index=1)

    keyframe_pose(1, 0.53, 0, 0)
    keyframe_pose(15, 0.30, -35, 70)
    keyframe_pose(30, 0.53, 0, 0)

    cam_data = bpy.data.cameras.new('Camera')
    cam_data.type = 'PERSP'
    cam_data.lens = 50
    cam = bpy.data.objects.new('Camera', cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = (1.9, -2.6, 1.15)
    target = mathutils.Vector((-0.05, 0, 0.28))
    direction = target - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam

    light_data = bpy.data.lights.new('Sun', type='SUN')
    light_data.energy = 4.5
    light = bpy.data.objects.new('Sun', light_data)
    bpy.context.collection.objects.link(light)
    light.location = (2, -2, 3)
    light.rotation_euler = (math.radians(55), 0, math.radians(35))

    fill_data = bpy.data.lights.new('Fill', type='SUN')
    fill_data.energy = 1.5
    fill = bpy.data.objects.new('Fill', fill_data)
    bpy.context.collection.objects.link(fill)
    fill.rotation_euler = (math.radians(70), 0, math.radians(-140))

    world = scene.world
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    if bg:
        bg.inputs[0].default_value = (0.12, 0.13, 0.16, 1)
        bg.inputs[1].default_value = 1.0

    engine_items = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
    scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in engine_items else 'BLENDER_EEVEE'
    scene.render.resolution_x = 480
    scene.render.resolution_y = 480

    return scene


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    mode = argv[0] if len(argv) > 0 else 'preview'
    preview_frame = int(argv[1]) if len(argv) > 1 else 15

    scene = build_scene()

    if mode == 'preview':
        scene.frame_set(preview_frame)
        scene.render.image_settings.file_format = 'PNG'
        scene.render.filepath = PREVIEW_PATH
        bpy.ops.render.render(write_still=True)
        print(f'PREVIEW_WRITTEN:{PREVIEW_PATH}')
    else:
        # このBlenderビルドはFFMPEG動画出力が無効なため、PNG連番で書き出し、
        # 別途外部ffmpegコマンドでmp4にエンコードする。
        frames_dir = os.path.join(OUTPUT_DIR, '_frames')
        os.makedirs(frames_dir, exist_ok=True)
        scene.render.image_settings.file_format = 'PNG'
        scene.render.filepath = os.path.join(frames_dir, 'f_')
        bpy.ops.render.render(animation=True)
        print(f'FRAMES_WRITTEN:{frames_dir}')


main()
