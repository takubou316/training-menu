import bpy
import math

bpy.ops.wm.open_mainfile(filepath=r"C:\Users\takub\AppData\Local\Temp\claude\C--Users-takub-OneDrive--------takutolibrary\281411d1-79ed-44b4-a16f-2f93e4a0224b\scratchpad\character_rigged.blend")

rig = bpy.data.objects['rig']
body = bpy.data.objects['GEO-body_male_stylized']

bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='POSE')

for side in ('L', 'R'):
    fb = rig.pose.bones[f'forearm_fk.{side}']
    fb.rotation_mode = 'XYZ'
    fb.rotation_euler = (math.radians(-90), 0, 0)

bpy.ops.object.mode_set(mode='OBJECT')
bpy.context.view_layer.update()

mat_skin = bpy.data.materials.new('Skin')
mat_skin.use_nodes = True
mat_skin.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.85, 0.65, 0.52, 1.0)
body.data.materials.clear()
body.data.materials.append(mat_skin)

light = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', type='SUN'))
bpy.context.collection.objects.link(light)
light.location = (2, -2, 3)
light.rotation_euler = (math.radians(55), 0, math.radians(35))

cam_data = bpy.data.cameras.new('Camera')
cam = bpy.data.objects.new('Camera', cam_data)
bpy.context.collection.objects.link(cam)
cam.location = (0, -3.5, 1.0)
cam.rotation_euler = (math.radians(85), 0, 0)
bpy.context.scene.camera = cam

scene = bpy.context.scene
engine_items = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in engine_items else 'BLENDER_EEVEE'
scene.render.resolution_x = 500
scene.render.resolution_y = 700
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = r"C:\Users\takub\AppData\Local\Temp\claude\C--Users-takub-OneDrive--------takutolibrary\281411d1-79ed-44b4-a16f-2f93e4a0224b\scratchpad\pose_test.png"
bpy.ops.render.render(write_still=True)
print("DONE")
