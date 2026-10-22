import itertools
import json
import math
import networkx as nx
import pytest
from fiberlab.terrain import ROOT
from fiberlab.engine import augment_mst
from fiberlab import optimize


@pytest.fixture(scope='module')
def cache():
    return json.loads((ROOT / 'data/routes.cache.json').read_text())


@pytest.fixture(scope='module')
def real(cache):
    """Candidate graph and the Prim MST the engine itself would build."""
    full = nx.Graph()
    full.add_nodes_from(cache['cities'].items())
    for route in cache['routes']:
        full.add_edge(route['u'], route['v'], **route)
    tree = nx.minimum_spanning_tree(full, weight='cost_km', algorithm='prim')
    return full, tree


def synthetic(n, salt=0):
    """Complete graph with deterministic costs and physical lengths."""
    graph = nx.complete_graph(n)
    for u, v in graph.edges:
        graph[u][v].update(cost_km=1 + (u * 13 + v * 7 + salt) % 17,
                           distance_km=1 + (u * 5 + v * 3 + salt) % 11,
                           id=f'{u}--{v}')
    return graph, nx.minimum_spanning_tree(graph, weight='cost_km')


def bruteforce_optimum(graph, tree):
    """Cheapest full cover by enumerating every chord subset."""
    candidates = [(u, v) for u, v in graph.edges if not tree.has_edge(u, v)]
    optimum = math.inf
    for mask in itertools.product((0, 1), repeat=len(candidates)):
        candidate = tree.copy()
        chosen = [e for bit, e in zip(mask, candidates) if bit]
        candidate.add_edges_from(chosen)
        if not list(nx.bridges(candidate)):
            optimum = min(optimum, sum(graph[u][v]['cost_km'] for u, v in chosen))
    return optimum


@pytest.mark.parametrize('n,salt', [(5, 0), (6, 3), (5, 11)])
def test_cheapest_cover_matches_bruteforce(n, salt):
    graph, tree = synthetic(n, salt)
    report = optimize.cheapest_cover(graph, tree)
    assert report['status'] == 'optimal'
    assert math.isclose(report['added_cost_km'], bruteforce_optimum(graph, tree), rel_tol=1e-9)
    assert report['uncovered'] == []
    assert report['bridges_remaining'] == 0
    assert report['covered'] == tree.number_of_edges()
    covered = tree.copy()
    covered.add_edges_from([(u, v) for u, v, d in graph.edges(data=True)
                             if d['id'] in report['added']])
    assert not list(nx.bridges(covered))


def test_cheapest_cover_reports_the_solver_bound_and_gap():
    graph, tree = synthetic(5)
    report = optimize.cheapest_cover(graph, tree)
    assert report['gap'] is not None and report['gap'] >= 0
    assert report['bound'] is not None
    assert report['bound'] <= report['added_cost_km'] + 1e-6
    assert report['seconds'] > 0
    assert report['scope'] == optimize.SCOPE
    assert 'MST' in report['scope']


def test_cheapest_cover_cost_matches_the_solver_objective(real):
    full, tree = real
    report = optimize.cheapest_cover(full, tree)
    assert math.isclose(report['added_cost_km'], report['objective'], rel_tol=1e-9)
    assert report['objective'] > 0
    assert report['nodes'] is not None
    assert report['solution'] == 'optimal'


def test_budget_frontier_is_monotone_in_coverage(real):
    full, tree = real
    optimum = optimize.cheapest_cover(full, tree)['added_cost_km']
    budgets = [0, 250, 500, 1000, 2000, 3000, optimum, optimum * 2]
    frontier = optimize.budget_frontier(full, tree, budgets)
    assert [point['budget_wkm'] for point in frontier] == [float(b) for b in budgets]
    covered = [point['covered'] for point in frontier]
    assert covered == sorted(covered)
    assert covered[-1] == tree.number_of_edges()
    spent = [point['added_cost_km'] for point in frontier]
    assert spent == sorted(spent)
    for point in frontier:
        assert point['added_cost_km'] <= point['budget_wkm'] + 1e-6
        assert point['bridges_remaining'] == len(point['uncovered'])
        assert point['covered'] + point['bridges_remaining'] == tree.number_of_edges()


def test_budget_frontier_points_are_real_solutions(real):
    full, tree = real
    frontier = optimize.budget_frontier(full, tree, [1500, 2500])
    known = {d['id'] for _, _, d in full.edges(data=True)}
    for point in frontier:
        assert set(point['added']) <= known
        assert not set(point['added']) & {d['id'] for _, _, d in tree.edges(data=True)}
        assert point['uncovered'] == [d['id'] for _, _, d in tree.edges(data=True)
                                      if d['id'] in point['uncovered']]


def test_zero_budget_is_infeasible(real):
    full, tree = real
    frontier = optimize.budget_frontier(full, tree, [0])
    point = frontier[0]
    assert point['status'] == 'infeasible'
    assert point['added'] == []
    assert point['covered'] == 0
    assert len(point['uncovered']) == tree.number_of_edges()
    assert point['message']


def test_budget_below_the_cheapest_chord_is_infeasible(real):
    full, tree = real
    cheapest = min(d['cost_km'] for _, _, d in full.edges(data=True))
    point = optimize.budget_frontier(full, tree, [cheapest / 2])[0]
    assert point['status'] == 'infeasible'
    assert point['added'] == []
    assert point['added_cost_km'] == 0.0


