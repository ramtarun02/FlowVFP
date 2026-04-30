# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_submodules

hiddenimports = []
for pkg in (
    "engineio",
    "socketio",
    "flask_socketio",
    "numpy",
    "scipy",
    "pandas",
    "matplotlib",
    "openpyxl",
):
    hiddenimports.extend(collect_submodules(pkg))


a = Analysis(
    ["launcher.py"],
    pathex=[],
    binaries=[],
    datas=[
        ("src", "src"),
        ("modules", "modules"),
        ("tools", "tools"),
        ("frontend_build", "frontend_build"),
    ],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tests"],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="FlowVFP",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="FlowVFP",
)
