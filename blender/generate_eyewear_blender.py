# -*- coding: utf-8 -*-
"""
===============================================================================
ENCANTADAS EYEWEAR — GERADOR PROCEDURAL DE ALTA PRECISÃO PARA BLENDER (BPY)
===============================================================================
Compatível com: Blender 3.6 LTS, 4.0, 4.1, 4.2, 4.3+
Unidades: Sistema Métrico (1 unidade Blender = 1 metro -> escala real em mm)

Modelos incluídos (4 óculos completos com vistas ortográficas fiéis às fotos):
  1. ENC_01_Imperial_Leao (1ª Imagem)
     - Aro frontal retangular arredondado em acetato tartaruga escuro
     - Ponte dupla metálica dourada superior/central + barra de sobrancelha (brow bar)
     - Emblema 3D esculpido de cabeça de leão dourado nas charneiras (dobradiças)
     - 2 rebites circulares dourados em cada canto superior frontal
     - Plaquetas nasais (nose pads) em silicone translúcido com braços em "S" dourados
     - Hastes metálicas douradas com ponteiras anatômicas em acetato tartaruga
     - Lentes em degradê marrom fumê

  2. ENC_02_Navigator_Ambar (2ª Imagem — Linha 1)
     - Armação aviador/navigator robusta em acetato preto brilhante com ponte dupla
     - Detalhe de grampo metálico dourado horizontal em T nas charneiras
     - Lentes laranja/âmbar translúcidas
     - Hastes em acetato preto com alma metálica

  3. ENC_03_Rimless_Pantera (2ª Imagem — Linha 2)
     - Construção rimless (sem aro / três peças) com lentes chanfradas degradê marrom/chá
     - Ponte central curva em ouro polido + plaquetas nasais ajustáveis
     - Escultura de cabeça de pantera/leopardo dourada com manchas esmaltadas pretas
       mordendo as laterais das lentes
     - Hastes finas douradas com ponteiras tartaruga

  4. ENC_04_Bold_Tartaruga (2ª Imagem — Linha 3)
     - Armação retangular bold espessa em acetato tartaruga clássico (marrom/âmbar)
     - Emblema duplo metálico dourado nas têmporas (hastes largas que afinam na orelha)
     - Lentes marrom escuro sólido

COMO USAR NO BLENDER:
  Opção A (Interface Gráfica):
    1. Abra o Blender
    2. Vá para a aba "Scripting" no topo
    3. Clique em "Open" e selecione este arquivo `generate_eyewear_blender.py`
    4. Clique em "Run Script" (ícone de Play ▶)
    5. Mude o Viewport Shading para "Material Preview" (Z -> Material Preview) ou "Rendered"

  Opção B (Linha de Comando / Headless):
    blender --background --python blender/generate_eyewear_blender.py
===============================================================================
"""

import bpy
import bmesh
import math
import os
from mathutils import Vector, Matrix, Euler


# ==============================================================================
# UTILITÁRIOS DE CENA E LIMPEZA
# ==============================================================================

def clear_scene():
    """Remove objetos antigos da coleção Encantadas_Eyewear ou limpa cena padrão."""
    if bpy.ops.object.mode_set.poll():
        bpy.ops.object.mode_set(mode='OBJECT')

    # Limpa objetos existentes
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)

    # Limpa malhas e materiais órfãos
    for block in bpy.data.meshes:
        if block.users == 0:
            bpy.data.meshes.remove(block)
    for block in bpy.data.materials:
        if block.users == 0:
            bpy.data.materials.remove(block)
    for block in bpy.data.curves:
        if block.users == 0:
            bpy.data.curves.remove(block)

    # Configura unidades para milímetros / metros reais
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    scene.unit_settings.length_unit = 'MILLIMETERS'


def get_or_create_collection(name, parent=None):
    """Cria ou recupera uma Collection organizacional no Outliner."""
    if name in bpy.data.collections:
        col = bpy.data.collections[name]
    else:
        col = bpy.data.collections.new(name)
        target_parent = parent if parent else bpy.context.scene.collection
        target_parent.children.link(col)
    return col


def link_to_collection(obj, collection):
    """Move um objeto exclusivamente para a coleção especificada."""
    for col in obj.users_collection:
        col.objects.unlink(obj)
    collection.objects.link(obj)


def set_principled_input(bsdf, names, value):
    """Define entrada do Principled BSDF compatível com Blender 3.x e 4.x."""
    if isinstance(names, str):
        names = [names]
    for name in names:
        if name in bsdf.inputs:
            bsdf.inputs[name].default_value = value
            return True
    return False


# ==============================================================================
# SISTEMA DE MATERIAIS PBR PROCEDURAIS (CYCLES & EEVEE)
# ==============================================================================

def create_gold_material(name="MAT_Gold_18K"):
    """Ouro 18K polido para pontes, leão, pantera, rebites e hastes."""
    if name in bpy.data.materials:
        return bpy.data.materials[name]

    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")

    set_principled_input(bsdf, ["Base Color"], (0.88, 0.71, 0.34, 1.0))
    set_principled_input(bsdf, ["Metallic"], 1.0)
    set_principled_input(bsdf, ["Roughness"], 0.14)
    set_principled_input(bsdf, ["Coat Weight", "Clearcoat"], 0.25)
    return mat


def create_black_enamel_material(name="MAT_Black_Enamel"):
    """Esmalte preto brilhante para as manchas da pantera e acetato preto."""
    if name in bpy.data.materials:
        return bpy.data.materials[name]

    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")

    set_principled_input(bsdf, ["Base Color"], (0.015, 0.015, 0.018, 1.0))
    set_principled_input(bsdf, ["Metallic"], 0.0)
    set_principled_input(bsdf, ["Roughness"], 0.08)
    set_principled_input(bsdf, ["Coat Weight", "Clearcoat"], 0.9)
    set_principled_input(bsdf, ["Coat Roughness", "Clearcoat Roughness"], 0.04)
    return mat


