"""Geographic common-risk (shared-risk) analysis in projected metric space.

The engine proves logical 2-edge connectivity: no single logical cable failure
disconnects the graph.  That proof says nothing about geography.  Two
"independent" cables can run through the same valley, cross the same river at
the same proposed gate and share one trench, so a single excavation removes
both and the protected network still fails.

This module models that second question.  Every route is projected into the
terrain grid's own equal-area metric CRS, given a fixed-width corridor, and
compared against every other route.  The result is a common-risk indicator for
engineering review.  It is a model, not a right-of-way survey and not a
natural-hazard forecast.
"""
from __future__ import annotations

import numpy as np
import networkx as nx
import shapely
from pyproj import Transformer
from scipy.spatial import cKDTree
from shapely import STRtree

SOURCE_CRS = 'EPSG:4326'
PROJECTION = '+proj=laea +lat_0=47 +lon_0=104 +datum=WGS84 +units=m'

# Terrain-grid vertices are dense but collinear; dropping them keeps the route
# length identical to the nanometre while cutting the buffer cost fivefold.
VERTEX_TOLERANCE_M = 1.0

# A crossing and a shared corridor both put one route inside the other's
# buffer, so proximity alone would call every crossing a common risk. The two
# are told apart by direction: shared means the two run alongside each other.
SAMPLE_KM = 2.0
PARALLEL_ANGLE_DEG = 45.0

CORRIDOR_POLICY = {
    'title': 'Географийн нийтлэг хамгаалалтын шинжилгээ (SRLG)',
    'buffer_km': 5.0,
    'min_overlap_km': 0.5,
    'min_parallel_km': 5.0,
    'parallel_angle_deg': PARALLEL_ANGLE_DEG,
    'projection': PROJECTION,
    'method': (
        'Тухайн кабелийн бүх геометрийг тойрнын газрын зүүсний координаттай тэнцэтгэлд дээр төсөөж, '
        'зам дагуу тогтмол өргөнтэй шугаман коридор үүсгэнэ. Давхцлыг хоёр янзаар хэмжинэ. '
        'Ойртолцлын урт нь нэг кабелийн хэсэг өөрийн хөрш кабелийн коридорт орсон урт. '
        'Зэрэгцээ урт нь мөн тэр хэсэг дээрх хоёр кабелийн чиглэл зөрөөтэй биш буюу нэгэн зэрэг '
        'зэрэгцээ явж байгаа урт. Хоёр кабель нэг дээр огтлолцсон бол зэрэгцээ урт нь тэг байна, '
        'учир нь огтлолцол нь нийтлэг хамгаалалт биш. Нийтлэг хамгаалалтын бүлэг нь зэрэгцээ '
        'уртаар үүсэх бөгөөд логик 2-ирмэгт холбоо байгаа нь географийн байдлыг баталгаажуулахгүй: '
        'хоёр кабель нэг хөнжөөр, нэг голоор, нэг траншеар дайрдаг байж болно.'
    ),
    'limitations': [
        'Коридор нь тойрнын сүлжээний дээрх талбайг дээрх топоёр үүсэх модель; баримт дадгаар хэмжсэн '
        'баталгаат хувьчлалын зурвас биш.',
        'Голын гарц, уулын төвүүр болон тохиолдлын хариуцлагын шугамыг ялгах арга зүйгүй; нэг гарц дээрх '
        'хоёр кабелийг ялгаж чадахгүй.',
        'Бодит ачаалал, хөрөнгийн хөвлэлт, засварын түүх зэрэг огт ашиглагдахгүй.',
        '5 км-ийн коридор нь тойрнын сүлжээний 5 км-ийн алхамтай тэнцүү тул зэрэгцээ мөрүүдийн хоорондох '
        'зайг яг хилээр нь ялгаж чадахгүй.',
        'Чиглэл нь 2 км-ийн алхамтай дээжин дээр үнэлэгдэх тул эргэлзээтэй трассын олон өнцөгт '
        'хэмжилж авах урт нь үнэлгээгээс бага байж болно.',
        'Хөрс, усны эрэмбээр эсвэл барилгын дотор ойролцоо байрлах трассыг ялгаж чадахгүй.',
        'Дагалж дагуух тогтмол зай болон зэрэгцээх кабелийн хоорондох зайг хэмжээгүй.',
    ],
}


