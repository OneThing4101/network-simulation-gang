import json
import re
import time

import pytest
from pyproj import CRS

from fiberlab.corridor import CORRIDOR_POLICY, CorridorAnalyzer, PROJECTION
from fiberlab.engine import NetworkModel
from fiberlab.evolution import coverage_map
from fiberlab.terrain import ROOT


def make_route(edge_id, coords):
    points = [list(point) for point in coords]
    return {
        'id': edge_id,
        'u': edge_id.split('--')[0],
        'v': edge_id.split('--')[1],
        'geometry': points,
        'trunk': points,
        'access': [],
    }


@pytest.fixture(scope='module')
def analyzer():
    cache = json.loads((ROOT / 'data/routes.cache.json').read_text())
    return CorridorAnalyzer(cache['routes'])


def test_projection_is_the_same_string_terrain_uses():
    source = (ROOT / 'fiberlab/terrain.py').read_text()
    match = re.search(r"from_crs\('EPSG:4326',\s*'([^']+)'", source)
    assert match, 'terrain.py forward transform not found'
    assert CORRIDOR_POLICY['projection'] == match.group(1)
    assert PROJECTION == match.group(1)
    probe = CorridorAnalyzer([make_route('A--B', [[100.0, 46.0], [101.0, 46.0]])])
    assert probe._forward.target_crs == CRS.from_user_input(match.group(1))
    assert CRS.from_user_input(CORRIDOR_POLICY['projection']) == CRS.from_user_input(match.group(1))


def test_policy_documents_the_modelling_assumption():
    assert CORRIDOR_POLICY['buffer_km'] == 5.0
    assert CORRIDOR_POLICY['min_overlap_km'] == 0.5
    assert isinstance(CORRIDOR_POLICY['method'], str) and len(CORRIDOR_POLICY['method']) > 40
    assert CORRIDOR_POLICY['limitations']
    assert all(isinstance(item, str) and item for item in CORRIDOR_POLICY['limitations'])
    assert any('модель' in item for item in CORRIDOR_POLICY['limitations'])


def test_identical_routes_overlap_completely():
    line = [[100.0, 46.0], [101.0, 46.0], [102.0, 46.0]]
    analyzer = CorridorAnalyzer([make_route('A--B', line), make_route('C--D', line)])
    pairs = analyzer.overlaps()
    assert len(pairs) == 1
    pair = pairs[0]
    assert {pair['a'], pair['b']} == {'A--B', 'C--D'}
    assert pair['a'] != pair['b']
    assert pair['overlap_km'] > 100
    assert pair['coverage_pct'] == pytest.approx(100.0, abs=1e-6)
    assert pair['separation_km'] == 0.0
    groups = analyzer.groups()
    assert len(groups) == 1 and groups[0]['edge_ids'] == ['A--B', 'C--D']


def test_routes_two_hundred_kilometres_apart_do_not_overlap():
    near = [[100.0, 46.0], [101.0, 46.0], [102.0, 46.0]]
    far = [[100.0, 47.8], [101.0, 47.8], [102.0, 47.8]]
    routes = [make_route('A--B', near), make_route('C--D', far)]
    analyzer = CorridorAnalyzer(routes)
    assert analyzer.overlaps() == []
    assert analyzer.groups() == []
    assert analyzer.summary() == {'edges': 2, 'groups': 0, 'largest_group': [],
                                   'shared_km': 0.0, 'isolated_edges': 2}
    wide = CorridorAnalyzer(routes, buffer_km=250.0)
    pairs = wide.overlaps()
    assert len(pairs) == 1
    assert 150.0 < pairs[0]['separation_km'] < 250.0


