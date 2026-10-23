"""Resilience x cost trade-off explorer for fixed-MST augmentation.

The tree handed in is a FIXED Prim MST and the chords are picked from the
candidate graph to take that tree's bridges away. Every number produced here
describes the augmentation of THAT tree: it is not a globally optimal
2-edge-connected network design, and another tree could be cheaper. Budgets
are terrain-weighted kilometres (weighted-km) of the added chords, never
tugrik and never physical kilometres.
"""
import time
import numpy as np
import networkx as nx
from scipy.optimize import milp, Bounds, LinearConstraint
from fiberlab.engine import statistics, tarjan_bridges

__all__ = ['budget_frontier', 'cheapest_cover', 'evaluate', 'pareto', 'solver_report']

SCOPE = ('Тогтсон Prim MST-ийн олонлоглох (fixed-MST augmentation); '
         'глобал 2-edge-connected сүлжээний олонлгох биш.')
MIP_REL_GAP = 0.000001

_MESSAGES = {
    'optimal': 'Оптимизатор бүх хувилбарыг шалгаж хамгийн бага зардлын шийдлийг баталгаажууллаа.',
    'feasible': 'Шийдэл олдсон боловч хамгийн бага байх нь батлагдаагүй.',
    'time_limit': 'Өгсөн хугацаа дуусахад зогссон; олдсон шийдэл feasible боловч хамгийн бага байх нь батлагдаагүй.',
    'infeasible': 'Өгсөн нөхцөлөөр шийдэл байхгүй.',
    'unresolved': 'Оптимизаторын төлөвийг тодорхойлоогүй.',
}

_NO_INCUMBENT = 'Өгсөн хугацаа дуусахад зогссон; шийдэл олдсонгүй.'


def solver_report(status, message=None, seconds=None, gap=None, bound=None) -> dict:
    """Consistent solver status object for the UI.

    `gap` and `bound` are the numbers HiGHS itself reported; `bound` is a
    lower bound on the objective of the minimum-cost models and an upper bound
    on the covered-edge count of the budget models.
    """
    return {'status': status,
            'message': message or _MESSAGES.get(status, _MESSAGES['unresolved']),
            'seconds': seconds, 'gap': gap, 'bound': bound, 'scope': SCOPE}


def _require_tree(tree) -> None:
    if not nx.is_tree(tree):
        raise ValueError('Зөвшөөрөгдсөн холбоосууд бүх зангилааг холбож чадахгүй байна.')


def _edge_id(data, u, v) -> str:
    return data.get('id') or '--'.join(sorted((u, v)))


def _coverage(full, tree):
    """Tree edges, candidate chords and the chord-to-tree-edge coverage matrix.

    A chord covers the tree edges on its fundamental cycle, so a tree edge is
    a bridge exactly when no selected chord covers it.
    """
    tree_edges = [frozenset(e) for e in tree.edges]
    candidates = [(u, v, d) for u, v, d in full.edges(data=True) if not tree.has_edge(u, v)]
    matrix = np.zeros((len(tree_edges), len(candidates)))
    for j, (u, v, _) in enumerate(candidates):
        path = nx.shortest_path(tree, u, v)
        cycle = {frozenset(e) for e in zip(path, path[1:])}
        for i, edge in enumerate(tree_edges):
            matrix[i, j] = edge in cycle
    return tree_edges, candidates, matrix


def _edge_ids(tree, tree_edges) -> list:
    ids = []
    for edge in tree_edges:
        u, v = tuple(edge)
        ids.append(_edge_id(tree.edges[u, v], u, v))
    return ids


def _status_of(result) -> str:
    """Map HiGHS' exit status onto the vocabulary the UI understands."""
    if result.status == 0:
        return 'optimal'
    if result.status == 1:
        message = (getattr(result, 'message', '') or '').lower()
        return 'time_limit' if 'time limit' in message else 'feasible'
    if result.status == 2:
        return 'infeasible'
    return 'unresolved'


