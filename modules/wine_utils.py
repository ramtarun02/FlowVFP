import os
import subprocess
import shutil
import platform

class WineUtils:
    """Utility class for Wine operations in Linux containers"""
    
    @staticmethod
    def is_linux():
        """Check if running on Linux"""
        return platform.system().lower() == 'linux'
    
    @staticmethod
    def check_wine_installed():
        """Check if Wine is properly installed"""
        try:
            result = subprocess.run(['wine', '--version'], 
                                  capture_output=True, text=True, timeout=10)
            return result.returncode == 0
        except (subprocess.TimeoutExpired, FileNotFoundError):
            return False
    
    @staticmethod
    def initialize_wine_prefix():
        """Initialize Wine prefix if needed"""
        if not WineUtils.is_linux():
            return True
            
        try:
            # Set WINE prefix
            wine_prefix = os.environ.get('WINEPREFIX', os.path.expanduser('~/.wine'))
            
            if not os.path.exists(wine_prefix):
                print(f"Initializing Wine prefix at {wine_prefix}")
                subprocess.run(['winecfg', '/S'], check=True, timeout=30)
            
            return True
        except Exception as e:
            print(f"Failed to initialize Wine prefix: {e}")
            return False
    
    @staticmethod
    def run_exe_with_wine(exe_path, args=None, cwd=None):
        """Run Windows executable with Wine"""
        if not WineUtils.is_linux():
            # On Windows, run normally
            cmd = [exe_path]
            if args:
                cmd.extend(args)
            return subprocess.Popen(cmd, cwd=cwd, stdout=subprocess.PIPE, 
                                  stderr=subprocess.STDOUT, text=True, 
                                  bufsize=1, universal_newlines=True)
        
        # On Linux, use Wine
        cmd = ['wine', exe_path]
        if args:
            cmd.extend(args)
            
        print(f"Running with Wine: {' '.join(cmd)}")
        return subprocess.Popen(cmd, cwd=cwd, stdout=subprocess.PIPE,
                              stderr=subprocess.STDOUT, text=True,
                              bufsize=1, universal_newlines=True)
    
    @staticmethod
    def run_bat_with_wine(bat_path, args=None, cwd=None):
        """Run Windows batch file with Wine"""
        if not WineUtils.is_linux():
            # On Windows, run normally
            if args:
                cmd = ['cmd', '/c', os.path.basename(bat_path)] + args
            else:
                cmd = ['cmd', '/c', os.path.basename(bat_path)]
            return subprocess.Popen(cmd, cwd=cwd, stdout=subprocess.PIPE,
                                  stderr=subprocess.STDOUT, text=True,
                                  shell=False, bufsize=1, universal_newlines=True)
        
        # On Linux, use Wine with cmd.exe
        cmd = ['wine', 'cmd', '/c', os.path.basename(bat_path)]
        if args:
            cmd.extend(args)
            
        print(f"Running batch file with Wine: {' '.join(cmd)}")
        return subprocess.Popen(cmd, cwd=cwd, stdout=subprocess.PIPE,
                              stderr=subprocess.STDOUT, text=True,
                              bufsize=1, universal_newlines=True)

def copy_files_to_folder(source_folder, destination_folder):
    """Copy files to destination folder - Wine compatible version"""
    try:
        if not os.path.exists(source_folder):
            return f"Source folder does not exist: {source_folder}"
        
        if not os.path.exists(destination_folder):
            os.makedirs(destination_folder)
        
        copied_files = []
        for item in os.listdir(source_folder):
            source_item = os.path.join(source_folder, item)
            destination_item = os.path.join(destination_folder, item)
            
            if os.path.isfile(source_item):
                shutil.copy2(source_item, destination_item)
                copied_files.append(item)
            elif os.path.isdir(source_item):
                shutil.copytree(source_item, destination_item, dirs_exist_ok=True)
                copied_files.append(f"{item}/")
        
        return f"Successfully copied {len(copied_files)} items to {destination_folder}"
        
    except Exception as e:
       return f"Error copying files: {str(e)}"