#!/usr/bin/env python3
"""Create full-frame responsive WebP images from the checked-in JPEG originals.

Run with Python and Pillow: python scripts/build_home_entry_images.py
The original files are never modified; card cropping belongs in the page CSS.
"""

from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "images" / "home-entries"
NAMES = ("photography", "academics", "writing", "projects")
WIDTHS = (480, 960)
QUALITY = 82


def main() -> None:
    for name in NAMES:
        source = OUTPUT / "originals" / f"{name}.jpg"
        with Image.open(source) as original:
            profile = original.info.get("icc_profile")
            image = ImageOps.exif_transpose(original).convert("RGB")
            for width in WIDTHS:
                height = round(image.height * width / image.width)
                resized = image.resize((width, height), Image.Resampling.LANCZOS)
                destination = OUTPUT / f"{name}-{width}.webp"
                options = {"quality": QUALITY, "method": 6}
                if profile:
                    options["icc_profile"] = profile
                resized.save(destination, "WEBP", **options)
                print(
                    f"{destination.relative_to(ROOT)}: {width}x{height}, "
                    f"{destination.stat().st_size:,} bytes"
                )


if __name__ == "__main__":
    main()
