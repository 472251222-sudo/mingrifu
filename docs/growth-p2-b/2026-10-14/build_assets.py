"""Original P2-B vegetation/props using the validated cabin camera and shader.
Run with Blender --background --python build_assets.py -- --output NEW_DIRECTORY.
The approved cabin and original P2-A files are never changed.
"""
import argparse
import copy
import importlib.util
import json
import math
import random
import sys
import time
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
BASE = ROOT / "docs/growth-blender-experiment/2026-10-13"
spec = importlib.util.spec_from_file_location("cabin_tools", BASE / "build_cabin.py")
tools = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tools)

ASSETS = [
    dict(id="oak-broad", name="林缘阔冠树", kind="tree", size=[96, 128], anchor=[48, 116], footprint=[2, 2]),
    dict(id="pine-slender", name="高冠青杉", kind="tree", size=[80, 144], anchor=[40, 132], footprint=[1, 1]),
    dict(id="grass-tuft", name="弯叶草丛", kind="vegetation", size=[32, 32], anchor=[16, 28], footprint=[1, 1]),
    dict(id="wildflowers", name="暖色野花", kind="vegetation", size=[32, 48], anchor=[16, 42], footprint=[1, 1]),
    dict(id="bush", name="圆叶灌木", kind="vegetation", size=[48, 48], anchor=[24, 42], footprint=[1, 1]),
    dict(id="rock", name="苔色岩石", kind="decoration", size=[32, 40], anchor=[16, 32], footprint=[1, 1]),
    dict(id="fence-horizontal", name="木栅栏·横向", kind="decoration", size=[64, 40], anchor=[32, 34], footprint=[2, 1]),
    dict(id="fence-vertical", name="木栅栏·纵向", kind="decoration", size=[32, 80], anchor=[16, 60], footprint=[1, 2]),
    dict(id="mailbox", name="林间信箱", kind="decoration", size=[40, 48], anchor=[20, 43], footprint=[1, 1]),
]


