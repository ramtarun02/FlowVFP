"""Creates a Wing1 test .vfp payload and runs the engine directly."""
import json
import os
import subprocess
import sys
import tempfile

# Paths
repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
wing1_dir  = os.path.join(repo_root, "..", "examples", "Wing1")
modules_dir = os.path.join(repo_root, "modules")
engine_path = os.path.join(modules_dir, "vfp-engine.py")

map_file = os.path.join(wing1_dir, "DC304_v2p9.map")
geo_file = os.path.join(wing1_dir, "DC304_v2p9_twist_BSL.GEO")
dat_file = os.path.join(wing1_dir, "M070Re0p00ma+00p00.DAT")

def read_file(path):
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        return f.read()

vfp_data = {
    "metadata": {"name": "Wing1-Test", "version": "2025"},
    "formData": {
        "simName": "Wing1Test",
        "aoa": 0.0,
        "mach": 0.70,
        "continuationRun": False,
        "autoRunner": False,
        "excrescence": False,
    },
    "inputFiles": {
        "wingConfig": {
            "fileNames": {
                "MapFile": "DC304_v2p9.map",
                "GeoFile": "DC304_v2p9_twist_BSL.GEO",
                "DatFile": "M070Re0p00ma+00p00.DAT",
            },
            "fileData": {
                "DC304_v2p9.map": read_file(map_file),
                "DC304_v2p9_twist_BSL.GEO": read_file(geo_file),
                "M070Re0p00ma+00p00.DAT": read_file(dat_file),
            },
        }
    },
    "results": None,
}

# Write to temp file
with tempfile.NamedTemporaryFile(
    delete=False, suffix=".vfp", mode="w", encoding="utf-8"
) as tf:
    json.dump(vfp_data, tf, indent=2)
    tmp_path = tf.name

print(f"Test payload written to: {tmp_path}")
print(f"Running engine: {engine_path}")
print("-" * 60)

env = os.environ.copy()
env["PYTHONPATH"] = modules_dir + os.pathsep + env.get("PYTHONPATH", "")
env["PYTHONUNBUFFERED"] = "1"

proc = subprocess.Popen(
    [sys.executable, "-u", engine_path, tmp_path],
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
    bufsize=1,
    env=env,
)

for line in proc.stdout:
    print(line, end="", flush=True)

proc.wait()
print(f"\n{'=' * 60}")
print(f"Engine exit code: {proc.returncode}")
os.unlink(tmp_path)