def create_tortoise_material(name="MAT_Acetate_Tortoise", dark_mode=False):
    """
    Acetato italiano tartaruga procedural usando Noise 3D + Voronoi + ColorRamp.
    dark_mode=True para o Modelo 1 (Imperial Leão); False para o Modelo 4 (clássico).
    """
    if name in bpy.data.materials:
        return bpy.data.materials[name]

    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")

    tex_coord = nodes.new(type='ShaderNodeTexCoord')
    mapping = nodes.new(type='ShaderNodeMapping')
    mapping.inputs['Scale'].default_value = (120.0, 120.0, 120.0)

    noise = nodes.new(type='ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 3.2
    noise.inputs['Detail'].default_value = 8.0
    noise.inputs['Roughness'].default_value = 0.58
    noise.inputs['Distortion'].default_value = 1.4

    ramp = nodes.new(type='ShaderNodeValToRGB')
    elements = ramp.color_ramp.elements
    elements[0].position = 0.28
    elements[0].color = (0.018, 0.009, 0.005, 1.0)  # Café quase preto

    e_mid = elements.new(0.55)
    if dark_mode:
        e_mid.color = (0.12, 0.05, 0.018, 1.0)       # Mogno escuro
        elements[1].position = 0.78
        elements[1].color = (0.28, 0.12, 0.035, 1.0) # Âmbar queimado discreto
    else:
        e_mid.color = (0.24, 0.09, 0.02, 1.0)        # Marrom tartaruga rico
        elements[1].position = 0.74
        elements[1].color = (0.58, 0.27, 0.05, 1.0)  # Mel / âmbar dourado vivo

    links.new(tex_coord.outputs['Object'], mapping.inputs['Vector'])
    links.new(mapping.outputs['Vector'], noise.inputs['Vector'])
    links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])

    set_principled_input(bsdf, ["Roughness"], 0.11)
    set_principled_input(bsdf, ["Coat Weight", "Clearcoat"], 1.0)
    set_principled_input(bsdf, ["Coat Roughness", "Clearcoat Roughness"], 0.03)
    set_principled_input(bsdf, ["Subsurface Weight", "Subsurface"], 0.15)
    return mat


def create_lens_material(name, top_color, bottom_color, alpha=0.72):
    """Material de lente óptica com degradê vertical e reflexo anti-reflexo."""
    if name in bpy.data.materials:
        return bpy.data.materials[name]

    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    if hasattr(mat, "blend_method"):
        mat.blend_method = 'BLEND'

    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")

    tex_coord = nodes.new(type='ShaderNodeTexCoord')
    sep_xyz = nodes.new(type='ShaderNodeSeparateXYZ')
    ramp = nodes.new(type='ShaderNodeValToRGB')

    ramp.color_ramp.elements[0].position = 0.15
    ramp.color_ramp.elements[0].color = bottom_color
    ramp.color_ramp.elements[1].position = 0.85
    ramp.color_ramp.elements[1].color = top_color

    links.new(tex_coord.outputs['Generated'], sep_xyz.inputs['Vector'])
    links.new(sep_xyz.outputs['Z'], ramp.inputs['Fac'])
    links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])

    set_principled_input(bsdf, ["Roughness"], 0.04)
    set_principled_input(bsdf, ["IOR"], 1.52)
    set_principled_input(bsdf, ["Transmission Weight", "Transmission"], 0.45)
    set_principled_input(bsdf, ["Alpha"], alpha)
    set_principled_input(bsdf, ["Coat Weight", "Clearcoat"], 0.8)
    return mat


def create_silicone_pad_material(name="MAT_Silicone_Pad"):
    """Silicone cristalino para as plaquetas nasais."""
    if name in bpy.data.materials:
        return bpy.data.materials[name]

    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    if hasattr(mat, "blend_method"):
        mat.blend_method = 'BLEND'
    bsdf = mat.node_tree.nodes.get("Principled BSDF")

    set_principled_input(bsdf, ["Base Color"], (0.96, 0.95, 0.92, 1.0))
    set_principled_input(bsdf, ["Roughness"], 0.18)
    set_principled_input(bsdf, ["Transmission Weight", "Transmission"], 0.75)
    set_principled_input(bsdf, ["Alpha"], 0.55)
    return mat


# ==============================================================================
# GERADORES GEOMÉTRICOS DE ALTA PRECISÃO (BMESH & CURVAS)
# ==============================================================================

def superellipse_lens_outline(width, height, n_exp=3.4, top_flatness=0.88,
                              aviator_drop=0.0, num_pts=64):
    """
    Gera pontos 2D (X, Z) de contorno de lente ótica anatômica:
    - Suporta formato navegador quadrado (n_exp=3.6), aviador gota ou retangular.
    """
    pts = []
    rx = width / 2.0
    rz = height / 2.0

    for i in range(num_pts):
        theta = (2.0 * math.pi * i) / num_pts
        ct = math.cos(theta)
        st = math.sin(theta)

        x = rx * (abs(ct) ** (2.0 / n_exp)) * (1.0 if ct >= 0 else -1.0)
        z = rz * (abs(st) ** (2.0 / n_exp)) * (1.0 if st >= 0 else -1.0)

        # Achata levemente a linha superior (sobrancelha reta)
        if z > 0:
            z *= top_flatness

        # Deformação anatômica estilo Navigator / Aviador (parte inferior externa mais caída)
        if z < 0 and aviator_drop != 0.0:
            z *= (1.0 + aviator_drop * (x / rx))

        pts.append((x, z))
    return pts


