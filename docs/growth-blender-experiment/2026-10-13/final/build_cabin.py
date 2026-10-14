"""Original structured cabin. Run with Blender --background --python build_cabin.py -- ..."""
import argparse
import hashlib
import json
import math
import sys
import time
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view


HERE = Path(__file__).resolve().parent


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, default=HERE / "cabin-config.json")
    parser.add_argument("--output", type=Path, default=HERE / "output")
    parser.add_argument("--variant", choices=["terracotta", "deep-blue"], default="terracotta")
    parser.add_argument("--load", type=Path, help="Reopen an existing .blend; do not rebuild geometry")
    parser.add_argument("--model-preview", action="store_true")
    parser.add_argument("--roof-mask", action="store_true")
    parser.add_argument("--engine", choices=["CYCLES", "BLENDER_EEVEE_NEXT"], default=None)
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])


def linear(hex_color):
    values = [int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in values)


def set_color(material, color):
    rgb = linear(color)
    material.diffuse_color = (*rgb, 1)
    material.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value = (*rgb, 1)
    material.node_tree.nodes.get("Principled BSDF").inputs["Emission Color"].default_value = (*rgb, 1)
    material["source_hex"] = color


def material(name, color, glow=.18):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    set_color(m, color)
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = 1
    bsdf.inputs["Specular IOR Level"].default_value = 0
    bsdf.inputs["Emission Color"].default_value = (*linear(color), 1)
    bsdf.inputs["Emission Strength"].default_value = glow
    return m


