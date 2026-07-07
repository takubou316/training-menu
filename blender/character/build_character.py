import bpy
import mathutils
import math

addon_name = 'rigify'
if addon_name not in bpy.context.preferences.addons:
    bpy.ops.preferences.addon_enable(module=addon_name)

for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)

BUNDLE_PATH = r"C:\Users\takub\Tools\human-base-meshes\human_base_meshes_bundle.blend"
with bpy.data.libraries.load(BUNDLE_PATH, link=False) as (data_from, data_to):
    data_to.objects = ['GEO-body_male_stylized']

body = None
for obj in data_to.objects:
    if obj is not None:
        bpy.context.collection.objects.link(obj)
        body = obj

body.location = (0, 0, 0)
body_height = body.dimensions.z
print(f"BODY_HEIGHT={body_height:.4f}")

bpy.ops.object.armature_human_metarig_add()
metarig = bpy.context.active_object
metarig_height = metarig.dimensions.z
scale = body_height / metarig_height
metarig.scale = (scale, scale, scale)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
print(f"SCALED metarig by {scale:.4f}, new height={metarig.dimensions.z:.4f}")

bpy.ops.object.mode_set(mode='EDIT')
ebones = metarig.data.edit_bones


def rotate_subtree(root_name, pivot, axis, angle_rad):
    names = set()

    def collect(name):
        names.add(name)
        for b in ebones:
            if b.parent and b.parent.name == name:
                collect(b.name)
    collect(root_name)

    mat = mathutils.Matrix.Rotation(angle_rad, 3, axis)
    pivot_vec = mathutils.Vector(pivot)
    # 事前に全ボーンの元head/tailを読み切ってから書き込む
    # (use_connect=Trueの子は親のtailに自動追従するため、書き込み順序によっては
    # 後続の代入で上書きされてしまう。tailだけ設定し、headはconnectでない場合のみ設定する)
    originals = {name: (ebones[name].head.copy(), ebones[name].tail.copy()) for name in names}
    for name in names:
        b = ebones[name]
        old_head, old_tail = originals[name]
        new_tail = pivot_vec + mat @ (old_tail - pivot_vec)
        if not b.use_connect:
            new_head = pivot_vec + mat @ (old_head - pivot_vec)
            b.head = new_head
        b.tail = new_tail


# 肩から先の腕をTポーズ(水平)からAポーズ(下に下ろす)へ、Y軸回りに回転する。
# 元のupper_arm.Lは肩からほぼ+X方向(体の外側)に伸びているので、
# Y軸で-80度回転させると、ほぼ-Z方向(下向き)になる。
for side, sign in (('L', 1), ('R', -1)):
    upper = ebones[f'upper_arm.{side}']
    pivot = tuple(upper.head)  # upper_arm 自体の付け根をピボットにする
    rotate_subtree(f'upper_arm.{side}', pivot, 'Y', sign * math.radians(56))

bpy.ops.object.mode_set(mode='OBJECT')

bpy.ops.wm.save_as_mainfile(filepath=r"C:\Users\takub\AppData\Local\Temp\claude\C--Users-takub-OneDrive--------takutolibrary\281411d1-79ed-44b4-a16f-2f93e4a0224b\scratchpad\character_wip.blend")
print("DONE")