def create_lens_pair(name_prefix, center_x, center_z, width, height, thickness,
                     n_exp, top_flatness, aviator_drop, camber_radius,
                     material, collection):
    """
    Cria o par de lentes (Esquerda e Direita) com curvatura esférica frontal (base 4)
    e bisel chanfrado realista.
    """
    outline = superellipse_lens_outline(width, height, n_exp, top_flatness, aviator_drop, 64)
    objs = []

    for side_sign, side_suffix in [(-1.0, "L"), (1.0, "R")]:
        mesh = bpy.data.meshes.new(f"{name_prefix}_Lens_{side_suffix}")
        bm = bmesh.new()

        front_verts = []
        back_verts = []

        for (lx, lz) in outline:
            wx = side_sign * (center_x + lx)
            wz = center_z + lz
            # Curvatura óptica base (camber) ao longo de X e Z
            r2 = (lx * lx) + (lz * lz)
            sag = (r2 / (2.0 * camber_radius)) if camber_radius > 0 else 0.0
            wrap_y = (wx * wx) / (2.0 * 0.19)  # Curvatura panorâmica facial (wrap angle)

            y_front = -sag + wrap_y
            y_back = y_front + thickness

            front_verts.append(bm.verts.new((wx, y_front, wz)))
            back_verts.append(bm.verts.new((wx, y_back, wz)))

        bm.verts.ensure_lookup_table()

        # Faces frontal e traseira
        f_front = bm.faces.new(front_verts)
        f_back = bm.faces.new(list(reversed(back_verts)))

        # Borda lateral conectando frente e trás
        n = len(front_verts)
        for i in range(n):
            ni = (i + 1) % n
            bm.faces.new([front_verts[i], back_verts[i], back_verts[ni], front_verts[ni]])

        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(mesh)
        bm.free()

        for poly in mesh.polygons:
            poly.use_smooth = True

        obj = bpy.data.objects.new(f"{name_prefix}_Lens_{side_suffix}", mesh)
        obj.data.materials.append(material)
        link_to_collection(obj, collection)

        # Modificador Bevel sutil para reflexo de borda lapidada
        bev = obj.modifiers.new(name="Bevel", type='BEVEL')
        bev.width = 0.00035
        bev.segments = 2
        bev.limit_method = 'ANGLE'

        objs.append(obj)

    return objs


def create_acetate_rim_pair(name_prefix, center_x, center_z, width, height,
                            rim_width_inner, rim_width_outer, rim_depth,
                            n_exp, top_flatness, aviator_drop,
                            material, collection, bridge_style="none"):
    """
    Cria o aro frontal de acetato esculpido ao redor das lentes, além da ponte
    central integrada quando aplicável (Modelos 2 e 4).
    """
    inner_pts = superellipse_lens_outline(width, height, n_exp, top_flatness, aviator_drop, 64)
    objs = []

    for side_sign, side_suffix in [(-1.0, "L"), (1.0, "R")]:
        mesh = bpy.data.meshes.new(f"{name_prefix}_Rim_{side_suffix}")
        bm = bmesh.new()

        ring_in_f, ring_in_b = [], []
        ring_out_f, ring_out_b = [], []

        for (lx, lz) in inner_pts:
            # Espessura variável do aro (mais encorpado nas têmporas e topo)
            angle = math.atan2(lz, lx)
            radial_w = rim_width_inner + (rim_width_outer - rim_width_inner) * (0.5 + 0.5 * math.sin(angle) ** 2)

            dist = math.sqrt(lx * lx + lz * lz)
            nx = lx / dist if dist > 1e-6 else 0.0
            nz = lz / dist if dist > 1e-6 else 0.0

            ox = lx + nx * radial_w
            oz = lz + nz * radial_w

            wx_in = side_sign * (center_x + lx)
            wz_in = center_z + lz
            wx_out = side_sign * (center_x + ox)
            wz_out = center_z + oz

            wrap_in = (wx_in * wx_in) / (2.0 * 0.19)
            wrap_out = (wx_out * wx_out) / (2.0 * 0.19)

            y_f = -rim_depth * 0.45
            y_b = rim_depth * 0.55

            ring_in_f.append(bm.verts.new((wx_in, y_f + wrap_in, wz_in)))
            ring_in_b.append(bm.verts.new((wx_in, y_b + wrap_in, wz_in)))
            ring_out_f.append(bm.verts.new((wx_out, y_f + wrap_out, wz_out)))
            ring_out_b.append(bm.verts.new((wx_out, y_b + wrap_out, wz_out)))

        n = len(inner_pts)
        for i in range(n):
            ni = (i + 1) % n
            # Frente, Trás, Interior, Exterior
            bm.faces.new([ring_in_f[i], ring_out_f[i], ring_out_f[ni], ring_in_f[ni]])
            bm.faces.new([ring_out_b[i], ring_in_b[i], ring_in_b[ni], ring_out_b[ni]])
            bm.faces.new([ring_in_b[i], ring_in_f[i], ring_in_f[ni], ring_in_b[ni]])
            bm.faces.new([ring_out_f[i], ring_out_b[i], ring_out_b[ni], ring_out_f[ni]])

        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(mesh)
        bm.free()

        for poly in mesh.polygons:
            poly.use_smooth = True

        obj = bpy.data.objects.new(f"{name_prefix}_Rim_{side_suffix}", mesh)
        obj.data.materials.append(material)
        link_to_collection(obj, collection)

        bev = obj.modifiers.new(name="Bevel", type='BEVEL')
        bev.width = min(rim_width_inner, rim_depth) * 0.28
        bev.segments = 3
        bev.limit_method = 'ANGLE'

        objs.append(obj)

    # Ponte em acetato (se solicitada)
    if bridge_style in ("double_acetate", "single_bold"):
        bridge_span = (center_x - width / 2.0) * 2.0 + 0.004
        # Barra principal da ponte
        bpy.ops.mesh.primitive_cube_add(
            size=1.0,
            location=(0.0, 0.0, center_z + height * 0.16)
        )
        br = bpy.context.active_object
        br.name = f"{name_prefix}_Acetate_Bridge_Main"
        br.scale = (bridge_span * 0.55, rim_depth * 0.48, rim_width_outer * 0.65)
        bpy.ops.object.transform_apply(scale=True)
        br.data.materials.append(material)
        bev = br.modifiers.new("Bevel", 'BEVEL')
        bev.width = 0.0009
        bev.segments = 3
        link_to_collection(br, collection)
        objs.append(br)

        if bridge_style == "double_acetate":
            # Barra superior aviador (brow bar em acetato do Modelo 2)
            bpy.ops.mesh.primitive_cube_add(
                size=1.0,
                location=(0.0, -0.0004, center_z + height * 0.44)
            )
            top_br = bpy.context.active_object
            top_br.name = f"{name_prefix}_Acetate_Bridge_Top"
            top_br.scale = (bridge_span * 0.95, rim_depth * 0.46, rim_width_outer * 0.58)
            bpy.ops.object.transform_apply(scale=True)
            top_br.data.materials.append(material)
            bev2 = top_br.modifiers.new("Bevel", 'BEVEL')
            bev2.width = 0.0009
            bev2.segments = 3
            link_to_collection(top_br, collection)
            objs.append(top_br)

    return objs


