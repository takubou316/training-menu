"""
プッシュアップのデモ動画を手続き的に生成するBlenderスクリプト。
実写やMixamo等の第三者素材を使わず、単純なプリミティブ形状を組み合わせた
簡易人型モデルにキーフレームアニメーションを付けて書き出す。

ポーズは当てずっぽうの角度ではなく、以下の物理制約から逆算する:
  - 足(つま先)は常に床(z=0)の固定点に接地する
  - 手も常に床(z=0)の固定点に接地する
  - 体幹・脚は常に一直線(プランク)を保ち、足の接地点を支点に回転するだけ
  - 下ろす深さは「胸が床に触れるくらいまで」を目安に設定
  - 肘は体幹から45〜60度外側に開く
    出典:
      - vady.jp「腕立て伏せで胸筋を最速で厚くする！正しいフォームとバリエーション完全ガイド」
        https://vady.jp/article/pushup-chest-muscle-fast-guide/
        (肘は上腕と体幹の角度45〜60度が目安。胸が床に触れるぐらいまで下げる。
         呼吸は下降で吸い、上昇で吐く)
  これらの制約から肩の位置・肘の位置を毎回計算して求める(2リンクの逆運動学)。
  「肘を体幹から45〜60度開く」は左右方向(上から見た開き)の要素なので、
  肩の追加のX軸回転で簡易的に表現している(完全な3Dの逆運動学ではなく視覚的な近似)。

使い方 (コマンドラインから、GUIなしで実行):
  blender --background --python build_pushup.py -- preview       # frame中間の静止画を1枚だけ書き出す(確認用)
  blender --background --python build_pushup.py -- preview 1     # 指定フレームを確認
  blender --background --python build_pushup.py -- render        # 全フレームをmp4用PNG連番で書き出す

字幕付きmp4まで一気に作る場合は同じフォルダの render_pushup.ps1 を実行する
(このスクリプト単体はPNG連番を書き出すところまで。字幕焼き込みはffmpegで別途行う)。
"""

import bpy
import math
import mathutils
import os
import sys

OUTPUT_DIR = r"C:\Users\takub\OneDrive\ドキュメント\takutolibrary\training-menu\media\exercises"
PREVIEW_PATH = r"C:\Users\takub\AppData\Local\Temp\claude\C--Users-takub-OneDrive--------takutolibrary\281411d1-79ed-44b4-a16f-2f93e4a0224b\scratchpad\pushup_preview.png"

# ---------- 体の寸法(ローカル座標、Body原点=腰あたりを基準) ----------
FOOT_LOCAL_X = -0.72       # 足(接地点)のBodyローカルX
SHOULDER_LOCAL_X = 0.30    # 肩のBodyローカルX
UPPER_ARM_LEN = 0.28
FOREARM_LEN = 0.25
LP = SHOULDER_LOCAL_X - FOOT_LOCAL_X  # 足の接地点(支点)から肩までの剛体長

HAND_X = 0.80                 # 手の接地点(床, 固定)のワールドX。足の接地点をワールド原点(0,0)とする
SHOULDER_HEIGHT_TOP = 0.50     # 上: 腕がほぼ伸びきる高さ
SHOULDER_HEIGHT_BOTTOM = 0.145  # 下: 胸が床に触れるくらいまで下げた高さ
ELBOW_FLARE_DEG = 25           # 肘を体幹から外側に開く角度(45〜60度目安を視覚的に近似)

FRAME_TOP1 = 1
FRAME_BOTTOM = 45
FRAME_TOP2 = 90


def solve_theta_from_height(shoulder_height):
    """肩の高さ(=体の傾きtheta)を求める。"""
    return math.asin(min(max(shoulder_height / LP, -1.0), 1.0))


def solve_elbow_point(shoulder, hand, upper_len, fore_len):
    """肩Sと手Hを結ぶ2リンク(上腕+前腕)の肘の位置を求める(2D, x-z平面)。"""
    sx, sz = shoulder
    hx, hz = hand
    dx, dz = hx - sx, hz - sz
    d = math.hypot(dx, dz)
    d = min(d, upper_len + fore_len - 1e-6)
    a = (upper_len ** 2 - fore_len ** 2 + d ** 2) / (2 * d)
    h = math.sqrt(max(upper_len ** 2 - a ** 2, 0.0))
    ux, uz = dx / d, dz / d
    # uの法線ベクトル。肘が体幹側(上・後方)に来る向きを選ぶ。
    vx, vz = uz, -ux
    px, pz = sx + a * ux, sz + a * uz
    e1 = (px + h * vx, pz + h * vz)
    e2 = (px - h * vx, pz - h * vz)
    # 足の支点(x=0)から遠い側=体の後方寄りに来る解を、肘が体側に来る自然な解として採用
    return e1 if e1[0] < e2[0] else e2


