
import sys
import VFP_File_Generation_Utils as u

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python your_script.py <argument>")
        sys.exit(1)

    flow_file = sys.argv[1]
    d = sys.argv[2]
    n = sys.argv[3]

    # Pass the argument to run_aoa_generation
    u.run_aoa_generation(flow_file, d, n)

    u.copy_generated_files_to_main_dir()