def create_curve_tube(name, points_3d, bevel_radius, material, collection,
                      resolution_u=24, bevel_resolution=6, extrude=0.0):
    """Cria um tubo metálico suave 3D a partir de uma lista de coordenadas."""
    curve_data = bpy.data.curves.new(name=name, type='CURVE')
    curve_data.dimensions = '3D'
    curve_data.resolution_u = resolution_u
    curve_data.bevel_depth = bevel_radius
    curve_data.bevel_resolution = bevel_resolution
    curve_data.extrude = extrude
    curve_data.use_fill_caps = True

    spline = curve_data.splines.new(type='CATMULL_ROM' if hasattr(curve_data.splines, 'CATMULL_ROM') else 'NURBS')
    spline.points.add(len(points_3d) - 1)
    for idx, pt in enumerate(points_3d):
        spline.points[idx].co = (pt[0], pt[1], pt[2], 1.0)
    spline.use_endpoint_u = True

    obj = bpy.data.objects.new(name, curve_data)
    obj.data.materials.append(material)
    link_to_collection(obj, collection)
    return obj


def create_nose_pads(name_prefix, bridge_half_x, center_z, gold_mat, pad_mat, collection):
    """
    Cria o par de plaquetas nasais translúcidas com núcleo dourado e braço
    metálico curvo em "S" (idêntico ao zoom circular 3 da 1ª imagem).
    """
    for side_sign, suffix in [(-1.0, "L"), (1.0, "R")]:
        # Braço em "S" dourado
        arm_pts = [
            (side_sign * bridge_half_x, 0.0015, center_z + 0.003),
            (side_sign * (bridge_half_x + 0.0012), 0.0045, center_z + 0.001),
            (side_sign * (bridge_half_x - 0.0015), 0.0068, center_z - 0.0035),
        ]
        create_curve_tube(
            f"{name_prefix}_NoseArm_{suffix}",
            arm_pts,
            bevel_radius=0.00055,
            material=gold_mat,
            collection=collection
        )

        # Plaqueta oval de silicone
        pad_pos = (side_sign * (bridge_half_x - 0.0018), 0.0078, center_z - 0.0045)
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=24, ring_count=16, radius=1.0, location=pad_pos
        )
        pad = bpy.context.active_object
        pad.name = f"{name_prefix}_NosePad_{suffix}"
        pad.scale = (0.0028, 0.0012, 0.0062)
        pad.rotation_euler = Euler((math.radians(16), side_sign * math.radians(24), math.radians(-10 * side_sign)), 'XYZ')
        bpy.ops.object.transform_apply(scale=True)
        for poly in pad.data.polygons:
            poly.use_smooth = True
        pad.data.materials.append(pad_mat)
        link_to_collection(pad, collection)

        # Núcleo metálico dourado interno visível dentro do silicone
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=16, ring_count=12, radius=1.0, location=pad_pos
        )
        core = bpy.context.active_object
        core.name = f"{name_prefix}_NosePadCore_{suffix}"
        core.scale = (0.0015, 0.0008, 0.0032)
        core.rotation_euler = pad.rotation_euler.copy()
        bpy.ops.object.transform_apply(scale=True)
        core.data.materials.append(gold_mat)
        link_to_collection(core, collection)


def create_sculpted_lion_emblem(name_prefix, hinge_x, hinge_y, hinge_z,
                                gold_mat, collection):
    """
    Cria o medalhão/escultura 3D da cabeça de leão dourada em alto-relevo nas
    dobradiças laterais (conforme o 1º close-up circular da 1ª imagem).
    """
    for side_sign, suffix in [(-1.0, "L"), (1.0, "R")]:
        mesh = bpy.data.meshes.new(f"{name_prefix}_LionSculpt_{suffix}")
        bm = bmesh.new()

        # Esfera base de alta resolução para escultura procedural da juba e face
        bmesh.ops.create_uvsphere(bm, u_segments=36, v_segments=28, radius=0.0048)

        for v in bm.verts:
            x, y, z = v.co.x, v.co.y, v.co.z
            r = v.co.length
            if r < 1e-6:
                continue
            theta = math.atan2(z, y)  # Ângulo ao redor da face lateral
            rad_yz = math.sqrt(y * y + z * z)

            # Ondulações radiais da juba (12 mechas esculpidas em relevo)
            mane_wave = 0.00075 * math.cos(12.0 * theta) + 0.00035 * math.sin(6.0 * theta)
            if rad_yz > 0.0022:
                v.co.x *= (1.0 + mane_wave * 110.0)
                v.co.y *= (1.0 + mane_wave * 85.0)
                v.co.z *= (1.0 + mane_wave * 85.0)

            # Projeção do focinho, sobrancelhas e mandíbula rugindo na face externa
            if (side_sign * x) > 0.001:
                # Focinho central
                if abs(y) < 0.0022 and abs(z) < 0.0020:
                    v.co.x += side_sign * 0.0014
                # Arcadas superciliares
                if z > 0.0012 and abs(y) < 0.0028:
                    v.co.x += side_sign * 0.0008

        bm.to_mesh(mesh)
        bm.free()

        for poly in mesh.polygons:
            poly.use_smooth = True

        lion = bpy.data.objects.new(f"{name_prefix}_LionHead_{suffix}", mesh)
        lion.location = (side_sign * hinge_x, hinge_y + 0.0032, hinge_z)
        lion.scale = (0.72, 1.15, 0.95)
        bpy.ops.object.select_all(action='DESELECT')
        lion.select_set(True)
        bpy.context.view_layer.objects.active = lion
        bpy.ops.object.transform_apply(scale=True)
        lion.data.materials.append(gold_mat)
        link_to_collection(lion, collection)