def _solution_status(status: str, has_solution: bool) -> str:
    """Quality of the returned solution: proven, merely feasible, or absent."""
    if not has_solution:
        return 'none'
    return 'optimal' if status == 'optimal' else 'feasible'


def _gap(result, has_solution: bool):
    """Relative MIP gap as HiGHS reported it.

    Without a primal solution the relative gap is unbounded, so infinity is
    the honest value there instead of a fabricated number.
    """
    if not has_solution:
        return float('inf')
    gap = getattr(result, 'mip_gap', None)
    if gap is None:
        return None
    value = float(gap)
    return None if np.isnan(value) else value


def _selected(candidates, x) -> list:
    return [(u, v, d) for take, (u, v, d) in zip(x, candidates) if take > 0.5]


def _apply(tree, candidates, x, matrix):
    """Materialise a chord selection: ids, cost, covered mask and the new graph."""
    chosen = _selected(candidates, x)
    augmented = tree.copy()
    added = []
    for u, v, d in chosen:
        augmented.add_edge(u, v, **d)
        added.append(_edge_id(d, u, v))
    covered = (matrix @ np.asarray(x, dtype=float)) >= 0.5
    return added, float(sum(d['cost_km'] for _, _, d in chosen)), covered, augmented


def _max_coverage_model(matrix, costs, budget):
    """MILP maximising the number of covered tree edges under a cost budget.

    One continuous counter per tree edge can only rise to 1 when a selected
    chord lies on that edge's fundamental cycle, so the objective counts
    DISTINCT tree edges rather than chord-edge incidences.
    """
    n_tree, n_chord = matrix.shape
    objective = np.concatenate([np.zeros(n_chord), -np.ones(n_tree)])
    cycle_rows = np.hstack([-matrix, np.eye(n_tree)])
    budget_row = np.concatenate([costs, np.zeros(n_tree)])
    constraint = LinearConstraint(np.vstack([cycle_rows, budget_row]),
                                  np.concatenate([np.full(n_tree, -np.inf), [-np.inf]]),
                                  np.concatenate([np.zeros(n_tree), [budget]]))
    bounds = Bounds(np.zeros(n_chord + n_tree), np.ones(n_chord + n_tree))
    integrality = np.concatenate([np.ones(n_chord), np.zeros(n_tree)])
    return objective, integrality, bounds, constraint


def _min_cost_model(matrix, costs, budget, min_covered):
    """MILP minimising chord cost while covering at least `min_covered` edges."""
    n_tree, n_chord = matrix.shape
    objective = np.concatenate([costs, np.zeros(n_tree)])
    cycle_rows = np.hstack([-matrix, np.eye(n_tree)])
    budget_row = np.concatenate([costs, np.zeros(n_tree)])
    counter_row = np.concatenate([np.zeros(n_chord), np.ones(n_tree)])
    constraint = LinearConstraint(np.vstack([cycle_rows, budget_row, counter_row]),
                                  np.concatenate([np.full(n_tree, -np.inf), [-np.inf], [min_covered]]),
                                  np.concatenate([np.zeros(n_tree), [budget], [np.inf]]))
    bounds = Bounds(np.zeros(n_chord + n_tree), np.ones(n_chord + n_tree))
    integrality = np.concatenate([np.ones(n_chord), np.zeros(n_tree)])
    return objective, integrality, bounds, constraint


def _solve(model, time_limit):
    objective, integrality, bounds, constraint = model
    return milp(objective, integrality=integrality, bounds=bounds, constraints=constraint,
                options={'time_limit': time_limit, 'mip_rel_gap': MIP_REL_GAP})


def _empty_point(budget, edge_ids, status, message, seconds=0.0):
    report = solver_report(status, message, seconds, None, None)
    report.update({'budget_wkm': budget, 'added': [], 'added_cost_km': 0.0, 'covered': 0,
                   'uncovered': list(edge_ids), 'bridges_remaining': len(edge_ids),
                   'solution': _solution_status(status, False)})
    return report


