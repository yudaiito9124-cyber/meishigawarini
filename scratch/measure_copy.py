
import shutil
import time
from pathlib import Path
import tempfile

def measure_copy():
    src = Path('scripts/.browser_profile')
    if not src.exists():
        print("Source not found")
        return
    
    start = time.time()
    with tempfile.TemporaryDirectory() as tmp_dir:
        shutil.copytree(src, tmp_dir, dirs_exist_ok=True)
        end = time.time()
        print(f"Copy took: {end - start:.4f}s")

if __name__ == "__main__":
    measure_copy()