def create_panther_emblem(name_prefix, hinge_x, hinge_y, hinge_z,
                          gold_mat, enamel_mat, collection):
    """
    Cria a cabeça e pescoço alongado de pantera/leopardo dourada com manchas
    pretas esmaltadas que morde a lente rimless (Modelo 3 — 2ª imagem, linha 2).
    """
    for side_sign, suffix in [(-1.0, "L"), (1.0, "R")]:
        # Cabeça alongada aerodinâmica da pantera sobre a lente
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=28, ring_count=20, radius=1.0,
            location=(side_sign * (hinge_x - 0.0035), hinge_y - 0.0005, hinge_z)
        )
        head = bpy.context.active_object
        head.name = f"{name_prefix}_PantherHead_{suffix}"
        head.scale = (0.0068, 0.0032, 0.0034)
        bpy.ops.object.transform_apply(scale=True)
        for poly in head.data.polygons:
            poly.use_smooth = True
        head.data.materials.append(gold_mat)
        link_to_collection(head, collection)

        # Orelhas felinas esculpidas para trás
        for ear_z in [-0.0018, 0.0018]:
            bpy.ops.mesh.primitive_cone_add(
                vertices=16, radius1=0.0013, radius2=0.0002, depth=0.0028,
                location=(side_sign * (hinge_x - 0.0005), hinge_y + 0.001, hinge_z + ear_z)
            )
            ear = bpy.context.active_object
            ear.name = f"{name_prefix}_PantherEar_{suffix}"
            ear.rotation_euler = Euler((math.radians(70), 0, side_sign * math.radians(-35)), 'XYZ')
            ear.data.materials.append(gold_mat)
            link_to_collection(ear, collection)

        # Manchas esmaltadas pretas (olhos e pintas de leopardo)
        spot_offsets = [
            (-0.0045, -0.0022, 0.0011, 0.00095),
            (-0.0045, -0.0022, -0.0011, 0.00095),
            (-0.0018, -0.0020, 0.0014, 0.00085),
            (-0.0018, -0.0020, -0.0014, 0.00085),
            (0.0008,  0.0025, 0.0008, 0.00090),
            (0.0008,  0.0055, -0.0006, 0.00085),
            (0.0008,  0.0085, 0.0005, 0.00080),
        ]
        for idx, (dx, dy, dz, rad) in enumerate(spot_offsets):
            bpy.ops.mesh.primitive_uv_sphere_add(
                segments=14, ring_count=10, radius=rad,
                location=(side_sign * (hinge_x + dx), hinge_y + dy, hinge_z + dz)
            )
            spot = bpy.context.active_object
            spot.name = f"{name_prefix}_PantherSpot_{suffix}_{idx}"
            spot.data.materials.append(enamel_mat)
            link_to_collection(spot, collection)


def create_temple_pair(name_prefix, hinge_x, hinge_y, hinge_z, temple_length,
                       style, metal_mat, tip_mat, collection):
    """
    Cria o par de hastes laterais (Esquerda e Direita) com a curvatura exata
    das vistas Lateral Esquerda, Lateral Direita e Superior.
    Estilos:
      - 'metal_plus_tip': haste dourada reta + ponteira em acetato curvada (Modelos 1 e 3)
      - 'full_acetate_slim': haste inteiriça em acetato preto (Modelo 2)
      - 'full_acetate_bold': haste larga em acetato tartaruga com emblema dourado (Modelo 4)
    """
    for side_sign, suffix in [(-1.0, "L"), (1.0, "R")]:
        x0 = side_sign * hinge_x

        if style == "metal_plus_tip":
            # Segmento frontal em ouro polido (da charneira até metade da haste)
            metal_end_y = hinge_y + temple_length * 0.44
            metal_pts = [
                (x0, hinge_y, hinge_z),
                (x0 + side_sign * 0.0012, hinge_y + temple_length * 0.22, hinge_z),
                (x0 + side_sign * 0.0005, metal_end_y, hinge_z),
            ]
            create_curve_tube(
                f"{name_prefix}_TempleMetal_{suffix}",
                metal_pts,
                bevel_radius=0.0014,
                extrude=0.0006,
                material=metal_mat,
                collection=collection
            )

            # Ponteira anatômica em acetato (de 42% até 100%, curvando atrás da orelha e para dentro)
            tip_pts = [
                (x0 + side_sign * 0.0005, metal_end_y - 0.002, hinge_z),
                (x0 - side_sign * 0.0010, hinge_y + temple_length * 0.68, hinge_z - 0.0005),
                (x0 - side_sign * 0.0045, hinge_y + temple_length * 0.84, hinge_z - 0.0075),
                (x0 - side_sign * 0.0105, hinge_y + temple_length * 0.96, hinge_z - 0.0210),
                (x0 - side_sign * 0.0135, hinge_y + temple_length * 1.01, hinge_z - 0.0255),
            ]
            create_curve_tube(
                f"{name_prefix}_TempleTip_{suffix}",
                tip_pts,
                bevel_radius=0.0021,
                extrude=0.0012,
                material=tip_mat,
                collection=collection
            )

        elif style in ("full_acetate_slim", "full_acetate_bold"):
            is_bold = (style == "full_acetate_bold")
            full_pts = [
                (x0, hinge_y, hinge_z),
                (x0 + side_sign * 0.0010, hinge_y + temple_length * 0.35, hinge_z),
                (x0 - side_sign * 0.0015, hinge_y + temple_length * 0.70, hinge_z - 0.0010),
                (x0 - side_sign * 0.0065, hinge_y + temple_length * 0.88, hinge_z - 0.0105),
                (x0 - side_sign * 0.0135, hinge_y + temple_length * 1.00, hinge_z - 0.0240),
            ]
            create_curve_tube(
                f"{name_prefix}_TempleAcetate_{suffix}",
                full_pts,
                bevel_radius=0.0022 if is_bold else 0.0018,
                extrude=0.0036 if is_bold else 0.0016,
                material=tip_mat,
                collection=collection
            )


