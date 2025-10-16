#Libraries

import os
import glob
import pandas as pd
import VFP_Data_Extraction_Utils as u

if __name__ == '__main__':
    # Prompt user for folder with the .forces files
    script_path = os.path.abspath(__file__)
    folder_path = os.path.dirname(script_path)
    file_paths_forces = glob.glob(os.path.join(folder_path, '*.forces'))
    file_paths_wavedrag = glob.glob(os.path.join(folder_path, '*wavedrg73*'))

    # Map angle of attack to each file
    forces_by_aoa = {}
    for fpath in file_paths_forces:
        aoa = u.extract_aoa_from_forces_filename(fpath)
        if aoa is not None:
            forces_by_aoa[aoa] = fpath
    
    wavedrag_by_aoa = {}
    for wpath in file_paths_wavedrag:
        aoa = u.extract_aoa_from_filename(wpath)
        if aoa is not None:
            wavedrag_by_aoa[aoa] = wpath

    # Match and extract data
    all_data = []
    common_aoas = sorted(set(forces_by_aoa.keys()) & set(wavedrag_by_aoa.keys()))
    for aoa in common_aoas:
        fpath = forces_by_aoa[aoa]
        wpath = wavedrag_by_aoa[aoa]
        data = u.extract_data(fpath, wpath)
        all_data.append(data)

    # Create DataFrame
    df = pd.DataFrame(all_data)
    df['ALPHA'] = pd.to_numeric(df['ALPHA'], errors='coerce')  # Ensure ALPHA is numeric
    df_sorted = df.sort_values(by='ALPHA')                    # Sort numerically
    df_sorted['ALPHA'] = df_sorted['ALPHA'].round(4)          # Optional formatting

    # Save CSV file
    parent_dir = os.path.dirname(script_path)
    if all_data:
        filename = os.path.splitext(os.path.basename(all_data[0]['Filename']))[0]
        filename = filename.split('ma')[0] + 'ma'
    else:
        filename = "Extracted"

    output_csv = os.path.join(parent_dir, filename + '_Data.csv')
    df_sorted.to_csv(output_csv, index=False)

    # Display result
    print(df_sorted.to_string(index=False))
    print(f"\nData saved to {output_csv}")
