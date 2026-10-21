"""Metric least-cost routing with continuous obstacle validation.

Natural Earth mountain regions are broad labels, not DEM-derived slopes. A city
inside one gets an explicit local-access segment to its nearest accessible grid
point; that segment is never described as obstacle-free trunk routing.
"""
from pathlib import Path
import hashlib
import json
import time
import numpy as np
import shapely
from shapely.geometry import shape, mapping, Point, LineString, Polygon
from shapely.ops import unary_union
from pyproj import Transformer, Geod
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra, connected_components
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[1]
GEOD = Geod(ellps='WGS84')


def geodesic_km(coords):
    coords = np.asarray(coords)
    if len(coords) < 2:
        return 0.0
    return float(GEOD.line_length(coords[:, 0], coords[:, 1]) / 1000)


class TerrainRouter:
    VERSION = 'terrain-5-gates'

    def __init__(self, step_km=5.0):
        self.started = time.perf_counter()
        self.step = step_km * 1000
        self.geo = json.loads((ROOT / 'BiyDaalt/data/mongolia_geo.json').read_text())
        self.rivers = json.loads((ROOT / 'data/rivers.geojson').read_text())
        self.forests = json.loads((ROOT / 'data/forests.json').read_text())
        self.forward = Transformer.from_crs('EPSG:4326', '+proj=laea +lat_0=47 +lon_0=104 +datum=WGS84 +units=m', always_xy=True)
        self.inverse = Transformer.from_crs(self.forward.target_crs, 'EPSG:4326', always_xy=True)
        self.project = lambda g: shapely.transform(g, self.forward.transform, interleaved=False)
        self.country = self.project(shape(self.geo['country']))
        self.lakes = unary_union([self.project(shape(g)) for g in self.geo['lakes']]).buffer(1000)
        self.mountains = unary_union([self.project(shape(g)) for g in self.geo['mountains']]).buffer(1000)
        self.river_barrier = unary_union([self.project(shape(f['geometry'])) for f in self.rivers['features']]).buffer(500)
        self.water = unary_union([self.lakes, self.river_barrier])
        self.blocked = unary_union([self.water, self.mountains])
        self.forest = unary_union([self.project(Polygon(g)) for g in self.forests.values()])
        minx, miny, maxx, maxy = self.country.bounds
        xs = np.arange(minx, maxx + self.step, self.step)
        ys = np.arange(miny, maxy + self.step, self.step)
        X, Y = np.meshgrid(xs, ys)
        self.shape = X.shape
        valid = shapely.contains_xy(self.country, X, Y) & ~shapely.intersects_xy(self.blocked, X, Y)
        self.I, self.J = np.nonzero(valid)
        self.xy = np.column_stack((X[valid], Y[valid]))
        self.ids = np.full(X.shape, -1, dtype=int)
        self.ids[valid] = np.arange(len(self.xy))
        self.mult = np.where(shapely.contains_xy(self.forest, self.xy[:, 0], self.xy[:, 1]), 2.5, 1.0)
        self.tree = cKDTree(self.xy)
        rows, cols, weights = [], [], []
        for di, dj in [(0, 1), (1, 0), (1, 1), (1, -1)]:
            ni, nj = self.I + di, self.J + dj
            ok = (ni >= 0) & (ni < len(ys)) & (nj >= 0) & (nj < len(xs))
            a = np.flatnonzero(ok)
            b = self.ids[ni[ok], nj[ok]]
            keep = b >= 0
            a, b = a[keep], b[keep]
            segments = shapely.linestrings(np.stack((self.xy[a], self.xy[b]), axis=1))
            safe = ~shapely.intersects(segments, self.blocked) & shapely.covered_by(segments, self.country)
            a, b = a[safe], b[safe]
            w = np.linalg.norm(self.xy[a] - self.xy[b], axis=1) / 1000 * (self.mult[a] + self.mult[b]) / 2
            rows.extend([a, b]); cols.extend([b, a]); weights.extend([w, w])
        self.grid = coo_matrix((np.concatenate(weights), (np.concatenate(rows), np.concatenate(cols))), shape=(len(self.xy), len(self.xy))).tocsr()
        count, labels = connected_components(self.grid, directed=False)
        # Strict river barriers can partition an entire region. Connect separate
        # components only through a finite set of declared proposed crossings.
        # No gate may cross a lake, a mountain, or the national boundary.
        pairs = self.tree.query_pairs(self.step * 2.1, output_type='ndarray')
        pairs = pairs[labels[pairs[:, 0]] != labels[pairs[:, 1]]]
        options = {}
        if len(pairs):
            segments = shapely.linestrings(self.xy[pairs])
            safe = ~shapely.intersects(segments, unary_union([self.lakes, self.mountains])) & shapely.covered_by(segments, self.country)
            for (a, b), line in zip(pairs[safe], segments[safe]):
                # Only sites with actual river intersection count as crossings.
                if not line.intersects(self.river_barrier):
                    continue
                key = tuple(sorted((int(labels[a]), int(labels[b]))))
                if key not in options or line.length < options[key][2].length:
                    options[key] = (int(a), int(b), line)
        self.gates = {}
        extra_rows, extra_cols, extra_costs = [], [], []
        for a, b, line in options.values():
            key = tuple(sorted((a, b)))
            self.gates[key] = {'id': f'gate-{a}-{b}', 'coords': [list(self.inverse.transform(*self.xy[a])), list(self.inverse.transform(*self.xy[b]))],
                               'length_km': float(line.length / 1000), 'status': 'proposed_not_surveyed'}
            extra_rows.extend([a, b]);extra_cols.extend([b, a])
            # Large explicit crossing premium encourages routing around rivers.
            extra_costs.extend([line.length / 1000 + 100] * 2)
        self.grid += coo_matrix((extra_costs, (extra_rows, extra_cols)), shape=self.grid.shape).tocsr()
        self.gate_geometry = unary_union([LineString([self.forward.transform(*p) for p in g['coords']]) for g in self.gates.values()]).buffer(0.1)
        self.strict_component_count = count
        count, labels = connected_components(self.grid, directed=False)
        # Main land component: disconnected grid slivers cannot support a trunk.
        largest = int(np.argmax(np.bincount(labels)))
        self.main_ids = np.flatnonzero(labels == largest)
        self.main_tree = cKDTree(self.xy[self.main_ids])
        self.component_count = count
        self.lonlat = np.column_stack(self.inverse.transform(self.xy[:, 0], self.xy[:, 1]))
        self.dijkstra_runs = 0
        self.last_dijkstra_ms = 0
        self.build_ms = (time.perf_counter() - self.started) * 1000

    def endpoint(self, city):
        point = Point(self.forward.transform(city['lon'], city['lat']))
        if not self.country.covers(point):
            raise ValueError('Зангилаа Монгол улсын хил дотор байх ёстой.')
        if self.water.intersects(point):
            raise ValueError('Зангилаа нуур эсвэл голын хамгаалалтын зурвас дотор байна.')
        _, indices = self.main_tree.query([point.x, point.y], k=min(1000, len(self.main_ids)))
        in_mountain = self.mountains.intersects(point)
        for index in np.atleast_1d(indices):
            grid_id = int(self.main_ids[index])
            segment = LineString([(point.x, point.y), self.xy[grid_id]])
            if segment.length > 160_000:
                break
            if not self.country.covers(segment) or segment.intersects(self.water):
                continue
            if not in_mountain and segment.intersects(self.mountains):
                continue
            # Mountain cities have a declared, measured local access exception.
            return grid_id, {
                'coords': [[city['lon'], city['lat']], self.lonlat[grid_id].tolist()],
                'length_km': geodesic_km([[city['lon'], city['lat']], self.lonlat[grid_id]]),
                'mountain_access': bool(in_mountain),
            }
        raise ValueError('Энэ цэгт ус/уул огтлохгүй нэвтрэх трасс олдсонгүй. Өөр байршил сонгоно уу.')

    def route_all(self, cities):
        names = list(cities)
        endpoints = {key: self.endpoint(value) for key, value in cities.items()}
        started = time.perf_counter()
        distances, predecessors = dijkstra(self.grid, directed=False, indices=[endpoints[n][0] for n in names], return_predecessors=True)
        self.dijkstra_runs += 1
        self.last_dijkstra_ms = (time.perf_counter() - started) * 1000
        routes = []
        for i, u in enumerate(names):
            for v in names[i + 1:]:
                a, access_a = endpoints[u]
                b, access_b = endpoints[v]
                if not np.isfinite(distances[i, b]):
                    continue
                path = [b]
                while path[-1] != a:
                    parent = int(predecessors[i, path[-1]])
                    if parent < 0 or len(path) > len(self.xy):
                        raise ValueError('Маршрут сэргээхэд холбоогүй хэсэг илэрлээ.')
                    path.append(parent)
                path = path[::-1]
                trunk = self.lonlat[path].tolist()
                crossings = [self.gates[tuple(sorted((a,b)))] for a,b in zip(path,path[1:]) if tuple(sorted((a,b))) in self.gates]
                if len(trunk) == 1:
                    trunk = [trunk[0], trunk[0]]
                # Geometry remains un-simplified: visual shortcuts cannot cross obstacles.
                geometry = [access_a['coords'][0], *trunk, access_b['coords'][0]]
                length = geodesic_km(geometry)
                access_km = access_a['length_km'] + access_b['length_km']
                straight = geodesic_km([geometry[0], geometry[-1]])
                cost = float(distances[i, b]) + access_km * 2.5
                routes.append({
                    'id': '--'.join(sorted((u, v))), 'u': u, 'v': v,
                    'distance_km': length, 'cost_km': cost,
                    'straight_km': straight, 'detour_pct': (length / straight - 1) * 100 if straight else 0,
                    'geometry': geometry, 'trunk': trunk,
                    'access': [access_a, access_b],
                    'river_crossings': crossings,
                    'mountain_access_km': sum(c['length_km'] for c in [access_a, access_b] if c['mountain_access']),
                })
        return routes

    def validate_route(self, route):
        trunk = self.project(LineString(route['trunk']))
        complete = self.project(LineString(route['geometry']))
        return {
            'trunk_clear': not trunk.intersects(self.blocked.difference(self.gate_geometry)),
            'water_clear': not complete.intersects(self.water.difference(self.gate_geometry)),
            'no_lake_crossing': not complete.intersects(self.lakes),
            'inside_country': self.country.buffer(0.01).covers(complete),
            'endpoint_access_declared': all('mountain_access' in a for a in route['access']),
        }

    def layers(self):
        features = []
        for key, kind in [('country', 'country'), ('aimags', 'aimag'), ('lakes', 'lake'), ('mountains', 'mountain')]:
            values = self.geo[key] if isinstance(self.geo[key], list) else [self.geo[key]]
            for i, g in enumerate(values):
                features.append({'type': 'Feature', 'properties': {'kind': kind, 'name': f'{kind} {i+1}'}, 'geometry': g})
        for f in self.rivers['features']:
            features.append({**f, 'properties': {**f['properties'], 'kind': 'river'}})
        for name, polygon in self.forests.items():
            features.append({'type': 'Feature', 'properties': {'kind': 'forest', 'name': name}, 'geometry': mapping(Polygon(polygon))})
        for gate in self.gates.values():
            features.append({'type': 'Feature', 'properties': {'kind':'crossing','name':'Төлөвлөсөн голын гарц',**gate}, 'geometry':{'type':'LineString','coordinates':gate['coords']}})
        return {'type': 'FeatureCollection', 'features': features}

    @staticmethod
    def fingerprint(cities):
        h = hashlib.sha256(TerrainRouter.VERSION.encode() + json.dumps(cities, sort_keys=True).encode())
        for p in [ROOT / 'BiyDaalt/data/mongolia_geo.json', ROOT / 'data/rivers.geojson', ROOT / 'data/forests.json']:
            h.update(p.read_bytes())
        return h.hexdigest()