# ==============================================================================
# CONSTRUTORES DOS 4 MODELOS DE ÓCULOS
# ==============================================================================

def build_model_01_imperial_leao(parent_col, offset_pos=(0.0, 0.0, 0.0)):
    """
    MODELO 1 (1ª Imagem): Navegador Imperial Tartaruga & Leão Dourado
    - Vistas Frontal, Traseira, Lateral Esquerda/Direita, Superior, Inferior + 4 Close-ups
    """
    col = get_or_create_collection("01_Imperial_Leao", parent_col)

    gold_mat = create_gold_material()
    tort_dark = create_tortoise_material("MAT_Tortoise_Dark", dark_mode=True)
    lens_mat = create_lens_material(
        "MAT_Lens_Brown_Gradient",
        top_color=(0.16, 0.07, 0.03, 1.0),
        bottom_color=(0.48, 0.29, 0.18, 1.0),
        alpha=0.76
    )
    pad_mat = create_silicone_pad_material()

    cx = 0.0355   # Centro X de cada lente (35.5 mm)
    cz = 0.0      # Centro Z
    lw = 0.055    # Largura da lente (55 mm)
    lh = 0.043    # Altura da lente (43 mm)

    # 1. Par de Lentes degradê marrom
    create_lens_pair(
        "M01", cx, cz, lw, lh, thickness=0.0022,
        n_exp=3.7, top_flatness=0.90, aviator_drop=0.06,
        camber_radius=0.14, material=lens_mat, collection=col
    )

    # 2. Aro de Acetato Tartaruga Escuro
    create_acetate_rim_pair(
        "M01", cx, cz, lw, lh,
        rim_width_inner=0.0032, rim_width_outer=0.0048, rim_depth=0.0046,
        n_exp=3.7, top_flatness=0.90, aviator_drop=0.06,
        material=tort_dark, collection=col, bridge_style="none"
    )

    # 3. Ponte Dupla Metálica Dourada + Brow Bar superior (Close-up 2 da 1ª imagem)
    top_bar_pts = [
        (-cx - 0.006, -0.0024, cz + lh * 0.49),
        (-0.012,      -0.0028, cz + lh * 0.50),
        (0.0,         -0.0029, cz + lh * 0.50),
        (0.012,       -0.0028, cz + lh * 0.50),
        (cx + 0.006,  -0.0024, cz + lh * 0.49),
    ]
    create_curve_tube("M01_TopBrowBar_Gold", top_bar_pts, 0.0011, gold_mat, col)

    lower_bridge_pts = [
        (-0.0095, -0.0018, cz + 0.0075),
        (-0.0045, -0.0026, cz + 0.0092),
        (0.0,     -0.0028, cz + 0.0095),
        (0.0045,  -0.0026, cz + 0.0092),
        (0.0095,  -0.0018, cz + 0.0075),
    ]
    create_curve_tube("M01_LowerBridge_Gold", lower_bridge_pts, 0.0012, gold_mat, col)

    # 4. Rebites Dourados Duplos nos cantos superiores externos (Close-up 4 da 1ª imagem)
    for side_sign, suffix in [(-1.0, "L"), (1.0, "R")]:
        rivet_coords = [
            (side_sign * (cx + lw * 0.46), -0.0024, cz + lh * 0.36),
            (side_sign * (cx + lw * 0.51), -0.0022, cz + lh * 0.25),
        ]
        for idx, rpos in enumerate(rivet_coords):
            bpy.ops.mesh.primitive_cylinder_add(
                vertices=20, radius=0.0011, depth=0.0014,
                location=rpos, rotation=(math.radians(90), 0, 0)
            )
            riv = bpy.context.active_object
            riv.name = f"M01_GoldRivet_{suffix}_{idx}"
            riv.data.materials.append(gold_mat)
            link_to_collection(riv, col)

    # 5. Plaquetas Nasais com Braço em S (Close-up 3 da 1ª imagem)
    create_nose_pads("M01", bridge_half_x=0.0092, center_z=cz,
                     gold_mat=gold_mat, pad_mat=pad_mat, collection=col)

    # 6. Escultura 3D da Cabeça de Leão Dourada nas Dobradiças (Close-up 1 da 1ª imagem)
    hinge_x = cx + lw * 0.5 + 0.0042
    create_sculpted_lion_emblem("M01", hinge_x, hinge_y=0.001, hinge_z=cz + 0.005,
                                gold_mat=gold_mat, collection=col)

    # 7. Hastes Douradas com Ponteiras Tartaruga
    create_temple_pair("M01", hinge_x, hinge_y=0.004, hinge_z=cz + 0.005,
                       temple_length=0.142, style="metal_plus_tip",
                       metal_mat=gold_mat, tip_mat=tort_dark, collection=col)

    # Aplica offset da vitrine
    for obj in col.objects:
        obj.location.x += offset_pos[0]
        obj.location.y += offset_pos[1]
        obj.location.z += offset_pos[2]

    return col