class Builder:
    def __init__(self, config):
        self.c = config
        self.root = bpy.data.collections.new("Building")
        bpy.context.scene.collection.children.link(self.root)
        self.groups = {}
        for name in ["Foundation", "Walls", "Roof", "Door", "Windows", "Chimney", "Decorations"]:
            group = bpy.data.collections.new(name)
            self.root.children.link(group)
            self.groups[name] = group
        self.parent = bpy.data.objects.new("Building_ROOT", None)
        self.root.objects.link(self.parent)
        self.parent["original_design"] = "Hearth cabin, scripted for Mingrifu; no external assets"
        self.parent["footprint_cells"] = [3, 2]
        self.parent["sprite_anchor"] = self.c["game"]["anchor"]
        self.m = {}
        for key, value in config["materials"].items():
            colors = value if isinstance(value, list) else [value]
            self.m[key] = [material("Mat_" + key + "_" + str(i), color,
                                    .30 if key.startswith("glass") else config["lighting"].get("materialAmbientEmission", .18))
                           for i, color in enumerate(colors)]
        self.m["roof"] = [material("Roof_Color_" + str(i), c)
                          for i, c in enumerate(config["roofVariants"]["terracotta"])]

    def finish(self, obj, group, mat, bevel=0):
        for collection in list(obj.users_collection):
            collection.objects.unlink(obj)
        self.groups[group].objects.link(obj)
        obj.parent = self.parent
        obj["semantic_part"] = group
        obj.pass_index = 3 if group == "Roof" else 1
        if mat is not None:
            obj.data.materials.append(mat)
        if bevel:
            mod = obj.modifiers.new("Crafted small edge", "BEVEL")
            mod.width = bevel
            mod.segments = 1
            mod.affect = "EDGES"
        return obj

    def box(self, name, location, dimensions, group, mat, bevel=0):
        bpy.ops.mesh.primitive_cube_add(size=1, location=location)
        obj = bpy.context.object
        obj.name = name
        obj.dimensions = dimensions
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        return self.finish(obj, group, mat, bevel)

    def mesh(self, name, vertices, faces, group, mat):
        data = bpy.data.meshes.new(name + "_mesh")
        data.from_pydata(vertices, [], faces)
        data.update()
        bm = bmesh.new()
        bm.from_mesh(data)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(data)
        bm.free()
        obj = bpy.data.objects.new(name, data)
        bpy.context.scene.collection.objects.link(obj)
        return self.finish(obj, group, mat)

    def beam(self, name, a, b, width, depth, group, mat):
        a, b = Vector(a), Vector(b)
        obj = self.box(name, (a + b) / 2, (width, depth, (b - a).length), group, mat, .006)
        obj.rotation_mode = "QUATERNION"
        obj.rotation_quaternion = (b - a).to_track_quat("Z", "Y")
        return obj

    def prism(self, name, front, thickness, group, mat):
        n = len(front)
        verts = list(front) + [(x, y + thickness, z) for x, y, z in front]
        faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))]
        faces += [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]
        return self.mesh(name, verts, faces, group, mat)

    def leaf(self, name, loc, scale, mat):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1, location=loc)
        obj = bpy.context.object
        obj.name = name
        obj.scale = scale
        return self.finish(obj, "Decorations", mat)

    def foundation(self):
        b = self.c["building"]
        self.box("Foundation_solid", (0, 0, .09), (2.62, 1.64, .18), "Foundation", self.m["stone"][0], .025)
        for row in range(2):
            for column in range(7):
                x = -1.13 + column * .377
                self.box("Stone_front_%d_%d" % (row, column), (x, -.832, .045 + row * .084),
                         (.365, .085, .081), "Foundation", self.m["stone"][(column + row) % 3], .012)
        self.box("Door_lower_step", (.20, -1.106, .038), (.86, .29, .075), "Foundation", self.m["stone"][1], .018)
        self.box("Door_upper_step", (.20, -.967, .103), (.72, .25, .091), "Foundation", self.m["stone"][2], .012)

    def walls(self):
        b = self.c["building"]
        low, top = b["foundationHeight"], b["wallTop"]
        self.box("Walls_closed_body", (0, 0, (low + top) / 2),
                 (b["width"], b["depth"], top - low), "Walls", self.m["wood"][0])
        rows = 11
        h = (top - low) / rows
        for row in range(rows):
            z = low + (row + .5) * h
            # Wide deliberate colour bands, not fine random noise.
            mat = self.m["wood"][[1, 1, 0, 1, 2, 1, 0, 1, 1, 2, 1][row]]
            self.box("Facade_board_%02d" % row, (0, -.775, z), (2.45, .068, h - .008), "Walls", mat, .004)
            for side in [-1, 1]:
                self.box("Side_board_%s_%02d" % (side, row), (side * 1.25, 0, z),
                         (.062, 1.50, h - .008), "Walls", self.m["wood"][0], .003)
        for x in [-1.15, 1.15]:
            self.box("Corner_timber_%s" % x, (x, -.834, .91), (.116, .119, 1.48), "Walls", self.m["timber"][0], .008)
            self.box("Corner_lit_edge_%s" % x, (x - .039, -.899, .91), (.035, .014, 1.48), "Walls", self.m["timberLight"][0])
        self.box("Sill_beam", (0, -.843, .205), (2.52, .12, .1), "Walls", self.m["timber"][0], .006)
        self.box("Eaves_support_beam", (0, -.825, top - .035), (2.61, .13, .11), "Walls", self.m["timber"][0], .005)
        # The filled gable is continuous with the wall and roof.
        y, peak, half = -.783, b["roofPeak"] - .075, 1.235
        self.prism("Front_gable_closed", [(-half, y, top), (half, y, top), (0, y, peak)], .12, "Walls", self.m["wood"][0])
        self.prism("Rear_gable_closed", [(-half, .71, top), (half, .71, top), (0, .71, peak)], .07, "Walls", self.m["wood"][0])
        z = top + .08
        row = 0
        while z < peak - .06:
            dz = min(.10, peak - .025 - z)
            lower = half * (peak - z) / (peak - top)
            upper = half * (peak - z - dz) / (peak - top)
            self.prism("Gable_board_%02d" % row,
                       [(-lower, -.81, z), (lower, -.81, z), (upper, -.81, z + dz), (-upper, -.81, z + dz)],
                       .02, "Walls", self.m["wood"][row % 3])
            z += .116
            row += 1

    def window(self, name, x, z, w=.42, h=.47, shutters=True):
        self.box(name + "_dark_recess", (x, -.832, z), (w + .085, .047, h + .085), "Windows", self.m["timber"][0])
        self.box(name + "_glass", (x, -.864, z), (w, .018, h), "Windows", self.m["glass"][0])
        self.box(name + "_upper_reflection", (x - w / 4, -.878, z + h / 4), (w / 2 - .025, .01, h / 2 - .025), "Windows", self.m["glassGlow"][0])
        for side in [-1, 1]:
            self.box(name + "_upright_%s" % side, (x + side * (w / 2 + .027), -.891, z),
                     (.055, .076, h + .11), "Windows", self.m["timberLight"][0], .004)
            self.box(name + "_horizontal_%s" % side, (x, -.899, z + side * (h / 2 + .027)),
                     (w + .11, .075, .055), "Windows", self.m["timberLight"][0], .004)
        self.box(name + "_mullion", (x, -.908, z), (.035, .025, h), "Windows", self.m["timber"][0])
        self.box(name + "_crossbar", (x, -.908, z - .005), (w, .025, .035), "Windows", self.m["timber"][0])
        self.box(name + "_sill", (x, -.917, z - h / 2 - .061), (w + .17, .15, .055), "Windows", self.m["timberLight"][0], .006)
        if shutters:
            for side in [-1, 1]:
                sx = x + side * (w / 2 + .15)
                self.box(name + "_shutter_%s" % side, (sx, -.89, z), (.135, .05, h + .08), "Windows", self.m["shutters"][0], .009)
                for slat in [-1, 0, 1]:
                    self.box(name + "_shutter_slat_%s_%s" % (side, slat), (sx, -.922, z + slat * .13),
                             (.133, .012, .03), "Windows", self.m["leaves"][0])

    def doors_windows(self):
        self.window("Window_left", -.69, 1.045, .40, .43)
        self.window("Window_right", .865, 1.045, .34, .43, False)
        self.window("Loft_window", -.05, 1.93, .235, .25, False)
        x = .20
        self.box("Door_dark_recess", (x, -.84, .675), (.52, .065, 1.01), "Door", self.m["timber"][0])
        self.box("Door_leaf", (x, -.883, .675), (.41, .03, .87), "Door", self.m["door"][0], .006)
        for i in range(3):
            self.box("Door_vertical_board_%d" % i, (x - .125 + i * .125, -.904, .675),
                     (.114, .018, .85), "Door", self.m["wood"][i % 2], .002)
        for side in [-1, 1]:
            self.box("Door_frame_%s" % side, (x + side * .253, -.91, .684), (.077, .13, 1.07), "Door", self.m["timberLight"][0], .005)
        self.box("Door_lintel", (x, -.918, 1.201), (.60, .13, .09), "Door", self.m["timber"][0], .004)
        for z in [.39, .96]:
            self.box("Door_hinge_%s" % z, (x - .14, -.926, z), (.12, .025, .037), "Door", self.m["metal"][0])
        self.box("Door_handle", (x + .115, -.936, .663), (.051, .042, .069), "Door", self.m["brass"][0], .007)
        # Modest porch cap gives the facade an asymmetric, lived-in silhouette.
        front = [(-.16, -1.092, 1.285), (.56, -1.092, 1.285), (.56, -.81, 1.43), (-.16, -.81, 1.43)]
        self.mesh("Door_canopy_roof", front + [(a, b, c - .035) for a, b, c in front],
                  [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], "Roof", self.m["roof"][1])
        self.box("Door_canopy_fascia", (.20, -1.109, 1.264), (.79, .064, .067), "Door", self.m["timber"][0])
        for sx in [-.095, .495]:
            self.beam("Porch_bracket_%s" % sx, (sx, -.823, 1.11), (sx, -1.048, 1.27), .046, .058, "Door", self.m["timberLight"][0])

    def roof(self):
        b = self.c["building"]
        half, ridge, eave = b["roofHalfWidth"], b["roofPeak"], b["wallTop"] + .075
        yf, yb = b["roofFront"], b["roofBack"]
        slope = (ridge - eave) / half
        for side in [-1, 1]:
            x = side * half
            top = [(0, yf, ridge), (x, yf, eave), (x, yb, eave), (0, yb, ridge)]
            verts = top + [(a, c, z - .055) for a, c, z in top]
            self.mesh("Roof_solid_%s" % side, verts,
                      [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], "Roof", self.m["roof"][3])
            for row in range(8):
                ya, ye = yf + row * (yb - yf) / 8, yf + (row + 1) * (yb - yf) / 8 - .04
                step = (half - .025) / 6
                shift = -step / 2 if row % 2 else 0
                for col in range(7 if row % 2 else 6):
                    xa = max(.025, .025 + col * step + shift)
                    xe = min(half, .025 + (col + 1) * step + shift) - .018
                    # Broad geometric shingles with deliberately aligned seams.
                    tile = [(side * xa, ya, ridge - slope * xa + .018),
                            (side * xe, ya, ridge - slope * xe + .025),
                            (side * xe, ye, ridge - slope * xe + .025),
                            (side * xa, ye, ridge - slope * xa + .018)]
                    obj = self.mesh("Roof_tile_%s_%02d_%02d" % (side, row, col),
                                    tile + [(a, c, z - .018) for a, c, z in tile],
                                    [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)],
                    "Roof", self.m["roof"][0 if (row * 7 + col * 3) % 13 == 0 else 1])
            # Wooden bargeboards are structural timber, not recoloured with tiles.
            for y in [yf - .025, yb + .018]:
                self.beam("Bargeboard_%s_%s" % (side, y), (0, y, ridge - .013),
                          (side * (half + .02), y, eave - .03), .075, .065, "Walls", self.m["timber"][0])
            self.box("Eave_%s" % side, (side * (half + .01), (yf + yb) / 2, eave - .019),
                     (.085, yb - yf + .075, .09), "Walls", self.m["timber"][0])
        # Six-sided ceramic ridge caps, each separately editable.
        for row in range(8):
            ya, ye = yf + row * (yb - yf) / 8 - .013, yf + (row + 1) * (yb - yf) / 8 + .006
            cross = [(math.sin(t) * .085, ridge + math.cos(t) * .075)
                     for t in [-math.pi / 2 + i * math.pi / 5 for i in range(6)]]
            verts = [(x, y, z) for y in [ya, ye] for x, z in cross]
            faces = [(i, i + 1, i + 7, i + 6) for i in range(5)] + [tuple(range(5, -1, -1)), tuple(range(6, 12)), (0, 6, 11, 5)]
            self.mesh("Roof_ridge_cap_%02d" % row, verts, faces, "Roof", self.m["roof"][2 if row % 3 == 0 else 1])

    def chimney(self):
        # Tall enough to read at native resolution, behind the right roof slope.
        x, y = .64, .37
        self.box("Chimney_body", (x, y, 2.295), (.25, .29, .89), "Chimney", self.m["brickMortar"][0], .006)
        for row in range(6):
            for col in range(2):
                self.box("Chimney_front_brick_%d_%d" % (row, col),
                         (x - .062 + col * .124, y - .151, 1.916 + row * .137),
                         (.119, .025, .122), "Chimney", self.m["brick"][0], .003)
        self.box("Chimney_cap_base", (x, y, 2.776), (.34, .37, .095), "Chimney", self.m["stone"][0], .01)
        self.box("Chimney_flue_dark", (x, y, 2.827), (.18, .20, .008), "Chimney", self.m["metal"][0])
        for sx in [-1, 1]:
            self.box("Chimney_lip_x_%s" % sx, (x + sx * .119, y, 2.841), (.06, .31, .057), "Chimney", self.m["stone"][1], .004)
        for sy in [-1, 1]:
            self.box("Chimney_lip_y_%s" % sy, (x, y + sy * .119, 2.841), (.29, .06, .057), "Chimney", self.m["stone"][1], .004)

    def decorations(self):
        self.box("Window_planter", (-.69, -.976, .702), (.56, .21, .14), "Decorations", self.m["timberLight"][0], .018)
        self.box("Planter_front_rail", (-.69, -1.093, .695), (.57, .035, .04), "Decorations", self.m["timber"][0])
        for i, (dx, dy, z) in enumerate([(-.19, -.96, .80), (-.09, -1.0, .825), (.03, -.97, .835), (.17, -.99, .80)]):
            self.leaf("Planter_leaf_%d" % i, (-.69 + dx, dy, z), (.09, .074, .086), self.m["leaves"][i % 3])
        for i, x in enumerate([-.83, -.57]):
            self.leaf("Planter_flower_%d" % i, (x, -.99, .889), (.039, .035, .037), self.m["flower"][0])
        self.box("Lantern_wall_mount", (-.14, -.861, 1.14), (.058, .073, .1), "Decorations", self.m["metal"][0])
        self.box("Lantern_glass", (-.14, -.98, 1.10), (.08, .075, .12), "Decorations", self.m["glassGlow"][0])
        self.box("Lantern_cap", (-.14, -.98, 1.18), (.13, .115, .048), "Decorations", self.m["metal"][0], .009)
        self.box("Lantern_base", (-.14, -.98, 1.028), (.11, .097, .027), "Decorations", self.m["metal"][0])
        # Distinctive carved lintel mark; no text or external texture.
        self.beam("Gable_carving_left", (-.13, -.849, 2.175), (-.05, -.849, 2.235), .025, .013, "Decorations", self.m["timberLight"][0])
        self.beam("Gable_carving_right", (-.05, -.849, 2.235), (.03, -.849, 2.175), .025, .013, "Decorations", self.m["timberLight"][0])

    def build(self):
        for fn in [self.foundation, self.walls, self.roof, self.doors_windows, self.chimney, self.decorations]:
            fn()


