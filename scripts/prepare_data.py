"""Extract supplied inputs and cache clipped public-domain river geometries."""
import ast
import json
from pathlib import Path
import urllib.request
from shapely.geometry import shape, mapping

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
DATA.mkdir(exist_ok=True)
nb = json.loads((ROOT / 'BiyDaalt/Biydaalt.ipynb').read_text())
for cell in nb['cells']:
    if cell['cell_type'] != 'code':
        continue
    try:
        tree = ast.parse(''.join(cell['source']))
    except SyntaxError:
        continue
    for item in tree.body:
        if isinstance(item, ast.Assign) and len(item.targets) == 1 and isinstance(item.targets[0], ast.Name):
            key = item.targets[0].id
            if key in ('CITIES', 'FOREST_ZONES'):
                value = ast.literal_eval(item.value)
                filename = 'cities.json' if key == 'CITIES' else 'forests.json'
                (DATA / filename).write_text(json.dumps(value, ensure_ascii=False, indent=2))
river_file = DATA / 'rivers.geojson'
url = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_rivers_lake_centerlines.geojson'
if not river_file.exists():
    with urllib.request.urlopen(url, timeout=120) as response:
        rivers = json.load(response)
    country = shape(json.loads((ROOT / 'BiyDaalt/data/mongolia_geo.json').read_text())['country'])
    features = []
    for feature in rivers['features']:
        geom = shape(feature['geometry']).intersection(country)
        if not geom.is_empty and geom.length > 0.02:
            features.append({'type': 'Feature', 'properties': {'name': feature['properties'].get('name') or 'Гол', 'source': 'Natural Earth 1:10m'}, 'geometry': mapping(geom)})
    river_file.write_text(json.dumps({'type': 'FeatureCollection', 'features': features}, ensure_ascii=False))
manifest = {
    'geography': 'Supplied Natural Earth 1:10m excerpt; country, 22 admin regions, 14 lakes, 4 named mountain regions',
    'rivers_url': url, 'rivers_license': 'Public domain',
    'forests': 'Inherited hand-drawn approximations; NOT surveyed forest boundaries',
    'cities': 'Inherited 22 approximate urban center coordinates; distances are simulated routes, NOT road survey measurements',
    'routing': 'Metric LAEA grid; strict segment tests; named mountain polygons with explicitly reported local terminal access',
}
(DATA / 'sources.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
print('Cities:', len(json.loads((DATA / 'cities.json').read_text())))
print('Rivers:', len(json.loads(river_file.read_text())['features']))
