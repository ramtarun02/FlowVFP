import subprocess
import sys
import os
import signal


if len(sys.argv) < 2:
    print("Usage: python your_script.py <argument>")
    sys.exit(1)

flow_file = sys.argv[1]
d = sys.argv[2]
n = sys.argv[3]
map = sys.argv[4]
geo = sys.argv[5]

# 1. Run AoA generation script (interactive)
print("=== Step 1: Generating AoA .dat files ===")
subprocess.run(["python", "VFP_File_Generation_Main.py", flow_file, d, n])

# 2. Run VFP solver batch execution (automated loop)
print("\n=== Step 2: Running VFP .bat automation ===")
subprocess.run(["python", "VFP_Run_Main_V3.py", map, geo], creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0)

# 3. Run data extraction from generated .forces and wavedrg files
print("\n=== Step 3: Extracting data and saving CSV ===")
subprocess.run(["python", "VFP_Data_Extraction_Main.py"])