class CorridorAnalyzer:
    def __init__(self, routes, buffer_km: float = 5.0):
        self.buffer_km = float(buffer_km)
        self.policy = CORRIDOR_POLICY
        self._forward = Transformer.from_crs(SOURCE_CRS, PROJECTION, always_xy=True)
        self._ids = []
        lines = []
        for route in routes:
            geometry = route.get('geometry')
            if not geometry or len(geometry) < 2:
                continue
            coords = np.asarray(geometry, dtype=float)
            x, y = self._forward.transform(coords[:, 0], coords[:, 1])
            lines.append(shapely.linestrings(np.stack((x, y), axis=1)))
            self._ids.append(route['id'])
        self._lines = shapely.simplify(np.array(lines, dtype=object), VERTEX_TOLERANCE_M)
        self._lengths = shapely.length(self._lines) / 1000.0
        self._index = {key: position for position, key in enumerate(self._ids)}
        self._stride = len(self._ids) + 1
        self._line_tree = STRtree(self._lines)
        self._crossing = None
        self._corridors = {}
        self._tables = {}
        self._groups_cache = {}
        self._samples = {}
        self._trees = {}

    def _subset(self, edge_ids):
        if edge_ids is None:
            return set(self._ids)
        wanted = set()
        for edge_id in edge_ids:
            if edge_id not in self._index:
                raise ValueError(f'Кабелийн ID олдсонгүй: {edge_id}')
            wanted.add(edge_id)
        return wanted

    def _corridor(self, buffer_km):
        if buffer_km not in self._corridors:
            bands = shapely.buffer(self._lines, buffer_km * 1000.0, cap_style=2)
            self._corridors[buffer_km] = (bands, STRtree(bands))
        return self._corridors[buffer_km]

    def _sample(self, position):
        """Uniform samples of one route, each with the local heading."""
        cached = self._samples.get(position)
        if cached is not None:
            return cached
        line = self._lines[position]
        length_m = float(shapely.length(line))
        spacing = SAMPLE_KM * 1000.0
        count = max(2, int(length_m / spacing) + 1)
        distances = np.linspace(0.0, length_m, count)
        points = shapely.get_coordinates(shapely.line_interpolate_point(line, distances))
        ahead = np.roll(points, -1, axis=0)
        behind = np.roll(points, 1, axis=0)
        ahead[-1] = points[-1]
        behind[0] = points[0]
        heading = np.degrees(np.arctan2(ahead[:, 1] - behind[:, 1], ahead[:, 0] - behind[:, 0]))
        sample = (points, np.mod(heading, 180.0), length_m / count)
        self._samples[position] = sample
        return sample

    def _tree(self, position):
        tree = self._trees.get(position)
        if tree is None:
            points = self._sample(position)[0]
            tree = cKDTree(points)
            self._trees[position] = tree
        return tree

    def _parallel_km(self, first, second, buffer_km):
        """Length of the first route that runs alongside the second one.

        Both routes are sampled; a sample of the first counts as shared when it
        lies inside the corridor of the second AND the two headings agree. A
        crossing therefore contributes nothing, which is the whole point.
        """
        points_a, heading_a, step_a = self._sample(first)
        points_b, heading_b, _ = self._sample(second)
        if len(points_b) < 2:
            return 0.0
        distance, index = self._tree(second).query(points_a, k=1)
        difference = np.abs(heading_a - heading_b[index])
        difference = np.minimum(difference, 180.0 - difference)
        shared = (distance <= buffer_km * 1000.0) & (difference <= PARALLEL_ANGLE_DEG)
        return float(shared.sum() * step_a) / 1000.0

    def _table(self, buffer_km, wanted=None):
        key = (buffer_km, None if wanted is None else tuple(sorted(wanted)))
        if key in self._tables:
            return self._tables[key]
        bands, tree = self._corridor(buffer_km)
        hit = tree.query(self._lines, predicate='intersects')
        table = {}
        if len(hit[0]):
            low = np.minimum(hit[0], hit[1])
            high = np.maximum(hit[0], hit[1])
            unique = np.unique(np.stack((low, high)), axis=1)
            first, second = unique[0], unique[1]
            distinct = first != second
            first, second = first[distinct], second[distinct]
            if wanted is not None:
                positions = np.array([self._index[edge] for edge in wanted], dtype=int)
                inside = np.isin(first, positions) & np.isin(second, positions)
                first, second = first[inside], second[inside]
            if len(first):
                shorter = np.where(self._lengths[first] <= self._lengths[second], first, second)
                longer = np.where(self._lengths[first] <= self._lengths[second], second, first)
                shared = shapely.length(shapely.intersection(self._lines[shorter], bands[longer]))
                gap = self._separation(first, second)
                for position in range(len(first)):
                    if shared[position] <= 0:
                        continue
                    # The pair key is ordered by id, not by route index, so a
                    # caller can look a pair up from two ids in any order.
                    a_id, b_id = sorted((self._ids[first[position]], self._ids[second[position]]))
                    base = float(min(self._lengths[first[position]], self._lengths[second[position]]))
                    proximity = float(shared[position]) / 1000.0
                    # Sampling can overshoot the exact intersection by a metre;
                    # running alongside is by definition inside the corridor.
                    parallel = min(self._parallel_km(int(shorter[position]), int(longer[position]), buffer_km), proximity)
                    table[(a_id, b_id)] = {
                        'a': a_id, 'b': b_id,
                        'overlap_km': proximity,
                        'parallel_km': parallel,
                        'coverage_pct': proximity / base * 100.0 if base else 0.0,
                        'separation_km': float(gap[position]) / 1000.0,
                    }
        ordered = sorted(table.values(), key=lambda pair: (-pair['parallel_km'], -pair['overlap_km'], pair['a'], pair['b']))
        self._tables[key] = (table, ordered)
        return table, ordered

    def _separation(self, first, second):
        if self._crossing is None:
            crossing = self._line_tree.query(self._lines, predicate='intersects')
            self._crossing = np.unique(np.minimum(crossing[0], crossing[1]) * self._stride
                                       + np.maximum(crossing[0], crossing[1]))
        touching = np.isin(first * self._stride + second, self._crossing)
        distance = np.zeros(len(first))
        apart = ~touching
        if apart.any():
            distance[apart] = shapely.distance(self._lines[first[apart]], self._lines[second[apart]])
        return distance

    def overlaps(self, edge_ids=None) -> list[dict]:
        wanted = self._subset(edge_ids)
        table, ordered = self._table(self.buffer_km, None if edge_ids is None else wanted)
        return list(ordered)

    def groups(self, edge_ids=None, min_parallel_km: float = None) -> list[dict]:
        wanted = self._subset(edge_ids)
        threshold = CORRIDOR_POLICY['min_parallel_km'] if min_parallel_km is None else float(min_parallel_km)
        return self._groups_at(self.buffer_km, wanted, threshold)

    def _groups_at(self, buffer_km, wanted, min_parallel_km):
        key = (buffer_km, round(float(min_parallel_km), 6), tuple(sorted(wanted)))
        if key in self._groups_cache:
            return self._groups_cache[key]
        table, _ = self._table(buffer_km, wanted)
        graph = nx.Graph()
        graph.add_nodes_from(wanted)
        for pair in table.values():
            if pair['parallel_km'] > min_parallel_km:
                graph.add_edge(pair['a'], pair['b'])
        components = [sorted(component) for component in nx.connected_components(graph) if len(component) > 1]
        components.sort(key=lambda members: (-len(members), members[0]))
        groups = []
        for number, members in enumerate(components, start=1):
            member_set = set(members)
            inner = [pair for pair in table.values() if pair['a'] in member_set and pair['b'] in member_set]
            shared = sum(pair['parallel_km'] for pair in inner)
            longest = max((pair['parallel_km'] for pair in inner), default=0.0)
            groups.append({
                'id': f'srlg-{number}',
                'edge_ids': members,
                'overlap_km': shared,
                'description': (f'{len(members)} кабель {shared:.1f} км уртаар зэрэгцээ явж байна '
                                f'(хамгийн их зэрэгцээ урт {longest:.1f} км). Эдгээрийг нэгэн зэрэг '
                                f'гасгаж болно.'),
            })
        self._groups_cache[key] = groups
        return groups

    def corridor_of(self, edge_id: str, edge_ids=None) -> list[str]:
        if edge_id not in self._index:
            raise ValueError(f'Кабелийн ID олдсонгүй: {edge_id}')
        wanted = self._subset(edge_ids)
        threshold = CORRIDOR_POLICY['min_parallel_km']
        partners = []
        for pair in self._table(self.buffer_km, wanted)[0].values():
            if pair['parallel_km'] <= threshold:
                continue
            if pair['a'] == edge_id:
                partners.append(pair['b'])
            elif pair['b'] == edge_id:
                partners.append(pair['a'])
        return sorted(partners)

    def impact(self, lat: float, lon: float, radius_km: float,
               edge_ids=None, buffer_km: float | None = None) -> dict:
        width = self.buffer_km if buffer_km is None else float(buffer_km)
        wanted = self._subset(edge_ids)
        x, y = self._forward.transform(lon, lat)
        footprint = shapely.Point(x, y).buffer(radius_km * 1000.0)
        touching = shapely.intersects(self._lines, footprint)
        direct = [self._ids[position] for position in np.nonzero(touching)[0] if self._ids[position] in wanted]
        groups = self._groups_at(width, wanted, CORRIDOR_POLICY['min_parallel_km'])
        hit_groups = [group for group in groups if any(edge in direct for edge in group['edge_ids'])]
        correlated = set()
        for group in hit_groups:
            correlated.update(group['edge_ids'])
        correlated -= set(direct)
        return {
            'centre': {'lat': lat, 'lon': lon},
            'radius_km': float(radius_km),
            'direct': sorted(direct),
            'correlated': sorted(correlated),
            'groups': hit_groups,
            'note': (f'{radius_km:.1f} км радиустай шорьсон хэсэгт {len(direct)} кабель шууд орж байна; '
                     f'түүнтэй нийтлэг коридорт зэрэгцээ явж байгаа {len(correlated)} кабелийн эрсдэл '
                     f'нэмэгдэнэ.'),
        }

    def summary(self, edge_ids=None) -> dict:
        wanted = self._subset(edge_ids)
        pairs = self.overlaps(edge_ids)
        groups = self.groups(edge_ids)
        grouped = {edge for group in groups for edge in group['edge_ids']}
        return {
            'edges': len(wanted),
            'groups': len(groups),
            'largest_group': groups[0]['edge_ids'] if groups else [],
            'shared_km': sum(pair['parallel_km'] for pair in pairs),
            'isolated_edges': len(wanted - grouped),
        }