class AssetBuilder:
    def __init__(self, asset):
        self.asset = asset
        self.rng = random.Random(1430)
        self.groups = {}
        self.root = bpy.data.collections.new(asset["id"])
        bpy.context.scene.collection.children.link(self.root)
        self.parent = bpy.data.objects.new(asset["id"] + "_ROOT", None)
        self.root.objects.link(self.parent)
        self.parent["ground_anchor_pixels"] = asset["anchor"]
        self.parent["footprint_cells"] = asset["footprint"]
        self.parent["original_design"] = "Mingrifu P2-B original; no external textures"
        self.materials = {}

    def mat(self, name, color):
        if name not in self.materials:
            self.materials[name] = tools.material(name, color)
        return self.materials[name]

    def put(self, obj, name, group, mat, smooth=False):
        obj.name = name
        if group not in self.groups:
            self.groups[group] = bpy.data.collections.new(group)
            self.root.children.link(self.groups[group])
        for c in list(obj.users_collection):
            c.objects.unlink(obj)
        self.groups[group].objects.link(obj)
        obj.parent = self.parent
        obj["semantic_part"] = group
        obj.data.materials.append(mat)
        for p in obj.data.polygons:
            p.use_smooth = smooth
        return obj

    def box(self, name, center, dims, group, color, bevel=0):
        bpy.ops.mesh.primitive_cube_add(size=1, location=center)
        obj = bpy.context.object
        obj.dimensions = dims
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        self.put(obj, name, group, self.mat(group + color, color))
        if bevel:
            mod = obj.modifiers.new("Crafted edge", "BEVEL")
            mod.width, mod.segments = bevel, 1
        return obj

    def mesh(self, name, verts, faces, group, color, smooth=False):
        data = bpy.data.meshes.new(name + "_mesh")
        data.from_pydata(verts, [], faces)
        data.update()
        obj = bpy.data.objects.new(name, data)
        self.root.objects.link(obj)
        return self.put(obj, name, group, self.mat(group + color, color), smooth)

    def stem(self, name, a, b, width, color="#795643", group="Branches"):
        va, vb = Vector(a), Vector(b)
        bpy.ops.mesh.primitive_cone_add(vertices=7, radius1=width, radius2=width * .62,
                                       depth=(vb - va).length, location=(va + vb) / 2)
        obj = bpy.context.object
        obj.rotation_euler = (vb - va).to_track_quat("Z", "Y").to_euler()
        return self.put(obj, name, group, self.mat(group + color, color))

    def lobe(self, name, center, radii, color, group="Canopy", smooth=True, rough=.025):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1, location=center)
        obj = bpy.context.object
        for v in obj.data.vertices:
            v.co *= 1 + self.rng.uniform(-rough, rough)
        obj.scale = radii
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        return self.put(obj, name, group, self.mat(group + color, color), smooth)

    def roots(self):
        for i, (x, y) in enumerate([(-.28, -.12), (.26, -.10), (.08, .28)]):
            self.stem("Root_%d" % i, (0, 0, .24), (x, y, .02), .075, group="Roots")

    def oak(self):
        self.roots()
        self.stem("Trunk_base", (0, 0, .05), (.05, .04, 1.36), .145, group="Trunk")
        self.stem("Trunk_upper", (.05, .04, 1.1), (-.08, .08, 2.1), .10, group="Trunk")
        for i, b in enumerate([(-.65, .10, 2.12), (.66, .12, 2.17), (.2, -.3, 2.14)]):
            self.stem("Branch_%d" % i, (.03, .04, 1.3), b, .07)
        lobes = [(-.61, .14, 2.12, .60, .49, .53), (.01, .29, 2.59, .67, .50, .58),
                 (.61, .16, 2.31, .59, .46, .55), (-.15, -.13, 2.39, .63, .47, .58),
                 (-.65, -.24, 1.97, .49, .42, .43), (.60, -.24, 2.02, .54, .42, .45),
                 (.00, -.45, 2.05, .58, .41, .44), (.24, -.29, 2.48, .47, .41, .44)]
        shades = ["#588455", "#7da55e", "#588455", "#7da55e", "#3b6550", "#588455", "#588455", "#a9c36e"]
        for i, (x, y, z, rx, ry, rz) in enumerate(lobes):
            self.lobe("Crown_mass_%02d" % i, (x, y, z), (rx, ry, rz), shades[i])
        # A few broad sprigs interrupt the smooth crown boundary at game scale.
        for i, (x, y, z) in enumerate([(-1.04, -.15, 2.15), (.99, -.15, 2.23), (-.36, -.56, 2.16)]):
            self.lobe("Leaf_sprig_%d" % i, (x, y, z), (.20, .14, .17), "#588455")

    def pine(self):
        self.roots()
        self.stem("Slender_trunk", (0, 0, .06), (.015, .04, 3.33), .10, group="Trunk")
        # Curved, irregular layered boughs; deliberately not stacked primitive cones.
        for level, (z, radius, height) in enumerate([(1.0, .88, 1.13), (1.56, .75, 1.08),
                                                    (2.10, .60, 1.01), (2.62, .45, .91), (3.09, .28, .74)]):
            verts, count = [], 12
            for ring, (r, h) in enumerate([(1, 0), (1.02, .20), (.65, .51), (.25, .77)]):
                for i in range(count):
                    angle = 2 * math.pi * i / count
                    irregular = 1 + .09 * math.sin(i * 2.1 + level * .8)
                    verts.append((math.cos(angle) * radius * r * irregular + .035 * level,
                                  math.sin(angle) * radius * r * irregular,
                                  z + height * h + .045 * math.sin(i * 1.8 + level)))
            verts.append((.035 * level, 0, z + height))
            faces = []
            for ring in range(3):
                for i in range(count):
                    j = (i + 1) % count
                    faces.append((ring * count + i, ring * count + j,
                                  (ring + 1) * count + j, (ring + 1) * count + i))
            faces.extend((3 * count + i, 3 * count + (i + 1) % count, 4 * count) for i in range(count))
            faces.append(tuple(range(count - 1, -1, -1)))
            self.mesh("Bough_tier_%d" % level, verts, faces, "Canopy", ["#3b6550", "#588455", "#588455", "#7da55e", "#7da55e"][level], True)
        for i, (x, y, z) in enumerate([(-.60, -.28, 1.36), (.55, -.32, 1.86), (-.4, -.35, 2.4)]):
            self.lobe("Bough_tip_%d" % i, (x, y, z), (.23, .15, .13), "#588455")

    def grass(self):
        for i, (x, y, dx, dy, h) in enumerate([(-.2, .02, -.15, .04, .40), (-.08, .05, -.10, .08, .55),
                                               (.03, .03, .03, .06, .57), (.16, .01, .20, .0, .39),
                                               (-.12, -.10, -.19, -.03, .30), (.1, -.10, .14, -.08, .37)]):
            width = .055
            self.mesh("Blade_%d" % i, [(x - width, y, .02), (x + width, y, .02),
                       (x + dx + width / 2, y + dy, h * .65), (x + dx * 1.35, y + dy * 1.3, h),
                       (x + dx - width / 2, y + dy, h * .65)], [(0, 1, 2, 3, 4)], "Leaves",
                      ["#588455", "#7da55e", "#a9c36e"][i % 3])

    def flowers(self):
        for i, (x, y, h) in enumerate([(-.21, .08, .62), (.0, .15, .88), (.21, .09, .75), (-.1, -.11, .42)]):
            self.stem("Flower_stem_%d" % i, (x, y, .02), (x + .04, y, h), .023, "#588455", "Stems")
            for j in range(5):
                a = j * math.tau / 5
                self.lobe("Petal_%d_%d" % (i, j), (x + .04 + .075 * math.cos(a), y + .075 * math.sin(a), h),
                          (.065, .052, .031), "#fff1d2" if i % 2 == 0 else "#df9c6b", "Petals", False)
            self.lobe("Flower_center_%d" % i, (x + .04, y, h + .027), (.046, .044, .024), "#e2bd86", "Petals", False)
            self.lobe("Flower_leaf_%d" % i, (x - .06, y - .04, h * .44), (.10, .045, .035), "#7da55e", "Leaves")

    def bush(self):
        for i, (x, y, z, r) in enumerate([(-.32, .06, .49, .31), (.03, .13, .69, .40), (.35, .04, .51, .31), (-.15, -.22, .44, .29), (.22, -.22, .45, .28)]):
            self.stem("Bush_branch_%d" % i, (0, 0, .03), (x, y, z), .035)
            self.lobe("Bush_mass_%d" % i, (x, y, z), (r, r * .75, r * .83), ["#588455", "#7da55e", "#588455", "#3b6550", "#588455"][i])

    def rock(self):
        self.lobe("Rock_body", (-.05, .03, .18), (.38, .26, .27), "#78816c", "Stone", False, .13)
        self.lobe("Rock_smaller", (.22, -.09, .08), (.14, .13, .12), "#586253", "Stone", False, .09)
        self.lobe("Moss_patch", (-.15, -.10, .29), (.16, .085, .035), "#75835a", "Moss", True)

    def fence(self, vertical=False):
        for i, pos in enumerate([-.76, .76]):
            x, y = (0, pos) if vertical else (pos, 0)
            self.box("Fence_post_%d" % i, (x, y, .37), (.14, .14, .74), "Posts", "#a07652", .015)
            self.box("Post_cap_%d" % i, (x, y, .765), (.18, .18, .07), "Posts", "#c39b6a", .01)
        for i, z in enumerate([.26, .56]):
            self.box("Fence_rail_%d" % i, (0, -.04 if not vertical else 0, z),
                     (.075, 1.52, .09) if vertical else (1.52, .075, .09), "Rails", "#a07652", .008)
        for i, pos in enumerate([-.44, -.02, .42]):
            self.box("Fence_slat_%d" % i, (0, pos, .38) if vertical else (pos, -.035, .38),
                     (.055, .105, .43) if vertical else (.105, .055, .43), "Slats", "#c39b6a", .009)

    def mailbox(self):
        self.box("Mailbox_post", (0, 0, .41), (.12, .14, .80), "Post", "#a07652", .009)
        self.box("Mailbox_foot", (0, 0, .045), (.24, .24, .09), "Post", "#78816c", .01)
        # Closed arched shell with separate front, flag and letter opening.
        cross = [(-.23, .78), (.23, .78), (.23, 1.02), (.16, 1.13), (0, 1.19), (-.16, 1.13), (-.23, 1.02)]
        verts = [(x, y, z) for y in [-.19, .22] for x, z in cross]
        faces = [tuple(range(6, -1, -1)), tuple(range(7, 14))] + [(i, (i + 1) % 7, (i + 1) % 7 + 7, i + 7) for i in range(7)]
        self.mesh("Arched_mailbox_shell", verts, faces, "Box", "#588455")
        self.box("Front_panel", (0, -.207, .94), (.37, .025, .26), "Door", "#7da55e", .015)
        self.box("Letter_opening", (0, -.228, 1.014), (.22, .008, .025), "Door", "#264b40")
        self.box("Mailbox_handle", (.12, -.23, .865), (.055, .018, .025), "Door", "#e2bd86")
        self.box("Flag_pole", (.26, .02, 1.0), (.025, .03, .29), "Flag", "#594036")
        self.box("Raised_flag", (.32, .02, 1.135), (.15, .035, .10), "Flag", "#bd7055")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--only", choices=[a["id"] for a in ASSETS])
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    args.output.mkdir(parents=True, exist_ok=True)
    base = json.loads((BASE / "cabin-config.json").read_text())
    for asset in ASSETS:
        if args.only and asset["id"] != args.only:
            continue
        out = args.output / asset["id"]
        out.mkdir(exist_ok=False)
        start = time.perf_counter()
        bpy.ops.wm.read_factory_settings(use_empty=True)
        config = copy.deepcopy(base)
        config["render"].update(width=asset["size"][0], height=asset["size"][1], seed=1430)
        config["camera"].update(anchorWorld=[0, 0, 0], anchorPixels=asset["anchor"])
        config["game"].update(anchor=asset["anchor"], footprint=asset["footprint"])
        builder = AssetBuilder(asset)
        functions = {"oak-broad": builder.oak, "pine-slender": builder.pine, "grass-tuft": builder.grass,
                     "wildflowers": builder.flowers, "bush": builder.bush, "rock": builder.rock,
                     "fence-horizontal": builder.fence, "fence-vertical": lambda: builder.fence(True), "mailbox": builder.mailbox}
        functions[asset["id"]]()
        tools.setup_render(config)
        tools.setup_camera_and_light(config)
        # Blender ortho_scale governs the larger image axis. The cabin helper
        # assumed portrait canvases; landscape props need this correction.
        bpy.context.scene.camera.data.ortho_scale = max(asset["size"]) / 32
        bpy.context.view_layer.update()
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=str(out / (asset["id"] + ".blend")))
        render_seconds = tools.render_file(out / (asset["id"] + "-raw.png"))
        record = tools.scene_record(config)
        record.update(asset, status="candidate", version="p2-b-v1", constructionScript="build_assets.py",
                      renderSeconds=render_seconds, buildAndRenderSeconds=round(time.perf_counter() - start, 3),
                      originalEngineering=str(out / (asset["id"] + ".blend")))
        (out / "record.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps({"asset": asset["id"], "seconds": record["buildAndRenderSeconds"], "objects": sum(record["semanticObjectCounts"].values())}), flush=True)


if __name__ == "__main__":
    main()