def build_model_02_navigator_ambar(parent_col, offset_pos=(0.0, 0.0, 0.0)):
    """
    MODELO 2 (2ª Imagem — Linha 1): Aviador / Navigator Preto com Lentes Laranja Âmbar
    """
    col = get_or_create_collection("02_Navigator_Ambar", parent_col)

    gold_mat = create_gold_material()
    black_mat = create_black_enamel_material("MAT_Acetate_Black_Gloss")
    lens_amber = create_lens_material(
        "MAT_Lens_Orange_Amber",
        top_color=(0.88, 0.36, 0.08, 1.0),
        bottom_color=(0.94, 0.48, 0.14, 1.0),
        alpha=0.68
    )

    cx = 0.036
    cz = 0.0
    lw = 0.056
    lh = 0.046

    # 1. Lentes Laranja Âmbar
    create_lens_pair(
        "M02", cx, cz, lw, lh, thickness=0.0022,
        n_exp=3.5, top_flatness=0.92, aviator_drop=0.10,
        camber_radius=0.15, material=lens_amber, collection=col
    )

    # 2. Aro Frontal e Ponte Dupla em Acetato Preto Brilhante
    create_acetate_rim_pair(
        "M02", cx, cz, lw, lh,
        rim_width_inner=0.0042, rim_width_outer=0.0056, rim_depth=0.0052,
        n_exp=3.5, top_flatness=0.92, aviator_drop=0.10,
        material=black_mat, collection=col, bridge_style="double_acetate"
    )

    # 3. Grampos Metálicos Dourados em "T" nas Dobradiças Frontais/Laterais
    hinge_x = cx + lw * 0.5 + 0.0048
    for side_sign, suffix in [(-1.0, "L"), (1.0, "R")]:
        bpy.ops.mesh.primitive_cube_add(
            size=1.0,
            location=(side_sign * hinge_x, 0.001, cz + 0.008)
        )
        t_bar = bpy.context.active_object
        t_bar.name = f"M02_GoldTAccent_{suffix}"
        t_bar.scale = (0.0025, 0.0045, 0.0016)
        bpy.ops.object.transform_apply(scale=True)
        t_bar.data.materials.append(gold_mat)
        link_to_collection(t_bar, col)

    # 4. Hastes em Acetato Preto
    create_temple_pair("M02", hinge_x, hinge_y=0.002, hinge_z=cz + 0.008,
                       temple_length=0.144, style="full_acetate_slim",
                       metal_mat=gold_mat, tip_mat=black_mat, collection=col)

    for obj in col.objects:
        obj.location.x += offset_pos[0]
        obj.location.y += offset_pos[1]
        obj.location.z += offset_pos[2]

    return col


def build_model_03_rimless_pantera(parent_col, offset_pos=(0.0, 0.0, 0.0)):
    """
    MODELO 3 (2ª Imagem — Linha 2): Rimless (Sem Aro) Degradê com Pantera Dourada Pintada
    """
    col = get_or_create_collection("03_Rimless_Pantera", parent_col)

    gold_mat = create_gold_material()
    enamel_mat = create_black_enamel_material("MAT_Panther_Enamel_Spots")
    tort_tip = create_tortoise_material("MAT_Tortoise_Tips", dark_mode=True)
    pad_mat = create_silicone_pad_material()
    lens_tea = create_lens_material(
        "MAT_Lens_Tea_Fade",
        top_color=(0.24, 0.11, 0.05, 1.0),
        bottom_color=(0.92, 0.82, 0.72, 1.0),
        alpha=0.64
    )

    cx = 0.0355
    cz = 0.0
    lw = 0.056
    lh = 0.045

    # 1. Lentes Rimless recortadas com bisel aparente (sem aro ao redor)
    create_lens_pair(
        "M03", cx, cz, lw, lh, thickness=0.0028,
        n_exp=3.8, top_flatness=0.90, aviator_drop=0.04,
        camber_radius=0.14, material=lens_tea, collection=col
    )

    # 2. Ponte Central Rimless em Ouro Polido com Parafusos de Fixação na Lente
    bridge_pts = [
        (-0.0115, -0.0020, cz + 0.006),
        (-0.0050, -0.0032, cz + 0.008),
        (0.0,     -0.0035, cz + 0.0085),
        (0.0050,  -0.0032, cz + 0.008),
        (0.0115,  -0.0020, cz + 0.006),
    ]
    create_curve_tube("M03_RimlessBridge_Gold", bridge_pts, 0.0011, gold_mat, col)

    # 3. Plaquetas Nasais
    create_nose_pads("M03", bridge_half_x=0.0088, center_z=cz,
                     gold_mat=gold_mat, pad_mat=pad_mat, collection=col)

    # 4. Escultura da Pantera Dourada com Manchas Pretas mordendo a lateral da lente
    hinge_x = cx + lw * 0.5
    create_panther_emblem("M03", hinge_x, hinge_y=0.0, hinge_z=cz + 0.005,
                          gold_mat=gold_mat, enamel_mat=enamel_mat, collection=col)

    # 5. Hastes Finas Douradas com Ponteiras Tartaruga
    create_temple_pair("M03", hinge_x + 0.002, hinge_y=0.006, hinge_z=cz + 0.005,
                       temple_length=0.140, style="metal_plus_tip",
                       metal_mat=gold_mat, tip_mat=tort_tip, collection=col)

    for obj in col.objects:
        obj.location.x += offset_pos[0]
        obj.location.y += offset_pos[1]
        obj.location.z += offset_pos[2]

    return col


