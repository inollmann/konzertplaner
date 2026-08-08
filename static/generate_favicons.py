#!/usr/bin/env python3
"""
Generate favicons from a single source image.
Converts a PNG of arbitrary size into the required favicon formats.
"""

import os
import sys

from PIL import Image

# Define required icon sizes for different use cases
ICONS = {
    "icon-32x32.png": [(32, 32)],
    "icon-180x180.png": [(180, 180)],
    "icon-192x192.png": [(192, 192)],
    "icon-512x512.png": [(512, 512)],
    "favicon.ico": [(16, 16), (32, 32), (48, 48), (64, 64)],
}


def generate_favicons(source_path: str, output_dir: str = ".") -> None:
    """
    Generate all favicon formats from a source image.

    Args:
        source_path: Path to the source PNG image
        output_dir: Directory to save generated icons (default: current directory)
    """
    if not os.path.exists(source_path):
        print(f"Error: Source file '{source_path}' not found.")
        sys.exit(1)

    # Open and convert source image to RGBA (supports transparency)
    img = Image.open(source_path)
    img = img.convert("RGBA")

    # Ensure source has reasonable size for generating all icons
    min_size = 512
    if img.width < min_size or img.height < min_size:
        print(f"Warning: Source image is smaller than {min_size}x{min_size}.")
        print("For best results, use a source image of at least 512x512 pixels.")
        # Still try to generate, but scale up if needed
        if img.width < min_size or img.height < min_size:
            new_size = (max(min_size, img.width), max(min_size, img.height))
            print(f"Scaling up to {new_size[0]}x{new_size[1]}...")
            img = img.resize(new_size, Image.Resampling.LANCZOS)

    for filename, sizes in ICONS.items():
        output_path = os.path.join(output_dir, filename)
        print(f"Generating {filename}...")

        if filename.endswith(".ico"):
            # For ICO files, create a multi-resolution icon
            icons_to_save = []
            for size in sizes:
                resized = img.resize(size, Image.Resampling.LANCZOS)
                icons_to_save.append(resized)

            # Save multi-resolution ICO
            # Note: Pillow's ICO saving is limited, save first size as fallback
            if icons_to_save:
                icons_to_save[0].save(output_path, format="ICO", sizes=sizes)
        else:
            # For PNG files, create single size icon
            for size in sizes:
                resized = img.resize(size, Image.Resampling.LANCZOS)
                resized.save(output_path, format="PNG")

        print(f"  Created: {output_path}")

    print("\nFavicon generation complete!")
    print("\nAdd these links to your HTML <head>:")
    print('  <link rel="icon" type="image/png" href="/icon-32x32.png">')
    print('  <link rel="apple-touch-icon" sizes="180x180" href="/icon-180x180.png">')
    print('  <link rel="icon" type="image/png" sizes="192x192" href="/icon-192x192.png">')
    print('  <link rel="icon" type="image/png" sizes="512x512" href="/icon-512x512.png">')
    print('  <link rel="shortcut icon" href="/favicon.ico">')


def main():
    if len(sys.argv) < 2:
        print("Usage: python generate_favicons.py <source_image.png> [output_directory]")
        print("Example: python generate_favicons.py icon-512.png ./static")
        sys.exit(1)

    source_path = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else "."

    generate_favicons(source_path, output_dir)


if __name__ == "__main__":
    main()
