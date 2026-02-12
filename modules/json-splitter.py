"""
JSON Splitter - Python version for large files
Splits large JSON files by extracting results.wingConfig children into separate files
Usage: python json-splitter.py <input-file.json>
"""

import json
import os
import sys
import re
from pathlib import Path


class LargeJSONSplitter:
    def __init__(self, input_file):
        self.input_file = input_file
        self.output_dir = Path(input_file).parent / 'split-json'
        self.manifest = {
            'mainFile': 'main.json',
            'splitNodes': []
        }
    
    def split(self):
        print(f"Processing {self.input_file}...")
        print("This may take several minutes for large files.\n")
        
        # Create output directory
        self.output_dir.mkdir(exist_ok=True)
        
        # Read file and find wingConfig section
        print("Reading file and locating results.wingConfig...")
        
        with open(self.input_file, 'r', encoding='utf-8') as f:
            # Try to load the JSON
            try:
                data = json.load(f)
                # ASCII-only logging to avoid Windows console encoding issues
                print("OK File loaded successfully")
                if 'results' not in data or 'wingConfig' not in data['results']:
                    print("Error: results.wingConfig not found in JSON structure")
                    return False
                
                wing_config = data['results']['wingConfig']
                keys = list(wing_config.keys())
                
                print(f"OK Found {len(keys)} items in results.wingConfig\n")
                
                # Split each child into its own file
                print("Creating split files...")
                for i, key in enumerate(keys, 1):
                    child_data = wing_config[key]
                    file_name = f"wingConfig-{self.sanitize_filename(key)}.json"
                    file_path = self.output_dir / file_name
                    
                    with open(file_path, 'w', encoding='utf-8') as out_f:
                        json.dump(child_data, out_f, indent=2)
                    
                    self.manifest['splitNodes'].append({
                        'path': f'results.wingConfig.{key}',
                        'file': file_name,
                        'key': key,
                        'size': len(json.dumps(child_data))
                    })
                    
                    print(f"  [{i}/{len(keys)}] Created {file_name}")
                
                # Create main file without wingConfig data
                print("\nCreating main file...")
                data['results']['wingConfig'] = {
                    '_split': True,
                    '_keys': keys
                }
                
                main_file_path = self.output_dir / self.manifest['mainFile']
                with open(main_file_path, 'w', encoding='utf-8') as out_f:
                    json.dump(data, out_f, indent=2)
                
                print(f"OK Created {self.manifest['mainFile']}")
                
                # Save manifest
                manifest_path = self.output_dir / 'manifest.json'
                with open(manifest_path, 'w', encoding='utf-8') as out_f:
                    json.dump(self.manifest, out_f, indent=2)
                
                print(f"OK Created manifest.json")
                
                # Print summary
                print(f"\n{'='*60}")
                print("Split complete!")
                print(f"{'='*60}")
                print(f"Output directory: {self.output_dir}")
                print(f"Main file: {self.manifest['mainFile']}")
                print(f"Split files: {len(self.manifest['splitNodes'])}")
                print(f"Total files: {len(self.manifest['splitNodes']) + 2} (including manifest)")
                print(f"\nTo use in the app:")
                print(f"1. Open index.html in your browser")
                print(f"2. Load {self.output_dir / self.manifest['mainFile']}")
                print(f"3. The app will automatically load child files as you expand nodes")
                
                return True
                
            except MemoryError:
                print("\nWARNING: File too large to load into memory at once.")
                print("Attempting streaming approach...\n")
                return self.split_streaming()
            except json.JSONDecodeError as e:
                print(f"Error: Invalid JSON - {e}")
                return False
    
    def split_streaming(self):
        """
        Streaming approach for extremely large files
        Uses line-by-line reading to extract wingConfig section
        """
        print("Using streaming mode (line-by-line processing)...")
        print("Note: This assumes wingConfig objects are reasonably sized.\n")
        
        in_wing_config = False
        in_child_object = False
        current_key = None
        current_object_lines = []
        brace_count = 0
        wing_config_keys = []
        before_wing_config = []
        after_wing_config = []
        capture_location = 'before'
        
        with open(self.input_file, 'r', encoding='utf-8') as f:
            for line_num, line in enumerate(f, 1):
                if line_num % 100000 == 0:
                    print(f"  Processed {line_num:,} lines...")
                
                # Look for wingConfig start
                if '"wingConfig"' in line and '{' in line and not in_wing_config:
                    in_wing_config = True
                    capture_location = 'wing_config'
                    before_wing_config.append(line.split('"wingConfig"')[0] + '"wingConfig": {\n')
                    before_wing_config.append('    "_split": true,\n')
                    continue
                
                if capture_location == 'before':
                    before_wing_config.append(line)
                elif capture_location == 'after':
                    after_wing_config.append(line)
                elif in_wing_config:
                    # Extract child object keys and data
                    stripped = line.strip()
                    
                    # Check if we're at the end of wingConfig
                    if stripped == '},' or (stripped == '}' and brace_count == 0):
                        in_wing_config = False
                        capture_location = 'after'
                        # Add _keys array to main file
                        keys_json = json.dumps(wing_config_keys)
                        before_wing_config.append(f'    "_keys": {keys_json}\n')
                        before_wing_config.append('  }')
                        if ',' in stripped:
                            before_wing_config.append(',')
                        before_wing_config.append('\n')
                        after_wing_config.append(line.replace('}', '', 1))
                        continue
                    
                    # Extract key name if starting a new object
                    if not in_child_object and '"' in stripped and ':' in stripped and '{' in stripped:
                        match = re.search(r'"([^"]+)"\s*:\s*\{', stripped)
                        if match:
                            current_key = match.group(1)
                            in_child_object = True
                            brace_count = 1
                            current_object_lines = ['{']
                            wing_config_keys.append(current_key)
                            continue
                    
                    if in_child_object:
                        # Track braces to know when object ends
                        brace_count += stripped.count('{') - stripped.count('}')
                        current_object_lines.append(line.rstrip())
                        
                        if brace_count == 0:
                            # Object complete, save it
                            file_name = f"wingConfig-{self.sanitize_filename(current_key)}.json"
                            file_path = self.output_dir / file_name
                            
                            # Join lines and parse to validate
                            try:
                                obj_str = '\n'.join(current_object_lines)
                                obj_data = json.loads(obj_str)
                                
                                with open(file_path, 'w', encoding='utf-8') as out_f:
                                    json.dump(obj_data, out_f, indent=2)
                                
                                self.manifest['splitNodes'].append({
                                    'path': f'results.wingConfig.{current_key}',
                                    'file': file_name,
                                    'key': current_key,
                                    'size': len(obj_str)
                                })
                                
                                print(f"  Extracted {current_key} -> {file_name}")
                                
                            except json.JSONDecodeError as e:
                                print(f"  ⚠ Warning: Failed to parse {current_key}: {e}")
                            
                            in_child_object = False
                            current_object_lines = []
                            current_key = None
        
        # Create main file
        print("\nCreating main file...")
        main_file_path = self.output_dir / self.manifest['mainFile']
        with open(main_file_path, 'w', encoding='utf-8') as out_f:
            out_f.writelines(before_wing_config)
            out_f.writelines(after_wing_config)
        
        # Save manifest
        manifest_path = self.output_dir / 'manifest.json'
        with open(manifest_path, 'w', encoding='utf-8') as out_f:
            json.dump(self.manifest, out_f, indent=2)
        
        print(f"\n{'='*60}")
        print("Streaming split complete!")
        print(f"{'='*60}")
        print(f"Output directory: {self.output_dir}")
        print(f"Files created: {len(self.manifest['splitNodes']) + 2}")
        
        return True
    
    def sanitize_filename(self, name):
        """Convert name to safe filename"""
        return re.sub(r'[^a-z0-9_-]', '_', name.lower())


if __name__ == '__main__':
    if len(sys.argv) < 2:
        input_file = 'CRM-Wing-AR-3p75-a3p75.json'
        if not os.path.exists(input_file):
            print("Usage: python json-splitter.py <input-file.json>")
            sys.exit(1)
    else:
        input_file = sys.argv[1]
    
    if not os.path.exists(input_file):
        print(f"Error: File '{input_file}' not found")
        sys.exit(1)
    
    print("\n" + "="*60)
    print("JSON Splitter - Large File Edition")
    print("="*60 + "\n")
    
    splitter = LargeJSONSplitter(input_file)
    success = splitter.split()
    
    sys.exit(0 if success else 1)
