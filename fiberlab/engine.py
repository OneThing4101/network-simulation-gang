"""Topology optimization, Tarjan bridges, cuts, and propagation estimates."""
import itertools
import time
import networkx as nx
import numpy as np
from scipy.optimize import milp, Bounds, LinearConstraint


def tarjan_bridges(graph):
    """O(V+E) undirected low-link DFS, also supports disconnected graphs."""
    entry, low, result = {}, {}, []

    def visit(u, parent):
        entry[u] = low[u] = len(entry)
        for v in graph[u]:
            if v == parent:
                continue
            if v in entry:
                low[u] = min(low[u], entry[v])
            else:
                visit(v, u)
                low[u] = min(low[u], low[v])
                if low[v] > entry[u]:
                    result.append(tuple(sorted((u, v))))
    for node in graph:
        if node not in entry:
            visit(node, None)
    return sorted(result)


def augment_mst(full, tree):
    """Exact minimum-cost augmentation of THIS fixed MST over candidate links.

    Each chord covers tree edges on its fundamental cycle. A connected tree plus
    chords has no bridges iff every tree edge is covered. Binary set cover MILP
    thus solves fixed-tree augmentation; it is not global 2EC network design.
    """
    if not nx.is_tree(tree):
        raise ValueError('Зөвшөөрөгдсөн холбоосууд бүх зангилааг холбож чадахгүй байна.')
    tree_edges = [frozenset(e) for e in tree.edges]
    candidates = [(u, v, d) for u, v, d in full.edges(data=True) if not tree.has_edge(u, v)]
    matrix = np.zeros((len(tree_edges), len(candidates)))
    for j, (u, v, _) in enumerate(candidates):
        path = nx.shortest_path(tree, u, v)
        cycle = {frozenset(e) for e in zip(path, path[1:])}
        for i, edge in enumerate(tree_edges):
            matrix[i, j] = edge in cycle
    if not len(candidates) or np.any(matrix.sum(axis=1) == 0):
        return None, {'status': 'infeasible', 'message': 'Зөвшөөрөгдсөн трассаар бүх bridge-ийг арилгах боломжгүй.'}
    result = milp(np.array([d['cost_km'] for _, _, d in candidates]),
                  integrality=np.ones(len(candidates)), bounds=Bounds(0, 1),
                  constraints=LinearConstraint(matrix, 1, np.inf),
                  options={'time_limit': 0.6, 'mip_rel_gap': 0.000001})
    if result.x is None:
        return None, {'status': 'infeasible' if result.status == 2 else 'unresolved', 'message': result.message}
    H = tree.copy()
    added = []
    for take, (u, v, data) in zip(result.x, candidates):
        if take > 0.5:
            H.add_edge(u, v, **data)
            added.append(data['id'])
    if tarjan_bridges(H):
        return None, {'status': 'unresolved', 'message': 'Оптимизаторын хариу bridge-free шалгалтад тэнцсэнгүй.'}
    return H, {'status': 'optimal' if result.status == 0 else 'feasible',
               'gap': float(result.mip_gap), 'added': added,
               'added_cost_km': float(result.fun),
               'scope': 'Fixed Prim MST augmentation; candidate terrain grid routes',
               'global_2ec_optimum': False}


def statistics(graph, baseline_km=1):
    connected = len(graph) > 0 and nx.is_connected(graph)
    bridges = tarjan_bridges(graph)
    components = [sorted(c) for c in nx.connected_components(graph)]
    distances = dict(nx.all_pairs_dijkstra_path_length(graph, weight='distance_km'))
    worst = max(((d, a, b) for a, row in distances.items() for b, d in row.items()), default=(0, '', ''))
    length = sum(d['distance_km'] for _, _, d in graph.edges(data=True))
    rtt = worst[0] * 0.01  # 2 × 5 us/km / 1000; propagation-only estimate
    return {'nodes': len(graph), 'edges': graph.number_of_edges(),
            'km': length, 'cost_km': sum(d['cost_km'] for _, _, d in graph.edges(data=True)),
            'overhead_pct': (length / baseline_km - 1) * 100 if baseline_km else 0,
            'connected': connected, 'components': components,
            'component_count': len(components),
            'bridge_count': len(bridges), 'bridges': ['--'.join(e) for e in bridges],
            'fault_tolerant': connected and len(graph) >= 3 and not bridges,
            'rtt_ms': rtt if connected else None,
            'max_component_rtt_ms': rtt,
            'latency_pass': connected and rtt < 50,
            'worst_pair': list(worst[1:]), 'diameter_km': worst[0] if connected else None}


