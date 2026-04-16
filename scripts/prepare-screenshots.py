#!/usr/bin/env python3
"""
prepare-screenshots.py
Resizes extension popup screenshots to 1280x800 (Chrome Web Store requirement)
by centering them on a dark background matching the extension theme.

Usage:
    python3 scripts/prepare-screenshots.py <screenshot1.png> [screenshot2.png ...]

Output:
    store-screenshot-1.png, store-screenshot-2.png, ... in the project root.

Requirements:
    pip3 install Pillow
"""

import sys
from pathlib import Path
from PIL import Image, ImageFilter

CANVAS_W, CANVAS_H = 1280, 800
BG_COLOR = (15, 17, 23)       # --bg: #0f1117
SHADOW_COLOR = (0, 0, 0, 120) # subtle drop shadow under the popup


def prepare(input_path: Path, output_path: Path):
    popup = Image.open(input_path).convert("RGBA")

    # Scale up if the popup is smaller than 40% of canvas height, keep aspect ratio
    max_popup_h = int(CANVAS_H * 0.85)
    max_popup_w = int(CANVAS_W * 0.50)
    scale = min(max_popup_w / popup.width, max_popup_h / popup.height, 1.0)
    new_w = int(popup.width * scale)
    new_h = int(popup.height * scale)
    if scale < 1.0:
        popup = popup.resize((new_w, new_h), Image.LANCZOS)
    else:
        new_w, new_h = popup.width, popup.height

    # Create canvas
    canvas = Image.new("RGB", (CANVAS_W, CANVAS_H), BG_COLOR)

    # Draw a soft shadow behind the popup
    shadow = Image.new("RGBA", (new_w + 40, new_h + 40), (0, 0, 0, 0))
    shadow_rect = Image.new("RGBA", (new_w, new_h), SHADOW_COLOR)
    shadow.paste(shadow_rect, (20, 20))
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=18))

    paste_x = (CANVAS_W - new_w) // 2
    paste_y = (CANVAS_H - new_h) // 2

    canvas.paste(shadow.convert("RGB"), (paste_x - 20, paste_y - 20),
                 mask=shadow.split()[3])
    canvas.paste(popup.convert("RGB"), (paste_x, paste_y),
                 mask=popup.split()[3])

    canvas.save(output_path, "PNG", optimize=True)
    print(f"  Saved {output_path}  ({CANVAS_W}x{CANVAS_H})")


def main():
    inputs = [Path(p) for p in sys.argv[1:]]
    if not inputs:
        print("Usage: python3 scripts/prepare-screenshots.py <screenshot1.png> [screenshot2.png ...]")
        sys.exit(1)

    root = Path(__file__).parent.parent

    for i, path in enumerate(inputs, start=1):
        if not path.exists():
            print(f"  File not found: {path}")
            continue
        out = root / f"store-screenshot-{i}.png"
        print(f"Processing {path.name} ...")
        prepare(path, out)

    print("\nDone. Upload the store-screenshot-*.png files to the Chrome Web Store.")


if __name__ == "__main__":
    main()
