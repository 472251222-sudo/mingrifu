"""Free local pipeline. Needs Blender, Node.js and an existing pngjs module; no network calls."""
import argparse
import json
import os
import shutil
import subprocess
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--blender", type=Path)
    parser.add_argument("--config", type=Path, default=HERE / "cabin-config.json")
    parser.add_argument("--output", type=Path, default=HERE / "output")
    parser.add_argument("--use-existing-original", action="store_true")
    args = parser.parse_args()
    choices = [args.blender, os.environ.get("BLENDER_BIN"), shutil.which("blender"),
               Path.home() / "Applications/Blender.app/Contents/MacOS/Blender",
               Path("/Applications/Blender.app/Contents/MacOS/Blender")]
    blender = next((str(p) for p in choices if p and Path(p).is_file()), None)
    if not blender:
        raise RuntimeError("Blender executable not found; supply --blender or BLENDER_BIN")
    node = shutil.which("node")
    if not node:
        raise RuntimeError("Node.js not found")
    out = args.output.resolve()
    if out.exists() and not args.use_existing_original:
        raise RuntimeError("Output directory exists; use a new directory to preserve original work")
    out.mkdir(parents=True, exist_ok=True)
    jobs = []

    def run(name, command, target):
        target.mkdir(parents=True, exist_ok=True)
        log_path = target / (name + ".log")
        start = time.perf_counter()
        with log_path.open("x") as log:
            result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT)
        record = {"name": name, "seconds": round(time.perf_counter() - start, 3),
                  "exitCode": result.returncode, "log": str(log_path.relative_to(out)),
                  "command": command}
        jobs.append(record)
        print(json.dumps({"job": name, "seconds": record["seconds"], "exitCode": result.returncode}), flush=True)
        if result.returncode:
            raise RuntimeError("Job failed; inspect " + str(log_path))

    def build(name, target, variant="terracotta", load=None, preview=False):
        cmd = [blender, "--background", "--factory-startup", "--disable-autoexec", "--python-exit-code", "1",
               "--python", str(HERE / "build_cabin.py"), "--", "--config", str(args.config.resolve()),
               "--output", str(target), "--variant", variant]
        if load:
            cmd += ["--load", str(load)]
        if preview:
            cmd += ["--roof-mask", "--model-preview"]
        run(name, cmd, target)

    def export(target, variant="terracotta", mask=False):
        cmd = [node, str(HERE / "pixel_export.mjs"), "--config", str(args.config.resolve()),
               "--input", str(target / ("cabin-" + variant + "-raw.png")),
               "--output", str(target / ("cabin-" + variant + "-sprite.png"))]
        if mask:
            cmd += ["--roof-mask", str(target / "roof-visible-mask-raw.png")]
        run("pixel-export-" + variant, cmd, target)

    original = out / "cabin-terracotta.blend"
    if not args.use_existing_original:
        build("build-original", out, preview=True)
        export(out, mask=True)
    elif not (original.is_file() and (out / "cabin-terracotta-sprite.png").is_file()):
        raise RuntimeError("Existing original .blend and sprite required")
    # This edit reopens the ORIGINAL native project and changes only its four roof materials.
    build("reopen-change-roof", out / "deep-blue", "deep-blue", load=original)
    export(out / "deep-blue", "deep-blue")
    build("reopen-original-rerender", out / "reopened", load=original)
    export(out / "reopened")
    build("rebuild-from-script", out / "rebuilt")
    export(out / "rebuilt")
    build("reopen-blue-rerender", out / "blue-reopened", "deep-blue",
          load=out / "deep-blue/cabin-deep-blue.blend")
    export(out / "blue-reopened", "deep-blue")
    (out / "pipeline-jobs.json").write_text(json.dumps(jobs, indent=2) + "\n")
    print("Local pipeline complete; use verify_outputs.mjs to check actual equivalence.")


if __name__ == "__main__":
    main()
