:: Changes made from the original are documented in the "Changes_To_Bat_File.txt" file


@echo off
title "VFP driver (non-interactive)"
@REM color 9F

::— 1. Read inputs ——
set "_map=%~1"
set "_geo=%~2"
set "_flow=%~3"
set "_excres=%~4"
set "_cont=%~5"
set "_dump=%~6"

::— 2. Validate required files ——
if "%_map%"=="" (
  echo Usage: %~nx0 map_base geo_base flow_base excres[y/n] cont[y/n] dump_base
  exit /b 1
)
if not exist "%_map%.map" (
  echo ERROR: "%_map%.map" not found.
  exit /b 1
)
if not exist "%_geo%.geo" (
  echo ERROR: "%_geo%.geo" not found.
  exit /b 1
)
if not exist "%_flow%.dat" (
  echo ERROR: Flow file "%_flow%.dat" not found.
  exit /b 1
)

::— 3. Copy inputs into Fort files ——
copy "%_map%.map" fort.14
copy "%_geo%.geo" fort.10
copy "%_flow%.dat" fort.15
echo [OK] map, geo and flow fort.14/10/15

::— 4. Excresence run? ——
if /I "%_excres%"=="y" (
  echo WARNING: excres run requested but no excres file name provided; skipping.
)

::— 5. Continuation run? ——
if /I "%_cont%"=="y" (
  if "%_dump%"=="" (
    echo ERROR: continuation run requested but no dump file base name provided.
    exit /b 1
  )
  if not exist "%_dump%.fort52" (
    echo ERROR: Dump file "%_dump%.fort52" not found.
    exit /b 1
  )
  copy "%_dump%.fort11" fort.11
  copy "%_dump%.fort21" fort.21
  copy "%_dump%.fort50" fort.50
  copy "%_dump%.fort51" fort.51
  copy "%_dump%.fort52" fort.52
  copy "%_dump%.fort55" fort.55
  echo [OK] continuation dump fort.11/21/50/51/52/55
)

::— 6. Run solver ——
vfphe.exe
echo [DONE] solver run complete

::— 7. Rename & save outputs ——
move fort.16 "%_geo%%_flow%.flow"
move fort.17 "%_geo%%_flow%.conv"
move fort.22 "%_geo%.mapout"
move fort.18 "%_geo%%_flow%.forces"
move fort.19 "%_geo%%_flow%.cp"
move fort.20 "%_geo%%_flow%.vis"
move fort.24 "%_geo%%_flow%.sum"

::— 8. Save fort-dumps back out ——
copy fort.11 "%_geo%%_flow%.fort11"
copy fort.15 "%_geo%%_flow%.fort15"
copy fort.21 "%_geo%%_flow%.fort21"
copy fort.50 "%_geo%%_flow%.fort50"
copy fort.51 "%_geo%%_flow%.fort51"
copy fort.52 "%_geo%%_flow%.fort52"
copy fort.55 "%_geo%%_flow%.fort55"

::— 9. Wave-drag calc ——
copy fort.70 flow70.dat
copy fort.71 flow71.dat
f137b1.exe
echo [DONE] wave-drag calculation

copy wavedrg73.dat "%_geo%%_flow%wavedrg73.dat"
copy wavedrg74.dat "%_geo%%_flow%wavedrg74.dat"
copy wavedrg75.dat "%_geo%%_flow%wavedrg75.dat"
copy wavedrg76.dat "%_geo%%_flow%wavedrg76.dat"

::— 10. Cleanup ——
del fort.11 fort.15 fort.21 fort.50 fort.51 fort.52 fort.55 fort.70 fort.71 ^
    wavedrg72.dat wavedrg73.dat wavedrg74.dat wavedrg75.dat wavedrg76.dat

echo [ALL DONE]
