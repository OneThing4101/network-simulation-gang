"""Crop a Natural Earth raster (plain lat/lon, world extent) to Mongolia, mask it by the country border,
and save frontend/public/relief.webp (alpha: 1 inside Mongolia, faint and fading outside).

Usage: python scripts/make_relief.py path/to/GRAY_50M_SR_W.tif [--scale 2] [--light 0.55]
--light blends the relief toward white (0 = untouched, 1 = white) so a grayscale raster reads as a quiet backdrop.
The output box must match RELIEF_BOUNDS in frontend/src/components/GeoMap.jsx.
"""
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

Image.MAX_IMAGE_PIXELS = None
BOX = (87.0, 41.0, 120.5, 52.5)  # lon_min, lat_min, lon_max, lat_max
ROOT = Path(__file__).resolve().parents[1]

src = Path(sys.argv[1])
scale = float(sys.argv[sys.argv.index('--scale') + 1]) if '--scale' in sys.argv else 1.0
img = Image.open(src)
w, h = img.size
crop = img.crop((round((BOX[0] + 180) / 360 * w), round((90 - BOX[3]) / 180 * h), round((BOX[2] + 180) / 360 * w), round((90 - BOX[1]) / 180 * h))).convert('RGB')
if scale != 1:
    crop = crop.resize((round(crop.width * scale), round(crop.height * scale)), Image.LANCZOS)
light = float(sys.argv[sys.argv.index('--light') + 1]) if '--light' in sys.argv else 0.0
if light:
    crop = Image.blend(crop, Image.new('RGB', crop.size, (255, 255, 255)), light)
    # Slight cool tint so the gray relief sits with the ink/paper palette.
    r, g, b = crop.split()
    crop = Image.merge('RGB', (r.point(lambda v: int(v * .965)), g.point(lambda v: int(v * .985)), b))
cw, ch = crop.size
to_px = lambda lon, lat: ((lon - BOX[0]) / (BOX[2] - BOX[0]) * cw, (BOX[3] - lat) / (BOX[3] - BOX[1]) * ch)

# Alpha: full inside the border, 35% just outside, fading to 0 at the crop edge.
geo = json.load(open(ROOT / 'BiyDaalt/data/mongolia_geo.json'))
country = geo['country']
rings = country['coordinates'] if country['type'] == 'Polygon' else [r for poly in country['coordinates'] for r in poly]
inside = Image.new('L', (cw, ch), 0)
d = ImageDraw.Draw(inside)
for ring in rings:
    d.polygon([to_px(lon, lat) for lon, lat in ring], fill=255)
inside = inside.filter(ImageFilter.GaussianBlur(3))
edge = Image.new('L', (cw, ch), 0)
d = ImageDraw.Draw(edge)
margin = int(min(cw, ch) * .12)
for i in range(margin):  # linear ramp from 0 at the edge to 90 (35%) inward
    v = int(90 * i / margin)
    d.rectangle((i, i, cw - 1 - i, ch - 1 - i), outline=v)
d.rectangle((margin, margin, cw - 1 - margin, ch - 1 - margin), fill=90)
alpha = Image.eval(Image.composite(Image.new('L', (cw, ch), 255), edge, inside), lambda v: v)
crop.putalpha(alpha)
out = ROOT / 'frontend/public/relief.webp'
crop.save(out, 'WEBP', quality=84, method=6)
(ROOT / 'frontend/public/relief.jpg').unlink(missing_ok=True)
print(f'{src.name}: {w}x{h} -> {cw}x{ch}, {out.stat().st_size // 1024} KB')