def build_model_04_bold_tartaruga(parent_col, offset_pos=(0.0, 0.0, 0.0)):
    """
    MODELO 4 (2ª Imagem — Linha 3): Retangular Bold em Acetato Tartaruga Clássico
    """
    col = get_or_create_collection("04_Bold_Tartaruga", parent_col)

    gold_mat = create_gold_material()
    tort_classic = create_tortoise_material("MAT_Tortoise_Classic", dark_mode=False)
    lens_dark_brown = create_lens_material(
        "MAT_Lens_Solid_Coffee",
        top_color=(0.14, 0.07, 0.03, 1.0),
        bottom_color=(0.20, 0.10, 0.05, 1.0),
        alpha=0.82
    )

    cx = 0.035
    cz = 0.0
    lw = 0.052
    lh = 0.036  # Silhueta retangular mais baixa e alongada (conforme 3ª linha da 2ª foto)

    # 1. Lentes Marrom Café
    create_lens_pair(
        "M04", cx, cz, lw, lh, thickness=0.0024,
        n_exp=4.2, top_flatness=0.95, aviator_drop=0.0,
        camber_radius=0.16, material=lens_dark_brown, collection=col
    )

    # 2. Aro Espesso Retangular Bold em Acetato Tartaruga + Ponte Única Esculpida
    create_acetate_rim_pair(
        "M04", cx, cz, lw, lh,
        rim_width_inner=0.0052, rim_width_outer=0.0068, rim_depth=0.0060,
        n_exp=4.2, top_flatness=0.95, aviator_drop=0.0,
        material=tort_classic, collection=col, bridge_style="single_bold"
    )

    # 3. Emblema Dourado Duplo nas Têmporas (Hastes Largas)
    hinge_x = cx + lw * 0.5 + 0.0058
    for side_sign, suffix in [(-1.0, "L"), (1.0, "R")]:
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=24, radius=0.0018, depth=0.0012,
            location=(side_sign * (hinge_x + 0.0008), 0.012, cz + 0.002),
            rotation=(0, math.radians(90), 0)
        )
        badge = bpy.context.active_object
        badge.name = f"M04_TempleGoldBadge_{suffix}"
        badge.scale = (1.0, 1.6, 1.0)
        bpy.ops.object.transform_apply(scale=True)
        badge.data.materials.append(gold_mat)
        link_to_collection(badge, col)

    # 4. Hastes Largas Bold em Acetato Tartaruga
    create_temple_pair("M04", hinge_x, hinge_y=0.002, hinge_z=cz + 0.002,
                       temple_length=0.142, style="full_acetate_bold",
                       metal_mat=gold_mat, tip_mat=tort_classic, collection=col)

    for obj in col.objects:
        obj.location.x += offset_pos[0]
        obj.location.y += offset_pos[1]
        obj.location.z += offset_pos[2]

    return col


# ==============================================================================
# ESTÚDIO DE ILUMINAÇÃO, CÂMERAS ORTOGRÁFICAS E EXPORTAÇÃO GLB
# ==============================================================================

def setup_studio_lighting_and_cameras(root_col):
    """
    Cria iluminação de estúdio fotográfico (Key, Rim, Fill) e câmeras posicionadas
    para renderizar a vitrine dos 4 modelos.
    """
    studio_col = get_or_create_collection("00_Studio_Setup", root_col)

    # Fundo branco/creme infinito suave no World Shader
    world = bpy.context.scene.world
    if not world:
        world = bpy.data.worlds.new("StudioWorld")
        bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.96, 0.95, 0.93, 1.0)
        bg.inputs[1].default_value = 1.1

    # Key Light Superior (Softbox de reflexo nas lentes)
    bpy.ops.object.light_add(type='AREA', location=(0.0, -0.35, 0.35))
    key_light = bpy.context.active_object
    key_light.name = "Studio_Key_Softbox"
    key_light.data.energy = 18.0
    key_light.data.size = 0.65
    key_light.rotation_euler = Euler((math.radians(48), 0, 0), 'XYZ')
    link_to_collection(key_light, studio_col)

    # Rim Light Dourada para destacar as esculturas de Leão e Pantera
    bpy.ops.object.light_add(type='AREA', location=(0.28, 0.25, 0.22))
    rim_light = bpy.context.active_object
    rim_light.name = "Studio_Rim_Warm"
    rim_light.data.energy = 12.0
    rim_light.data.color = (1.0, 0.92, 0.80)
    rim_light.rotation_euler = Euler((math.radians(-120), math.radians(30), 0), 'XYZ')
    link_to_collection(rim_light, studio_col)

    # Câmera Principal enquadrando os 4 óculos lado a lado
    bpy.ops.object.camera_add(
        location=(0.0, -0.58, 0.14),
        rotation=(math.radians(78), 0, 0)
    )
    cam = bpy.context.active_object
    cam.name = "Camera_Showcase_4_Models"
    cam.data.lens = 65.0
    bpy.context.scene.camera = cam
    link_to_collection(cam, studio_col)


def export_individual_glbs(collections_map, output_dir):
    """
    Se desejar exportar automaticamente cada coleção para .glb ao rodar no Blender.
    """
    if not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)

    for slug, col in collections_map.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in col.objects:
            obj.select_set(True)

        glb_path = os.path.join(output_dir, f"{slug}.glb")
        try:
            bpy.ops.export_scene.gltf(
                filepath=glb_path,
                use_selection=True,
                export_format='GLB',
                export_apply=True
            )
            print(f"[OK] Exportado: {glb_path}")
        except Exception as exc:
            print(f"[Aviso] Exportação GLTF ignorada para {slug}: {exc}")


# ==============================================================================
# EXECUÇÃO PRINCIPAL
# ==============================================================================

def main():
    print("=" * 72)
    print("Iniciando geração dos 4 óculos Encantadas no Blender (bpy)...")
    clear_scene()

    root_col = get_or_create_collection("Encantadas_Eyewear_Collection")

    # Posicionamento em grid 2x2 no Viewport para fácil inspeção ou exportação individual
    c1 = build_model_01_imperial_leao(root_col, offset_pos=(-0.11, 0.0,  0.055))
    c2 = build_model_02_navigator_ambar(root_col, offset_pos=( 0.11, 0.0,  0.055))
    c3 = build_model_03_rimless_pantera(root_col, offset_pos=(-0.11, 0.0, -0.055))
    c4 = build_model_04_bold_tartaruga(root_col, offset_pos=( 0.11, 0.0, -0.055))

    setup_studio_lighting_and_cameras(root_col)

    # Salva automaticamente um arquivo .blend na pasta blender/ se executado via CLI
    script_dir = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.getcwd()
    blend_out = os.path.join(script_dir, "encantadas_4_oculos.blend")
    try:
        bpy.ops.wm.save_as_mainfile(filepath=blend_out)
        print(f"[OK] Arquivo Blender salvo em: {blend_out}")
    except Exception as exc:
        print(f"[Info] Cena gerada na memória do Blender ({exc})")

    print("Concluído com sucesso! 4 modelos gerados na coleção 'Encantadas_Eyewear_Collection'.")
    print("=" * 72)


if __name__ == "__main__":
    main()
