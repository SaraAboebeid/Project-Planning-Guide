"""
Download EUBUCCO building data for Sweden
https://eubucco.com/data
"""

import requests
import os
from pathlib import Path
from tqdm import tqdm

# Create download directory
DATA_DIR = Path(__file__).parent / "data" / "eubucco"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# EUBUCCO v0.1 Sweden data
# The data is hosted on eubucco.com but requires checking the actual download URL
# Alternative: Direct download from GitHub releases or Zenodo

SWEDEN_FILES = [
    {
        "name": "v0_1-SWE.gpkg",
        "description": "Sweden buildings GeoPackage",
        # URL needs to be verified from eubucco.com/data
        "url": "https://eubucco.com/data/v0.1/v0_1-SWE.gpkg",
        "size_estimate_mb": 500  # Estimated size
    }
]

def download_file(url: str, destination: Path, description: str):
    """Download file with progress bar"""
    print(f"\nDownloading: {description}")
    print(f"URL: {url}")
    print(f"Destination: {destination}")
    
    try:
        # Send HEAD request to get file size
        response = requests.head(url, allow_redirects=True, timeout=10)
        total_size = int(response.headers.get('content-length', 0))
        
        if total_size == 0:
            print(f"Warning: Could not determine file size")
        else:
            print(f"File size: {total_size / (1024*1024):.1f} MB")
        
        # Check if file already exists
        if destination.exists():
            existing_size = destination.stat().st_size
            if existing_size == total_size:
                print(f"✓ File already downloaded: {destination.name}")
                return True
            else:
                print(f"Resuming download (existing: {existing_size / (1024*1024):.1f} MB)")
        
        # Download with progress bar
        response = requests.get(url, stream=True, timeout=30)
        response.raise_for_status()
        
        with open(destination, 'wb') as f, tqdm(
            total=total_size,
            unit='B',
            unit_scale=True,
            unit_divisor=1024,
            desc=destination.name
        ) as pbar:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
                pbar.update(len(chunk))
        
        print(f"✓ Downloaded successfully: {destination.name}")
        return True
        
    except requests.exceptions.RequestException as e:
        print(f"✗ Download failed: {e}")
        return False

def main():
    """Main download function"""
    print("=" * 60)
    print("EUBUCCO Sweden Building Data Downloader")
    print("=" * 60)
    
    # Note: The actual download URLs need to be verified
    # EUBUCCO data might require:
    # 1. Visiting https://eubucco.com/data
    # 2. Selecting Sweden from the map or country list
    # 3. Getting the actual download link
    
    print("\n⚠️  IMPORTANT: Direct download URLs need verification")
    print("Please visit: https://eubucco.com/data")
    print("Select 'Sweden' to get the actual download link")
    print("\nAlternative: Download from Zenodo")
    print("https://zenodo.org/record/7225259")
    print("\nOnce you have the correct URL, update this script.")
    
    # Try to download (will likely fail with placeholder URL)
    for file_info in SWEDEN_FILES:
        dest_path = DATA_DIR / file_info["name"]
        success = download_file(
            file_info["url"],
            dest_path,
            file_info["description"]
        )
        if not success:
            print(f"\n⚠️  Could not download {file_info['name']}")
            print("Please:")
            print("1. Visit https://eubucco.com/data")
            print("2. Find the Sweden download link")
            print(f"3. Download manually to: {dest_path}")

if __name__ == "__main__":
    # Check for required packages
    try:
        import requests
        import tqdm
    except ImportError:
        print("Installing required packages...")
        import subprocess
        subprocess.check_call(["pip", "install", "requests", "tqdm"])
        import requests
        from tqdm import tqdm
    
    main()