def world_angle(dx, dz):
    """(0,0,-1)方向を基準に、方向(dx,dz)へ向けるためのY回転角(ワールド基準, ラジアン)。"""
    return math.atan2(-dx, -dz)


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

    bpy.ops.mesh.primitive_plane_add(size=4, location=(0.4, 0, 0))
    ground = bpy.context.active_object
    ground.name = 'Ground'
    ground.data.materials.append(mat_ground)

    body = add_empty('Body', None, (0, 0, 0))

    add_box('Torso', (0.56, 0.27, 0.2), (0.12, 0, 0), body, mat_shirt)
    add_sphere('Head', 0.095, (0.44, 0, 0), body, mat_skin)

    for side, y in (('L', 0.09), ('R', -0.09)):
        leg = add_cylinder(f'Leg_{side}', 0.06, 0.65, (FOOT_LOCAL_X + 0.325, y, 0), body, mat_shorts)
        leg.rotation_euler = (0, math.radians(90), 0)
        add_box(f'Foot_{side}', (0.12, 0.08, 0.05), (FOOT_LOCAL_X, y, -0.02), body, mat_skin)

    shoulders, elbows = {}, {}
    for side, y in (('L', 0.15), ('R', -0.15)):
        shoulder = add_empty(f'Shoulder_{side}', body, (SHOULDER_LOCAL_X, y, 0))
        add_cylinder(f'UpperArm_{side}', 0.045, UPPER_ARM_LEN, (0, 0, -UPPER_ARM_LEN / 2), shoulder, mat_skin)
        elbow = add_empty(f'Elbow_{side}', shoulder, (0, 0, -UPPER_ARM_LEN))
        add_cylinder(f'ForeArm_{side}', 0.04, FOREARM_LEN, (0, 0, -FOREARM_LEN / 2), elbow, mat_skin)
        add_box(f'Hand_{side}', (0.1, 0.06, 0.03), (0, 0, -FOREARM_LEN), elbow, mat_skin)
        shoulders[side] = shoulder
        elbows[side] = elbow

    bpy.context.preferences.edit.keyframe_new_interpolation_type = 'SINE'

    scene = bpy.context.scene
    scene.frame_start = FRAME_TOP1
    scene.frame_end = FRAME_TOP2
    scene.render.fps = 24

    def keyframe_pose(frame, shoulder_height):
        theta = solve_theta_from_height(shoulder_height)
        body_rot = -theta
        # 足の接地点(ワールド原点)からBody原点への逆算(足がローカルFOOT_LOCAL_Xにあるため)
        foot_world_offset = (
            FOOT_LOCAL_X * math.cos(body_rot),
            -FOOT_LOCAL_X * math.sin(body_rot),
        )
        body_loc = (-foot_world_offset[0], -foot_world_offset[1])

        shoulder_world = (LP * math.cos(theta), LP * math.sin(theta))
        hand_world = (HAND_X, 0.0)
        elbow_world = solve_elbow_point(shoulder_world, hand_world, UPPER_ARM_LEN, FOREARM_LEN)

        shoulder_dir = (elbow_world[0] - shoulder_world[0], elbow_world[1] - shoulder_world[1])
        forearm_dir = (hand_world[0] - elbow_world[0], hand_world[1] - elbow_world[1])
        shoulder_world_angle = world_angle(*shoulder_dir)
        forearm_world_angle = world_angle(*forearm_dir)

        shoulder_local = shoulder_world_angle - body_rot
        elbow_local = forearm_world_angle - shoulder_world_angle

        scene.frame_set(frame)
        body.location = (body_loc[0], 0, body_loc[1])
        body.rotation_euler.y = body_rot
        body.keyframe_insert(data_path='location')
        body.keyframe_insert(data_path='rotation_euler', index=1)
        for side, flare_sign in (('L', 1), ('R', -1)):
            shoulders[side].rotation_euler.y = shoulder_local
            shoulders[side].rotation_euler.x = flare_sign * math.radians(ELBOW_FLARE_DEG)
            shoulders[side].keyframe_insert(data_path='rotation_euler', index=1)
            shoulders[side].keyframe_insert(data_path='rotation_euler', index=0)
            elbows[side].rotation_euler.y = elbow_local
            elbows[side].keyframe_insert(data_path='rotation_euler', index=1)

    keyframe_pose(FRAME_TOP1, SHOULDER_HEIGHT_TOP)
    keyframe_pose(FRAME_BOTTOM, SHOULDER_HEIGHT_BOTTOM)
    keyframe_pose(FRAME_TOP2, SHOULDER_HEIGHT_TOP)

    cam_data = bpy.data.cameras.new('Camera')
    cam_data.type = 'PERSP'
    cam_data.lens = 42
    cam = bpy.data.objects.new('Camera', cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = (1.6, -1.9, 0.55)
    target = mathutils.Vector((0.35, 0, 0.18))
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
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640

    return scene


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    mode = argv[0] if len(argv) > 0 else 'preview'
    preview_frame = int(argv[1]) if len(argv) > 1 else FRAME_BOTTOM

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
        print(f'RENDER_WRITTEN:{frames_dir}')


main()
