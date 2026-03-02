import pandas as pd
import re

def extract_tables_from_forces_file(forces_file_path):
    # Read the file lines
    with open(forces_file_path, 'r') as f:
        lines = [line.strip() for line in f if line.strip()]
    
    # Identify table headers
    table_starts = [i for i, line in enumerate(lines) if line.startswith("J") or line.startswith("J-")]
    
    dataframes = []
    for i, start_idx in enumerate(table_starts):
        header = re.sub(r'\s+', ',', lines[start_idx].replace("(", "").replace(")", ""))
        data_start = start_idx + 1

        # Determine where the next table (or file end) starts
        next_table_start = table_starts[i+1] if i + 1 < len(table_starts) else len(lines)
        
        # Extract data rows
        data_rows = [re.sub(r'\s+', ',', line) for line in lines[data_start:next_table_start] if re.match(r'^\d+', line)]
        
        # Build dataframe if data exists
        if data_rows:
            df = pd.DataFrame([row.split(',') for row in data_rows], columns=header.split(','))
            dataframes.append(df)
    
    return dataframes

# Example wrapper to use interactively
def main():
    import os
    forces_file_path = input("Enter the absolute path to the .forces file: ").strip() #Enter the absolute path here
    if not forces_file_path.endswith(".forces"):
        print("Error: The file must have a .forces extension.")
        return

    dataframes = extract_tables_from_forces_file(forces_file_path)

    base_filename = os.path.splitext(os.path.basename(forces_file_path))[0]
    output_path = os.path.join(os.path.dirname(forces_file_path), base_filename + "_Table.csv")

    # Combine and save all tables with separation lines
    with open(output_path, 'w') as f:
        for i, df in enumerate(dataframes):
            f.write(f"# Table {i+1}\n")
            df.to_csv(f, index=False)
            f.write("\n")

    print(f"Data extracted and saved to: {output_path}")

main()

