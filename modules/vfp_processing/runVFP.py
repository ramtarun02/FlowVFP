import os
import shutil
# import tkinter as tk
# from tkinter import filedialog




def create_batch_file(map_file, geo_file, flow_file, dump_file, exc, cont, dump, sim_folder):
    # Create the batch file contents
    batch_contents = f"""
echo off
title "Viscous Full Potential program"
rem color 9F
:map_input
set _map={map_file}
if not exist %_map%.map (echo file was not found)
if not exist %_map%.map goto :map_input
:geo_input
set _geo={geo_file}
if not exist %_geo%.geo (echo file was not found)
if not exist %_geo%.geo goto :geo_input
:flow_input
set _flow={flow_file}
if not exist %_flow%.dat (echo file was not found)
if not exist %_flow%.dat goto :flow_input
goto :copy_flow
:copy_flow
if not exist %_flow%.dat (echo file was not found)  
if not exist %_flow%.dat goto :flow_input  
copy %_map%.map fort.14
copy %_geo%.geo fort.10
copy %_flow%.dat fort.15
echo 'input files copied'
:excres
set _excres={exc} 
if %_excres%==n (goto cont_run) else (set /p _excresfile=enter excresence file name) 
if not exist %_excresfile%.dat (echo file was not found)
if not exist %_excresfile%.dat goto :excres
copy %_excresfile%.dat excres.dat 
:cont_run
set _contrun={cont} 
if %_contrun%==n (goto run_vfp) else (set _dumpfile={dump}) 
if "%_dumpfile%"=="n" goto dump_filename
copy %_geo%%_flow%.fort11 fort.11 
copy %_geo%%_flow%.fort21 fort.21 
copy %_geo%%_flow%.fort50 fort.50 
copy %_geo%%_flow%.fort51 fort.51 
copy %_geo%%_flow%.fort52 fort.52
copy %_geo%%_flow%.fort55 fort.55
goto run_vfp
:dump_filename
set _dump={dump_file}
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
echo.'start of wave drag calculation using field based method'
:copy wavedrg.dat wavedrg72.dat
copy fort.70 flow70.dat
copy fort.71 flow71.dat
f137b1.exe
echo 'wave drag calculation complete'
copy wavedrg73.dat %_geo%%_flow%wavedrg73.dat
copy wavedrg74.dat %_geo%%_flow%wavedrg74.dat
copy wavedrg75.dat %_geo%%_flow%wavedrg75.dat
copy wavedrg76.dat %_geo%%_flow%wavedrg76.dat
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
 
 """
    
    # Write to the batch file in the VFP folder
    batch_file_path = os.path.join(sim_folder, "run_vfp.bat")
    with open(batch_file_path, "w") as batch_file:
        batch_file.write(batch_contents)


def copy_files_to_folder(source_folder, destination_folder):
    """
    Copies all files from VFP-Solver (vfp-solver) to the simulation_folder.

    :param destination_folder: The path to the folder where files will be copied.
    """
    # source_folder = "./vfp-solver"  # Define the source folder here

    if not os.path.exists(source_folder):
        raise FileNotFoundError(f"Source folder '{source_folder}' does not exist.")

    if not os.path.exists(destination_folder):
        raise FileNotFoundError(f"Destination folder '{destination_folder}' does not exist.")


    for file_name in os.listdir(source_folder):
        source_file = os.path.join(source_folder, file_name)
        destination_file = os.path.join(destination_folder, file_name)

        if os.path.isfile(source_file):  # Only copy files, not directories
            shutil.copy2(source_file, destination_file)

    return (f"All files copied from '{source_folder}' to '{destination_folder}'.")
