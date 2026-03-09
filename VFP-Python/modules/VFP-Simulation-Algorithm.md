# VFP Engine Implementation Guide

Detailed reference for the current `vfp-engine.py` implementation. This reflects the code in `modules/vfp-engine.py` and the helper modules it calls.

## Purpose and Scope
- Reads a `.vfp` JSON case, writes all required solver inputs, runs VFP in one or more modes, aggregates outputs (including dump files and wavedrag data), and saves an updated `.vfp` with results.
- Supports wing-only or wing+tail cases, single runs, continuation runs, and automated sweeps.

## Entry Point and Invocation
- Script: `modules/vfp-engine.py`
- Usage: `python vfp-engine.py <vfpFilePath>` where `<vfpFilePath>` is a `.vfp` JSON case.
- Aborts early if no path is supplied.

## Expected Case Structure (key fields)
- `formData`: user selections and run mode flags.
  - `simName` (str): simulation name; used for working dir and output filename.
  - `aoa`, `mach` (floats): nominal conditions for standard mode.
  - `continuationRun` (bool): run as continuation when true.
  - `autoRunner` (bool): enable sweep mode when true.
  - `autoMode` (`"aoa"` or `"mach"`), `autoStepSize`, `autoEndAoA`/`autoEndMach`: sweep controls.
  - `excrescence` (bool): forwarded to batch script.
  - `wingDumpName`, `tailDumpName`, `dumpName`: dump selection for continuation.
- `inputFiles`: per-geometry inputs.
  - `wingConfig` / `tailConfig`: each has `fileNames` (GeoFile, MapFile, DatFile) and `fileData` (contents keyed by filename).
  - `bodyFiles` (optional): additional files (e.g., tail spec) written into the tail directory.
- `results` (optional on input): prior outputs and dump files used for continuation.

## Working Directories and Staging
- Project root is inferred two levels above `vfp-engine.py`.
- Working tree: `data/Simulations/{simName}/wing` and `.../tail` are created per run.
- Utility copies: every file in `modules/utils` is copied into each sim directory (batch files, helpers, binaries placed by user).
- Input writing: for each config, the engine writes Geo/Map/Dat contents from `fileData` to the corresponding sim directory using the names in `fileNames` (UTF-8, newline preserved). Body files, if present, are written into the tail directory.

## Mode Selection
The engine selects exactly one of the following based on `formData` flags:

### 1) AutoRunner Sweep (`autoRunner=true`)
- Supported axes: `autoMode="aoa"` or `"mach"` with step `autoStepSize` and end value (`autoEndAoA` or `autoEndMach`).
- Flow naming: extracts Reynolds and Mach parts from the original wing Dat filename to build new flow filenames per step.
- First step: standard run using the provided flow file.
- Subsequent steps: continuation runs; new flow files are generated via `generate_flow_file()` with updated Mach/AoA while preserving format and level-1 content. Dump source is the previous flow key.
- Each step updates `inputFiles.wingConfig.fileNames.DatFile` to the new flow name before running.
- After all steps, polars are extracted (matching `.forces` and `wavedrg73` files) and stored under `results.Polars`.
- Results saved to `{simName}-a{lastValue}.vfp` where `lastValue` is the final AoA/Mach step.

### 2) Continuation Mode (`continuationRun=true`, `autoRunner=false`)
- For each present config (wing, tail):
  - Reads dump files from `results[configKey][FlowKey][dumpFiles]` and writes required `fort11/15/21/50/51/52/55` into the sim directory (`vfp_dumpfile_write`).
  - Runs `cmdvfp.bat` with continuation and excrescence flags plus the dump base name.
- Dump flow key is taken from `wingDumpName`, `tailDumpName`, or `dumpName` in `formData`.
- Results are appended and saved to `{simName}-a{aoa}.vfp`.

### 3) Standard Mode (default)
- Runs wing first. Batch arguments: `cmdvfp.bat <map> <geo> <dat> <contFlag> <excrFlag> ""` with `contFlag`/`excrFlag` set from `formData`.
- If tail inputs exist:
  - Extracts `ALPHA` and `MACH` from the wing flow file (`extract_alpha_mach_from_flow`).
  - Finds the generated wing `.cp`, computes downwash via `compute_downwash_LLT`, and stores LLT outputs under `results.tailConfig.flowLLT`.
  - Computes tail inflow: `ALPHAT = ALPHAW - |epsilon|`, `MACHT = avg_local_mach` (both rounded to 4 dp).
  - Modifies the tail flow file in-place (`modify_tail_flow_file_preserve_format`) with new Mach/AoA while preserving formatting and level blocks; updates `inputFiles.tailConfig.fileData` with the modified content.
  - Runs tail in standard mode.
- Results saved to `{simName}-a{aoa}.vfp`.

## Result Collection and Data Shape
- `add_vfp_results_to_data` scans the sim directory after each run and populates `results[configKey][flowKey]` where `flowKey` is the Dat filename without extension.
- Stored file types:
  - Standard outputs: `.mapout`, `.cp`, `.flow`, `.conv`, `.forces`, `.sum`, `.vis`, `.DAT` (text when readable; otherwise base64 with `encoding: "base64"`).
  - `.mapout` is stored only once per config to avoid duplication.
  - Dump files (`.fort11/15/21/50/51/52/55`) are placed under `dumpFiles` inside the flow entry.
  - Wavedrag (`wavedrg73/74/75/76.DAT`) is added when present.
- AutoRunner-only: `results.Polars` contains arrays extracted from paired `.forces` and `wavedrg73` files, sorted by `ALPHA`.
- Final save: `save_vfp_results` writes the whole JSON (with numpy types coerced) to `data/Simulations/{simName}-a{aoaStr}.vfp` where `aoaStr` formats `1.25 -> 1p25`, `-0.5 -> m0p50`. When AoA is missing, defaults to `0p00`.

## Key Helpers
- `write_vfp_input_files`: materializes per-config Geo/Map/Dat from `fileData`.
- `copy_simulation_files`: copies everything in `modules/utils` into the sim directory; user must ensure solver binaries/scripts reside there.
- `generate_flow_file`: constructs a level-1-only flow file with optional Mach/AoA edits while preserving spacing and fuse block count; also flips the second field leading digit to `1` per VFP format.
- `extract_alpha_mach_from_flow`: parses Mach and AoA from the first level line of a flow file.
- `vfp_dumpfile_write`: rehydrates dump files from `results` into the working directory before continuation runs.
- `cleanup_sim_dir`: available but commented out in the main flow (dirs are retained for debugging).

## Error Handling and Assumptions
- Fails fast when required configs are missing (e.g., no `wingConfig` in standard mode).
- Continuation requires matching dump files in `results`; missing dump entries raise clear exceptions.
- Tail workflow requires a wing `.cp` file; absence raises an error before tail run.
- File reads default to UTF-8; binary fallback is base64 encoded in results to avoid decode errors.

## Minimal Run Checklist
1) Prepare a `.vfp` case with `formData`, `inputFiles.wingConfig` (and `tailConfig` if needed), and embedded file contents.
2) Place solver batch/executable assets under `modules/utils` so they are copied into each working dir.
3) Run `python vfp-engine.py path/to/case.vfp` from the project root environment where VFP executables are valid.
4) Collect results in `data/Simulations/{simName}` and the saved `{simName}-a*.vfp` file.

This guide mirrors the actual behavior of the current `vfp-engine.py` so new contributors can reason about inputs, modes, side effects, and saved artifacts without reading the source.


