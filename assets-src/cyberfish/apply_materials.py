"""Wire the generated PBR textures into glTF-friendly Principled materials (run inside Blender)."""
import bpy

def tex_material(name, prefix, alpha=False, emission_strength=5.0, coat=0.5, normal_strength=1.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); out.location = (600, 0)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled"); bsdf.location = (250, 0)
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    def img(suffix, noncolor, y):
        n = nt.nodes.new("ShaderNodeTexImage"); n.image = bpy.data.images[prefix + suffix]; n.location = (-500, y)
        n.image.colorspace_settings.name = 'Non-Color' if noncolor else 'sRGB'
        return n
    bc = img("_basecolor", False, 400); nt.links.new(bc.outputs["Color"], bsdf.inputs["Base Color"])
    if alpha:
        nt.links.new(bc.outputs["Alpha"], bsdf.inputs["Alpha"])
        mat.surface_render_method = 'BLENDED'; mat.use_transparency_overlap = False
    orm = img("_orm", True, 100)
    sep = nt.nodes.new("ShaderNodeSeparateColor"); sep.location = (-200, 100)
    nt.links.new(orm.outputs["Color"], sep.inputs[0])
    nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"]); nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    nm = img("_normal", True, -200)
    nmap = nt.nodes.new("ShaderNodeNormalMap"); nmap.location = (-200, -200); nmap.inputs["Strength"].default_value = normal_strength
    nt.links.new(nm.outputs["Color"], nmap.inputs["Color"]); nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    em = img("_emissive", False, -500)
    nt.links.new(em.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = emission_strength
    bsdf.inputs["Coat Weight"].default_value = coat; bsdf.inputs["Coat Roughness"].default_value = 0.08
    return mat

shell = tex_material("CF_Shell", "CF_body", emission_strength=9.0, coat=0.55)
finm = tex_material("CF_FinMat", "CF_fins", alpha=True, emission_strength=3.0, coat=0.25)
tailm = tex_material("CF_TailMat", "CF_tail", alpha=True, emission_strength=3.0, coat=0.25)

for ob in bpy.data.objects:
    if not ob.name.startswith("CF_") or ob.type != 'MESH': continue
    if ob.name == "CF_Body": m = shell
    elif ob.name == "CF_FinTail": m = tailm
    elif ob.name.startswith("CF_Fin"): m = finm
    else: continue
    ob.data.materials.clear(); ob.data.materials.append(m)

result = {"materials": [m.name for m in (shell, finm, tailm)]}
