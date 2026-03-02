echo off
rem set PATH=C:\Program Files (x86)\mingw-w64\i686-8.1.0-posix-dwarf-rt_v6-rev0\mingw32\bin;%PATH%
rem set PATH=C:\Program Files\gfortran\bin;%PATH%
rem echo %PATH%
rem cd "C:\Program Files\gfortran\bin"echo off
title "Viscous Full Potential program" 
color 9F
:map_input
set /p _map=enter map file name 
if not exist %_map%.map (echo file was not found)  
if not exist %_map%.map goto :map_input  
:geo_input
set /p _geo=enter geometry file name  
if not exist %_geo%.geo (echo file was not found)  
if not exist %_geo%.geo goto :geo_input  
:flow_input
set /p _flow=enter flow file name or return to generate file || set _flow=nofile
if "%_flow%"=="nofile" goto :noflow_file
goto :copy_flow
:noflow_file
echo 'generate flow input file'
set /p _fuse=type y for fuselage present or n for not 
if "%_fuse%"=="y" goto :fuse_present
echo 'generate flow data for wing alone case'
visflow.exe
set /p _flow=enter flow file name
copy VISFLOW.DAT %_flow%.dat
echo 'wing alone flow data file generated'
goto :copy_flow
:fuse_present
echo 'generate flow data wing fuselage case'
echo 'fuselage disturbance Mach number based on ESDU 10014'
copy %_geo%.geo geo.dat
vfpfusegenv2.exe
vfptvkbodyv8.exe
del geo.dat
set /p _flow=enter flow file name 
copy FLOWdmmean.dat %_flow%.dat
echo 'wing body flow data file generated'
:copy_flow
if not exist %_flow%.dat (echo file was not found)  
if not exist %_flow%.dat goto :flow_input  
copy %_map%.map fort.14
copy %_geo%.geo fort.10
copy %_flow%.dat fort.15
echo 'input files copied'
pause
:excres
set /p _excres=is this an excrescence run type y for yes or n for no 
if "%_excres%"=="n" goto cont_run
set /p _excresfile=enter excresence file name 
if not exist %_excresfile%.dat (echo file was not found)
if not exist %_excresfile%.dat goto :excres
copy %_excresfile%.dat excres.dat 
:cont_run
set /p _contrun=is this a continuation run type y for yes or n for no 
if "%_contrun%"=="n" goto run_vfp
set /p _dumpfile=is this a continuation run at the same Mach and alpha type y for yes or n for no 
if "%_dumpfile%"=="n" goto dump_filename
copy %_geo%%_flow%.fort11 fort.11 
copy %_geo%%_flow%.fort21 fort.21 
copy %_geo%%_flow%.fort50 fort.50 
copy %_geo%%_flow%.fort51 fort.51 
copy %_geo%%_flow%.fort52 fort.52
copy %_geo%%_flow%.fort55 fort.55
goto run_vfp
:dump_filename
set /p _dump=enter dump file name 
if not exist %_dump%.fort52 (echo file was not found)  
if not exist %_dump%.fort52 goto :dump_filename  
copy %_dump%.fort11 fort.11 
copy %_dump%.fort21 fort.21 
copy %_dump%.fort50 fort.50 
copy %_dump%.fort51 fort.51 
copy %_dump%.fort52 fort.52
copy %_dump%.fort55 fort.55
echo 'flow dump files found and copied
:run_vfp
vfphe.exe
echo 'mapflow complete starting to copy and tidy vfp files'
move fort.16 %_geo%%_flow%.flow
move fort.17 %_geo%%_flow%.conv
move fort.22 %_geo%.mapout
move fort.18 %_geo%%_flow%.forces
move fort.19 %_geo%%_flow%.cp
move fort.20 %_geo%%_flow%.vis
move fort.24 %_geo%%_flow%.sum
echo 'renaming flow dump files'
copy fort.11 %_geo%%_flow%.fort11
copy fort.15 %_geo%%_flow%.fort15
copy fort.21 %_geo%%_flow%.fort21
copy fort.50 %_geo%%_flow%.fort50
copy fort.51 %_geo%%_flow%.fort51
copy fort.52 %_geo%%_flow%.fort52
copy fort.55 %_geo%%_flow%.fort55
pause
echo.'start of wave drag calculation using field based method'
:copy wavedrg.dat wavedrg72.dat
copy fort.70 flow70.dat
copy fort.71 flow71.dat
pause
f137b1.exe
echo 'wave drag calculation complete'
copy wavedrg73.dat %_geo%%_flow%wavedrg73.dat
copy wavedrg74.dat %_geo%%_flow%wavedrg74.dat
copy wavedrg75.dat %_geo%%_flow%wavedrg75.dat
copy wavedrg76.dat %_geo%%_flow%wavedrg76.dat
pause
del fort.11
del fort.15
del fort.21
del fort.50
del fort.51
del fort.52
del fort.55
del fort.70
del fort.71
del wavedrg72.dat
del wavedrg73.dat
del wavedrg74.dat
del wavedrg75.dat
del wavedrg76.dat
echo 'files moved and tidied'
pause