def route_metadata(route):
    """Route facts that are small enough to ship with every topology payload.

    The full vertex list stays server-side: it is 1.4 MB for the 231
    candidate routes and the map only ever needs one topology at a time.
    """
    return {key: value for key, value in route.items() if key not in ('geometry', 'trunk')}


class NetworkModel:
    def __init__(self, cities, routes, excluded=None, overrides=None):
        started = time.perf_counter()
        self.cities = cities
        self.routes = {r['id']: r for r in routes}
        self.excluded = set(excluded or [])
        self.overrides = overrides or {}
        self.full = nx.Graph()
        self.full.add_nodes_from((key, value) for key, value in cities.items())
        for route in routes:
            if route['id'] not in self.excluded:
                data = dict(route)
                factor = self.overrides.get(route['id'], 1.0)
                data['cost_km'] *= factor
                data['cost_factor'] = factor
                self.full.add_edge(route['u'], route['v'], **data)
        self.mst = nx.minimum_spanning_tree(self.full, weight='cost_km', algorithm='prim')
        self.two, self.optimization = augment_mst(self.full, self.mst) if nx.is_connected(self.full) else (None, {'status': 'infeasible', 'message': 'Граф холбоогүй.'})
        self.graphs = {'mst': self.mst, 'protected': self.two, 'full': self.full}
        base = sum(d['distance_km'] for _, _, d in self.mst.edges(data=True))
        self.stats = {k: statistics(g, base) if g is not None else None for k, g in self.graphs.items()}
        self.compute_ms = (time.perf_counter() - started) * 1000

    def topology(self, key):
        if not isinstance(key, str) or key not in self.graphs:
            raise ValueError('Топологийн нэр буруу байна.')
        graph = self.graphs[key]
        if graph is None:
            raise ValueError('Энэ хувилбарт 2-edge-connected сүлжээ байгуулах боломжгүй.')
        return graph

    def cut(self, topology, edge_id, scope='cable', corridor=None):
        from .scenario import analyse
        return analyse(self, topology, edge_id, scope, corridor)

    def path(self, topology, source, target, failed=None):
        graph = self.topology(topology).copy()
        if not isinstance(source, str) or not isinstance(target, str) or source not in graph or target not in graph:
            raise ValueError('Хотын нэр олдсонгүй.')
        if failed:
            graph.remove_edges_from((u, v) for u, v, d in list(graph.edges(data=True)) if d['id'] in failed)
        if not nx.has_path(graph, source, target):
            return {'connected': False, 'path': [], 'km': None, 'rtt_ms': None, 'edges': []}
        path = nx.shortest_path(graph, source, target, weight='distance_km')
        km = nx.path_weight(graph, path, 'distance_km')
        return {'connected': True, 'path': path, 'km': km, 'rtt_ms': km * .01,
                'edges': ['--'.join(sorted(e)) for e in zip(path, path[1:])]}

    def geometry(self, topology):
        """Vertex lists for one topology only, fetched when the map needs them."""
        graph = self.graphs.get(topology)
        if graph is None:
            raise ValueError('Энэ хувилбарт 2-edge-connected сүлжээ байгуулах боломжгүй.')
        return {d['id']: d['geometry'] for _, _, d in graph.edges(data=True)}

    def payload(self):
        return {'cities': [{'id': k, **v} for k, v in self.cities.items()],
                'topologies': {k: {'stats': self.stats[k], 'edge_ids': [d['id'] for _, _, d in g.edges(data=True)]} if g is not None else {'stats': None, 'edge_ids': []} for k, g in self.graphs.items()},
                'routes': [route_metadata(r) for r in self.routes.values()], 'excluded': sorted(self.excluded),
                'cost_factors': self.overrides, 'optimization': self.optimization,
                'compute_ms': self.compute_ms,
                'assumptions': ['Зай нь торон least-cost симуляцийн урт; авто замын хэмжилт биш.',
                                'RTT нь 5 мкс/км тархалтын тооцоо; төхөөрөмж, ачаалал ороогүй.',
                                'Нэг кабелийн тасралтын баталгаа логик ирмэгт хамаарна. Нэг зурваст давхцах кабелийг тусдаа шалгана.',
                                'Өртөг нь харьцуулах weighted-km нэгж; төгрөгийн төсөв биш.',
                                'Уулын polygon доторх хотын local access-ийг шар тасархайгаар тусад нь үзүүлнэ.']}