def setup_render(config, engine=None):
    scene = bpy.context.scene
    r = config["render"]
    scene.render.engine = engine or r["engine"]
    scene.render.resolution_x = r["width"]
    scene.render.resolution_y = r["height"]
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = True
    scene.render.filter_size = .5
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 4
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    scene.render.dither_intensity = 0
    if scene.render.engine == "CYCLES":
        scene.cycles.device = r["device"]
        scene.cycles.samples = r["samples"]
        scene.cycles.seed = r["seed"]
        scene.cycles.use_animated_seed = False
        scene.cycles.use_adaptive_sampling = False
        scene.cycles.use_denoising = False
        scene.cycles.diffuse_bounces = r["diffuseBounces"]
        scene.cycles.glossy_bounces = r["glossyBounces"]
        scene.cycles.transmission_bounces = 0
        scene.cycles.volume_bounces = 0
        scene.cycles.max_bounces = 1
        scene.cycles.transparent_max_bounces = 2
    scene.world = bpy.data.worlds.new("Warm_neutral_world") if scene.world is None else scene.world
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (1, 1, 1, 1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = config["lighting"]["worldStrength"]


def setup_camera_and_light(config):
    c, scene = config["camera"], bpy.context.scene
    data = bpy.data.cameras.new("Sprite_camera_data")
    camera = bpy.data.objects.new("Sprite_camera", data)
    scene.collection.objects.link(camera)
    data.type = "ORTHO"
    data.ortho_scale = config["render"]["height"] / c["pixelsPerWorldUnit"]
    angle = math.radians(c["elevationDegrees"])
    up = Vector((0, math.sin(angle), math.cos(angle)))
    anchor = Vector(c["anchorWorld"])
    offset = (c["anchorPixels"][1] - config["render"]["height"] / 2) / c["pixelsPerWorldUnit"]
    target = Vector((0, 0, (anchor.dot(up) + offset) / math.cos(angle)))
    camera.location = target + Vector((0, -math.cos(angle), math.sin(angle))) * 10
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera["elevation_degrees"] = c["elevationDegrees"]
    camera["azimuth_degrees"] = 0
    scene.camera = camera
    light_data = bpy.data.lights.new("Upper_left_sun_data", "SUN")
    light_data.energy = config["lighting"]["sunEnergy"]
    light_data.angle = config["lighting"]["sunAngle"]
    light = bpy.data.objects.new("Upper_left_sun", light_data)
    scene.collection.objects.link(light)
    light.location = config["lighting"]["sunPosition"]
    light.rotation_euler = (-light.location).to_track_quat("-Z", "Y").to_euler()


def variant(name, config):
    for i, color in enumerate(config["roofVariants"][name]):
        set_color(bpy.data.materials["Roof_Color_" + str(i)], color)
    bpy.context.scene["roof_variant"] = name


def scene_record(config):
    scene = bpy.context.scene
    geometry, semantics = {}, {}
    for obj in sorted(bpy.data.objects, key=lambda o: o.name):
        if obj.type != "MESH":
            continue
        group = obj.get("semantic_part", "other")
        semantics[group] = semantics.get(group, 0) + 1
        payload = {"vertices": [[round(v, 7) for v in p.co] for p in obj.data.vertices],
                   "faces": [list(p.vertices) for p in obj.data.polygons],
                   "matrix": [[round(v, 7) for v in row] for row in obj.matrix_world],
                   "modifiers": [{"name": m.name, "type": m.type, "width": getattr(m, "width", None)} for m in obj.modifiers]}
        geometry[obj.name] = {"semanticPart": group, "vertices": len(obj.data.vertices),
                              "faces": len(obj.data.polygons), "sha256": hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest(),
                              "materials": [m.name for m in obj.data.materials]}
    camera = scene.camera
    p = world_to_camera_view(scene, camera, Vector(config["camera"]["anchorWorld"]))
    projected = [p.x * scene.render.resolution_x, (1 - p.y) * scene.render.resolution_y]
    return {"blenderVersion": bpy.app.version_string, "semanticObjectCounts": semantics,
            "objects": geometry, "materials": {m.name: m.get("source_hex") for m in bpy.data.materials if m.get("source_hex")},
            "camera": {"type": camera.data.type, "matrix": [list(row) for row in camera.matrix_world],
                       "orthoScale": camera.data.ortho_scale, "elevationDegrees": camera.get("elevation_degrees"),
                       "azimuthDegrees": camera.get("azimuth_degrees"), "projectedAnchor": projected},
            "render": {"engine": scene.render.engine, "resolution": [scene.render.resolution_x, scene.render.resolution_y],
                       "samples": scene.cycles.samples if scene.render.engine == "CYCLES" else None,
                       "device": scene.cycles.device if scene.render.engine == "CYCLES" else None,
                       "filmTransparent": scene.render.film_transparent},
            "hiddenInteriorsBuilt": False}


def render_file(path):
    start = time.perf_counter()
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    return round(time.perf_counter() - start, 3)


def render_roof_mask(path):
    replacements = {}
    mats = {}
    for color, key in [((1, 1, 1, 1), "Roof_mask_white"), ((0, 0, 0, 1), "Other_mask_black")]:
        m = bpy.data.materials.new(key)
        m.use_nodes = True
        nodes = m.node_tree.nodes
        nodes.clear()
        emission, output = nodes.new("ShaderNodeEmission"), nodes.new("ShaderNodeOutputMaterial")
        emission.inputs["Color"].default_value = color
        m.node_tree.links.new(emission.outputs[0], output.inputs["Surface"])
        mats[key] = m
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            replacements[obj.name] = list(obj.data.materials)
            obj.data.materials.clear()
            obj.data.materials.append(mats["Roof_mask_white" if obj.get("semantic_part") == "Roof" else "Other_mask_black"])
    elapsed = render_file(path)
    for obj in bpy.data.objects:
        if obj.name in replacements:
            obj.data.materials.clear()
            for m in replacements[obj.name]:
                obj.data.materials.append(m)
    for m in mats.values():
        bpy.data.materials.remove(m)
    return elapsed


def render_model_preview(path):
    scene, cam = bpy.context.scene, bpy.context.scene.camera
    old = (cam.matrix_world.copy(), cam.data.ortho_scale, scene.render.resolution_x, scene.render.resolution_y)
    target = Vector((0, 0, 1.2))
    cam.location = (4.3, -6.8, 4.6)
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.ortho_scale = 4.3
    scene.render.resolution_x = 480
    scene.render.resolution_y = 480
    elapsed = render_file(path)
    cam.matrix_world, cam.data.ortho_scale, scene.render.resolution_x, scene.render.resolution_y = old
    return elapsed


def main():
    args = arguments()
    config = json.loads(args.config.read_text())
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=True)
    prefix = "cabin-" + args.variant
    blend = out / (prefix + ".blend")
    raw = out / (prefix + "-raw.png")
    for p in [blend, raw, out / (prefix + "-scene.json")]:
        if p.exists():
            raise RuntimeError("Refusing to overwrite an existing result: " + str(p))
    timings = {}
    start = time.perf_counter()
    if args.load:
        bpy.ops.wm.open_mainfile(filepath=str(args.load.resolve()))
        timings["openSeconds"] = round(time.perf_counter() - start, 3)
    else:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        Builder(config).build()
        setup_camera_and_light(config)
        timings["modelBuildSeconds"] = round(time.perf_counter() - start, 3)
    setup_render(config, args.engine)
    variant(args.variant, config)
    bpy.context.view_layer.update()
    record = scene_record(config)
    save_start = time.perf_counter()
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    timings["saveSeconds"] = round(time.perf_counter() - save_start, 3)
    timings["nativeRenderSeconds"] = render_file(raw)
    if args.roof_mask:
        timings["roofMaskSeconds"] = render_roof_mask(out / "roof-visible-mask-raw.png")
    if args.model_preview:
        timings["modelPreviewSeconds"] = render_model_preview(out / "model-preview.png")
    timings["scriptTotalSeconds"] = round(time.perf_counter() - start, 3)
    record.update({"variant": args.variant, "loadedExistingModel": bool(args.load), "timings": timings,
                   "outputBlend": blend.name, "rawPNG": raw.name, "config": config})
    (out / (prefix + "-scene.json")).write_text(json.dumps(record, indent=2) + "\n")
    print("MINGRIFU_RESULT " + json.dumps({"variant": args.variant, "blend": str(blend), "render": str(raw),
          "counts": record["semanticObjectCounts"], "projectedAnchor": record["camera"]["projectedAnchor"], "timings": timings}), flush=True)


if __name__ == "__main__":
    main()