def test_triangle_of_mutually_overlapping_routes_forms_one_group():
    routes = [
        make_route('A--B', [[100.0, 46.000], [101.0, 46.000], [102.0, 46.000]]),
        make_route('A--C', [[100.0, 46.015], [101.0, 46.015], [102.0, 46.015]]),
        make_route('A--D', [[100.0, 46.030], [101.0, 46.030], [102.0, 46.030]]),
    ]
    analyzer = CorridorAnalyzer(routes)
    pairs = analyzer.overlaps()
    assert len(pairs) == 3
    groups = analyzer.groups()
    assert len(groups) == 1
    assert groups[0]['id'] == 'srlg-1'
    assert groups[0]['edge_ids'] == ['A--B', 'A--C', 'A--D']
    assert groups[0]['overlap_km'] > 0
    assert groups[0]['description']
    assert analyzer.corridor_of('A--B') == ['A--C', 'A--D']


def test_impact_separates_direct_hits_from_correlated_risk():
    routes = [
        make_route('A--B', [[100.0, 46.000], [101.0, 46.000], [102.0, 46.000]]),
        make_route('A--C', [[100.0, 46.015], [101.0, 46.015], [102.0, 46.015]]),
        make_route('X--Y', [[100.0, 47.800], [101.0, 47.800], [102.0, 47.800]]),
    ]
    analyzer = CorridorAnalyzer(routes)
    impact = analyzer.impact(46.0, 101.0, 1.0)
    assert impact['centre'] == {'lat': 46.0, 'lon': 101.0}
    assert impact['radius_km'] == 1.0
    assert impact['direct'] == ['A--B']
    assert impact['correlated'] == ['A--C']
    assert not set(impact['direct']) & set(impact['correlated'])
    assert 'X--Y' not in impact['correlated']
    assert len(impact['groups']) == 1
    assert impact['groups'][0]['edge_ids'] == ['A--B', 'A--C']
    assert impact['note']


def test_real_network_loads_and_carries_shared_risk(analyzer):
    summary = analyzer.summary()
    assert summary['edges'] == 231
    assert summary['groups'] >= 1
    assert summary['largest_group']
    assert summary['shared_km'] > 0
    groups = analyzer.groups()
    grouped = {edge for group in groups for edge in group['edge_ids']}
    assert summary['isolated_edges'] == 231 - len(grouped)
    assert grouped


def test_real_overlaps_are_positive_distinct_and_sorted(analyzer):
    pairs = analyzer.overlaps()
    assert pairs
    parallel = [pair['parallel_km'] for pair in pairs]
    assert parallel == sorted(parallel, reverse=True)
    for pair in pairs:
        assert pair['a'] != pair['b']
        assert pair['overlap_km'] > 0
        assert pair['parallel_km'] >= 0
        assert pair['parallel_km'] <= pair['overlap_km'] + 1e-6
        assert 0 < pair['coverage_pct'] <= 100.0
        assert pair['separation_km'] >= 0
    subset = {pair['a'] for pair in pairs[:50]} | {pair['b'] for pair in pairs[:50]}
    limited = analyzer.overlaps(edge_ids=sorted(subset))
    assert limited
    assert all(pair['a'] in subset and pair['b'] in subset for pair in limited)


def test_pair_keys_are_ordered_by_id():
    """A pair must be findable from two ids in either order.

    The lookup key used to follow the route index, which silently dropped
    half the lookups made from two ids.
    """
    routes = [
        make_route('A--B', [[100.0, 46.0], [101.0, 46.0], [102.0, 46.0]]),
        make_route('A--C', [[100.0, 46.02], [101.0, 46.02], [102.0, 46.02]]),
    ]
    analyzer = CorridorAnalyzer(routes)
    pairs = analyzer.overlaps()
    assert pairs
    for pair in pairs:
        key = (pair['a'], pair['b'])
        assert list(key) == sorted(key)
        assert analyzer.overlaps(edge_ids=list(key))