def _budget_point(budget, tree, tree_edges, edge_ids, candidates, matrix, costs, time_limit) -> dict:
    """One point of the budget frontier."""
    total = len(tree_edges)
    if not candidates:
        return _empty_point(budget, edge_ids, 'infeasible',
                            'Зөвшөөрөгдсөн трассаар бүх bridge-ийг арилгах боломжгүй.')
    if budget < float(costs.min()):
        return _empty_point(budget, edge_ids, 'infeasible',
                            f'{budget:.1f} weighted-km төсөвөөр нэг ч хүртээх хөвчийн зардлыг төлөөлж чадахгүй.')

    started = time.perf_counter()
    first = _solve(_max_coverage_model(matrix, costs, budget), time_limit)
    seconds = time.perf_counter() - started
    status = _status_of(first)
    if first.x is None:
        point = _empty_point(budget, edge_ids, status,
                             _NO_INCUMBENT if status == 'time_limit' else None, seconds)
        point['gap'] = _gap(first, False)
        return point

    n_chord = matrix.shape[1]
    covered = int(round(float(first.x[n_chord:].sum())))
    selection = first.x[:n_chord]
    gap = _gap(first, True)
    bound = None if first.mip_dual_bound is None else -float(first.mip_dual_bound)
    cost_gap = None

    # Among the maximum-coverage solutions pick the cheapest one, otherwise the
    # frontier would report an arbitrary cost for the same resilience.
    if status == 'optimal':
        second = _solve(_min_cost_model(matrix, costs, budget, covered), time_limit)
        if second.x is not None:
            cheaper = second.x[:n_chord]
            if float(costs @ cheaper) < float(costs @ selection):
                selection = cheaper
            cost_gap = _gap(second, True)

    added, added_cost, mask, augmented = _apply(tree, candidates, selection, matrix)
    bridges = tarjan_bridges(augmented)
    uncovered = [edge_ids[i] for i in range(total) if not mask[i]]
    message = f'{int(mask.sum())}/{total} модны хэрчим cycle дээр орсон; {len(bridges)} bridge үлдсэн.'
    if int(mask.sum()) < total:
        message += ' Бүх bridge-ийг арилгахын тулд төсөвийг нэмэх шаардлагатай.'
    report = solver_report(status, message, seconds, gap, bound)
    report.update({'budget_wkm': budget, 'added': added, 'added_cost_km': added_cost,
                   'covered': int(mask.sum()), 'uncovered': uncovered,
                   'bridges_remaining': len(bridges), 'cost_gap': cost_gap,
                   'solution': _solution_status(status, True)})
    return report


def budget_frontier(full, tree, budgets, time_limit: float = 5.0) -> list:
    """Budget-constrained resilience frontier for the fixed tree.

    For every budget cap (weighted-km of the added chords) the maximum-coverage
    variant is solved: maximise the number of tree edges that end up on a
    cycle subject to sum(cost_km * x_j) <= budget with binary x_j. The
    cheapest maximum-coverage solution is the one reported, and a budget that
    cannot buy even a single chord is reported as infeasible instead of
    crashing. `time_limit` applies to each solve.
    """
    _require_tree(tree)
    tree_edges, candidates, matrix = _coverage(full, tree)
    edge_ids = _edge_ids(tree, tree_edges)
    costs = np.array([d['cost_km'] for _, _, d in candidates]) if candidates else np.zeros(0)
    return [_budget_point(float(budget), tree, tree_edges, edge_ids, candidates,
                          matrix, costs, time_limit) for budget in budgets]