def test_evaluate_reports_no_bridges_after_a_full_cover(real):
    full, tree = real
    cover = optimize.cheapest_cover(full, tree)
    stats = optimize.evaluate(full, tree, cover['added'])
    assert stats['bridge_count'] == 0
    assert stats['bridges'] == []
    assert stats['connected'] is True
    assert stats['edges'] == tree.number_of_edges() + len(cover['added'])
    baseline = sum(d['cost_km'] for _, _, d in tree.edges(data=True))
    assert math.isclose(stats['cost_km'], baseline + cover['added_cost_km'], rel_tol=1e-9)
    assert stats['km'] > sum(d['distance_km'] for _, _, d in tree.edges(data=True))
    assert stats['diameter_km'] > 0
    assert stats['rtt_ms'] > 0
    assert len(stats['worst_pair']) == 2


def test_evaluate_matches_the_engine_statistics(real):
    full, tree = real
    cover = optimize.cheapest_cover(full, tree)
    graph = tree.copy()
    for u, v, d in full.edges(data=True):
        if d['id'] in cover['added']:
            graph.add_edge(u, v, **d)
    from fiberlab.engine import statistics
    expected = statistics(graph, sum(d['distance_km'] for _, _, d in tree.edges(data=True)))
    stats = optimize.evaluate(full, tree, cover['added'])
    for key in ('edges', 'km', 'cost_km', 'bridge_count', 'bridges', 'connected', 'rtt_ms', 'diameter_km'):
        assert stats[key] == expected[key], key


def test_evaluate_rejects_an_unknown_chord(real):
    full, tree = real
    with pytest.raises(ValueError):
        optimize.evaluate(full, tree, ['no--such--route'])


def test_pareto_keeps_only_non_dominated_points():
    points = [{'cost_km': 100, 'bridges_remaining': 4},
              {'cost_km': 120, 'bridges_remaining': 2},
              {'cost_km': 130, 'bridges_remaining': 2},
              {'cost_km': 140, 'bridges_remaining': 5},
              {'cost_km': 150, 'bridges_remaining': 1},
              {'cost_km': 200, 'bridges_remaining': 6}]
    frontier = optimize.pareto(points)
    assert [point['cost_km'] for point in frontier] == [100, 120, 150]
    assert points[2] not in frontier
    assert points[3] not in frontier
    assert points[5] not in frontier
    for candidate in frontier:
        for other in points:
            assert not optimize._dominates(other, candidate) or other is candidate


def test_pareto_keeps_equal_points_and_sorts_by_cost():
    points = [{'cost_km': 50, 'bridges_remaining': 3},
              {'cost_km': 50, 'bridges_remaining': 3},
              {'cost_km': 90, 'bridges_remaining': 1}]
    frontier = optimize.pareto(points)
    assert len(frontier) == 3
    assert [point['cost_km'] for point in frontier] == [50, 50, 90]


def test_pareto_accepts_evaluated_solutions(real):
    full, tree = real
    cover = optimize.cheapest_cover(full, tree)
    stats = optimize.evaluate(full, tree, cover['added'])
    stats['bridges_remaining'] = stats['bridge_count']
    frontier = optimize.pareto([stats, {'cost_km': stats['cost_km'] + 1, 'bridges_remaining': 0}])
    assert frontier == [stats]


def test_solver_status_is_not_faked_under_a_tiny_time_limit(real):
    full, tree = real
    report = optimize.cheapest_cover(full, tree, time_limit=0.001)
    assert report['status'] in {'optimal', 'feasible', 'time_limit'}
    if report['status'] != 'optimal':
        assert report['gap'] is not None
        assert report['solution'] == ('feasible' if report['added'] else 'none')
        if report['added']:
            assert report['bound'] is not None
            assert report['bound'] <= report['added_cost_km'] + 1e-6


def test_budget_frontier_status_is_not_faked_under_a_tiny_time_limit(real):
    full, tree = real
    point = optimize.budget_frontier(full, tree, [2000], time_limit=0.001)[0]
    assert point['status'] in {'optimal', 'feasible', 'time_limit'}
    if point['status'] != 'optimal':
        assert point['gap'] is not None


def test_real_dataset_cheapest_cover_agrees_with_the_engine(real):
    full, tree = real
    engine_graph, engine_info = augment_mst(full, tree)
    report = optimize.cheapest_cover(full, tree)
    assert engine_info['status'] == 'optimal'
    assert report['status'] == 'optimal'
    assert math.isclose(report['added_cost_km'], engine_info['added_cost_km'], rel_tol=1e-9)
    assert sorted(report['added']) == sorted(engine_info['added'])
    assert report['added_cost_km'] == engine_info['added_cost_km']
    assert engine_graph is not None
    assert not list(nx.bridges(engine_graph))


def test_real_dataset_frontier_reaches_the_cheap_full_cover(real):
    full, tree = real
    cover = optimize.cheapest_cover(full, tree)
    point = optimize.budget_frontier(full, tree, [cover['added_cost_km']])[0]
    assert point['status'] == 'optimal'
    assert point['covered'] == tree.number_of_edges()
    assert point['bridges_remaining'] == 0
    assert math.isclose(point['added_cost_km'], cover['added_cost_km'], rel_tol=1e-9)


def test_a_graph_that_is_not_a_tree_is_rejected():
    graph, _ = synthetic(5)
    with pytest.raises(ValueError):
        optimize.cheapest_cover(graph, graph)
    with pytest.raises(ValueError):
        optimize.budget_frontier(graph, graph, [100])


def test_solver_report_contract():
    report = optimize.solver_report('optimal', seconds=1.25, gap=0.0, bound=42.0)
    assert set(report) == {'status', 'message', 'seconds', 'gap', 'bound', 'scope'}
    assert report['status'] == 'optimal'
    assert report['seconds'] == 1.25
    assert report['message'].endswith('.')
    assert 'MST' in report['scope']
    assert '2-edge-connected' in report['scope']
    for status in ('optimal', 'feasible', 'infeasible', 'time_limit', 'unresolved'):
        assert optimize.solver_report(status)['message'].endswith('.')
