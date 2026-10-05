# Synthetic, photo-like test images (gradients plus noise and edges), encoded as HEIC.
import sys, random
from PIL import Image, ImageDraw, ImageFilter
import pillow_heif
pillow_heif.register_heif_opener()
def photo(w, h):
    img = Image.radial_gradient("L").resize((w, h)).convert("RGB")
    d = ImageDraw.Draw(img)
    rnd = random.Random(1)
    for _ in range(400):
        x, y = rnd.randrange(w), rnd.randrange(h)
        d.rectangle([x, y, x + rnd.randrange(20, w // 6), y + rnd.randrange(20, h // 6)], fill=(rnd.randrange(256), rnd.randrange(256), rnd.randrange(256)))
    noise = Image.effect_noise((w, h), 40).convert("RGB")
    return Image.blend(img, noise, 0.15).filter(ImageFilter.SMOOTH)
for name, (w, h) in {"iphone-12mp.heic": (4032, 3024), "iphone-48mp.heic": (8064, 6048)}.items():
    photo(w, h).save(name, quality=80)
    print(name, w, h)
print(pillow_heif.libheif_info())