def cheapest_cover(full, tree, time_limit: float = 5.0) -> dict:
    """Minimum-cost full cover of the fixed tree with the solver's own metadata.

    Same objective the engine's `augment_mst` solves: minimise the weighted-km
    of added chords so that no tree edge stays a bridge.
    """
    _require_tree(tree)
    tree_edges, candidates, matrix = _coverage(full, tree)
    edge_ids = _edge_ids(tree, tree_edges)
    total = len(tree_edges)
    started = time.perf_counter()
    if not candidates or np.any(matrix.sum(axis=1) == 0):
        report = solver_report('infeasible', 'Зөвшөөрөгдсөн трассаар бүх bridge-ийг арилгах боломжгүй.',
                                seconds=time.perf_counter() - started, gap=None, bound=None)
        report.update({'added': [], 'added_cost_km': 0.0, 'covered': 0,
                       'uncovered': list(edge_ids), 'bridges_remaining': total,
                       'solution': 'none'})
        return report

    costs = np.array([d['cost_km'] for _, _, d in candidates])
    result = milp(costs, integrality=np.ones(len(candidates)), bounds=Bounds(0, 1),
                  constraints=LinearConstraint(matrix, 1, np.inf),
                  options={'time_limit': time_limit, 'mip_rel_gap': MIP_REL_GAP})
    seconds = time.perf_counter() - started
    status = _status_of(result)
    if result.x is None:
        report = solver_report(status, _NO_INCUMBENT if status == 'time_limit' else None, seconds,
                               _gap(result, False),
                               None if result.mip_dual_bound is None else float(result.mip_dual_bound))
        report.update({'added': [], 'added_cost_km': 0.0, 'covered': 0,
                       'uncovered': list(edge_ids), 'bridges_remaining': total,
                       'solution': 'none'})
        return report

    added, added_cost, mask, augmented = _apply(tree, candidates, result.x, matrix)
    uncovered = [edge_ids[i] for i in range(total) if not mask[i]]
    bridges = tarjan_bridges(augmented)
    bound = None if result.mip_dual_bound is None else float(result.mip_dual_bound)
    report = solver_report(status, None, seconds, _gap(result, True), bound)
    report.update({'added': added, 'added_cost_km': added_cost,
                   'covered': int(mask.sum()), 'uncovered': uncovered,
                   'bridges_remaining': len(bridges),
                   'nodes': result.mip_node_count, 'objective': float(result.fun),
                   'solution': _solution_status(status, True)})
    return report


def evaluate(full, tree, added_ids) -> dict:
    """Apply a set of chords to the tree and report the resulting topology.

    The numbers come from the engine's own `statistics`, so the augmented
    graph is measured exactly like the MST and the protected topology are.
    """
    _require_tree(tree)
    known = {_edge_id(d, u, v) for u, v, d in full.edges(data=True)}
    missing = [i for i in added_ids if i not in known]
    if missing:
        raise ValueError(f'Сонгосон кабель энэ сүлжээнд байхгүй: {", ".join(sorted(missing))}')
    wanted = set(added_ids)
    augmented = tree.copy()
    applied = []
    for u, v, d in full.edges(data=True):
        edge = _edge_id(d, u, v)
        if edge in wanted and not augmented.has_edge(u, v):
            augmented.add_edge(u, v, **d)
            applied.append(edge)
    baseline = sum(d['distance_km'] for _, _, d in tree.edges(data=True))
    report = statistics(augmented, baseline)
    report['added'] = applied
    report['baseline_km'] = baseline
    return report


def _point_cost(point) -> float:
    for key in ('cost_km', 'added_cost_km'):
        if key in point:
            return float(point[key])
    raise ValueError('Зардлын утга (cost_km) олдсонгүй.')


def _point_bridges(point) -> int:
    for key in ('bridges_remaining', 'bridge_count'):
        if key in point:
            return int(point[key])
    raise ValueError('Bridge-ийн тоо (bridges_remaining) олдсонгүй.')


def _dominates(a, b) -> bool:
    """True when a is no dearer, no less resilient and strictly better somewhere."""
    cost_a, cost_b = _point_cost(a), _point_cost(b)
    bridges_a, bridges_b = _point_bridges(a), _point_bridges(b)
    return cost_a <= cost_b and bridges_a <= bridges_b and (cost_a < cost_b or bridges_a < bridges_b)


def pareto(points: list) -> list:
    """Non-dominated solutions, cheapest first.

    A solution A dominates B when A costs no more, leaves no more bridges and
    is strictly better in at least one of the two.
    """
    frontier = []
    for i, candidate in enumerate(points):
        if not any(_dominates(points[j], candidate) for j in range(len(points)) if j != i):
            frontier.append(candidate)
    return sorted(frontier, key=_point_cost)