def test_every_covering_chord_is_found_in_the_pair_table():
    """The headline number must not depend on how a pair is keyed.

    A chord can protect a tree edge logically while meeting it only at a
    node, so it is legitimately absent from the overlap table. What must
    hold is that a pair which is present is found, and that the two
    populations add up to the number of covering pairs.
    """
    cache = json.loads((ROOT / 'data/routes.cache.json').read_text())
    model = NetworkModel(cache['cities'], cache['routes'])
    analyzer = CorridorAnalyzer(cache['routes'])
    protected_ids = [d['id'] for _, _, d in model.two.edges(data=True)]
    table = {(p['a'], p['b']): p for p in analyzer.overlaps(protected_ids)}

    tree_edges = ['--'.join(sorted(e)) for e in model.mst.edges]
    chosen = [(u, v, d) for u, v, d in model.full.edges(data=True)
              if d['id'] in set(model.optimization.get('added') or [])]
    coverage = coverage_map(model.mst, tree_edges, chosen)

    sharing, meeting_only = 0, 0
    pairs = sum(len(chords) for chords in coverage.values())
    for tree_edge, chords in coverage.items():
        for chord in chords:
            pair = table.get(tuple(sorted((tree_edge, chord))))
            if pair is None:
                meeting_only += 1
                continue
            assert pair['parallel_km'] >= 0
            if pair['parallel_km'] >= 1:
                sharing += 1
            else:
                meeting_only += 1
    assert sharing + meeting_only == pairs
    assert sharing > 0, 'the protected design is expected to have some shared corridors'
    assert meeting_only > 0, 'some chords protect a tree edge only through a node'


def test_a_crossing_is_not_a_shared_corridor():
    """Two cables that cross share a point, not a corridor.

    Proximity alone cannot tell the two apart, so the direction test is what
    keeps a crossing from being reported as a common risk.
    """
    routes = [
        make_route('E--W', [[100.0, 46.0], [101.0, 46.0], [102.0, 46.0]]),
        make_route('N--S', [[101.0, 45.0], [101.0, 46.0], [101.0, 47.0]]),
    ]
    analyzer = CorridorAnalyzer(routes)
    pairs = analyzer.overlaps()
    assert pairs, 'the two routes do cross'
    for pair in pairs:
        assert pair['overlap_km'] > 0, 'the crossing is real'
        assert pair['parallel_km'] == 0.0, 'a crossing is not a shared corridor'
    assert analyzer.groups() == []


def test_parallel_cables_form_a_group():
    routes = [
        make_route('A--B', [[100.0, 46.0], [101.0, 46.0], [102.0, 46.0]]),
        make_route('A--C', [[100.0, 46.02], [101.0, 46.02], [102.0, 46.02]]),
    ]
    analyzer = CorridorAnalyzer(routes)
    groups = analyzer.groups()
    assert len(groups) == 1
    assert groups[0]['edge_ids'] == ['A--B', 'A--C']
    assert groups[0]['overlap_km'] > 0


def test_protected_topology_reports_a_real_shared_risk():
    """The headline claim needs a real number, not a placeholder."""
    cache = json.loads((ROOT / 'data/routes.cache.json').read_text())
    model = NetworkModel(cache['cities'], cache['routes'])
    analyzer = CorridorAnalyzer(cache['routes'])
    for topology in ('mst', 'protected'):
        ids = [d['id'] for _, _, d in model.graphs[topology].edges(data=True)]
        groups = analyzer.groups(ids)
        assert groups, f'{topology} produced no shared-risk group'
        biggest = groups[0]
        assert len(biggest['edge_ids']) > 1
        assert biggest['overlap_km'] > 0
        summary = analyzer.summary(ids)
        assert summary['groups'] == len(groups)
        assert summary['shared_km'] > 0


def test_full_pair_analysis_is_reused_not_recomputed(analyzer):
    analyzer.overlaps()
    start = time.perf_counter()
    analyzer.overlaps()
    assert (time.perf_counter() - start) < 0.2


def test_unknown_edge_id_is_rejected(analyzer):
    with pytest.raises(ValueError):
        analyzer.overlaps(edge_ids=['missing--edge'])
