import bpy
import math

addon_name = 'rigify'
if addon_name not in bpy.context.preferences.addons:
    bpy.ops.preferences.addon_enable(module=addon_name)

bpy.ops.wm.open_mainfile(filepath=r"C:\Users\takub\AppData\Local\Temp\claude\C--Users-takub-OneDrive--------takutolibrary\281411d1-79ed-44b4-a16f-2f93e4a0224b\scratchpad\character_wip.blend")

metarig = bpy.data.objects['metarig']
body = bpy.data.objects['GEO-body_male_stylized']

# Rigifyでリグを生成(ポーズモードでないと呼べない)
bpy.context.view_layer.objects.active = metarig
bpy.ops.object.mode_set(mode='POSE')
bpy.ops.pose.rigify_generate()
bpy.ops.object.mode_set(mode='OBJECT')
rig = bpy.context.active_object
print(f"RIG_GENERATED: {rig.name}")

# メッシュをリグに「自動のウェイトで」ペアレント
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
print("PARENTED_WITH_AUTO_WEIGHTS")

bpy.ops.wm.save_as_mainfile(filepath=r"C:\Users\takub\AppData\Local\Temp\claude\C--Users-takub-OneDrive--------takutolibrary\281411d1-79ed-44b4-a16f-2f93e4a0224b\scratchpad\character_rigged.blend")
print("DONE")
