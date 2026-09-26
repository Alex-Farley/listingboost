"""Regenerates the small, real image files used by upload validation tests.

Run: python3 scripts/generate-image-fixtures.py  (requires Pillow)
"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "tests" / "support" / "fixtures" / "images"
OUT.mkdir(parents=True, exist_ok=True)


def scene(width: int, height: int) -> Image.Image:
    image = Image.new("RGB", (width, height), (232, 226, 214))
    draw = ImageDraw.Draw(image)
    for y in range(height):
        shade = 180 + int(60 * y / height)
        draw.line([(0, y), (width, y)], fill=(shade, shade - 10, shade - 25))
    draw.rectangle([width // 4, height // 3, 3 * width // 4, height - 40], fill=(120, 96, 80))
    draw.rectangle([width // 2 - 40, height // 2, width // 2 + 40, height - 40], fill=(60, 50, 45))
    return image


photo = scene(800, 600)
photo.save(OUT / "photo-800x600.jpg", "JPEG", quality=80)
photo.save(OUT / "photo-800x600-progressive.jpg", "JPEG", quality=80, progressive=True)
photo.save(OUT / "photo-800x600.png", "PNG", optimize=True)
photo.save(OUT / "photo-800x600.webp", "WEBP", quality=80)
photo.save(OUT / "photo-800x600-lossless.webp", "WEBP", lossless=True)
scene(1080, 1350).save(OUT / "photo-1080x1350.jpg", "JPEG", quality=75)
scene(300, 200).save(OUT / "too-small-300x200.jpg", "JPEG", quality=80)
photo.save(OUT / "photo.gif", "GIF")
Image.new("L", (8200, 5000), 0).save(OUT / "too-many-pixels-8200x5000.png", "PNG", optimize=True)
(OUT / "drawing.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><script>alert(1)</script></svg>')
