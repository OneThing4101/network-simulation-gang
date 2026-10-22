"""Failure scenarios: logical cuts, shared corridors, and computed replay frames.

Two scopes exist and they are not the same claim.

``cable``      one logical edge is removed. This is the only scope the
               exhaustive single-edge proof is built on.
``corridor``   baseline probe: only the selected cable's midpoint is tested for
               co-located edges. It is a heuristic, kept because the recorded
               baseline used it, and it is labelled as such everywhere.
``shared_risk``projected-space overlap: every edge whose geometry runs within
               the corridor buffer of the selected cable is removed together.
               Still a modelled overlap, not a surveyed trench or a hazard map.
"""
import networkx as nx

from .engine import statistics

SCOPE_LABELS = {
    'cable': ('Нэг логик кабель', 'Нэг логик ирмэг тасагдана. Энэ нь ганц холбоосын гэмтлийг шалгах баталгаа юм.'),
    'corridor': ('Дунд цэгийн сэжиглэл (baseline)', 'Зөвхөн сонгосон кабелийн дунд цэгийг шалгаж, тэр цэгтэй давхцах кабелийг тасна. Түүнээс гаднах нийлбэр хэсэгтэй давхцлыг илэрхийлэхгүй.'),
    'shared_risk': ('Геометр дээрх нийтлэг зурвас', 'Проекцласан метр зангилаанд сонгосон кабельтай хамгийн ойрхон шугамын уртаар нийлбэр хэсэг доторх бүх кабель тасагдана. Суваг, гамшиг, эрсдлийн таамаглал биш.'),
}


def _edge_by_id(graph, edge_id):
    for _, _, data in graph.edges(data=True):
        if data['id'] == edge_id:
            return data
    return None


def failed_edges_for(graph, selected, scope, corridor=None):
    """Ids removed by a failure of the given scope."""
    if scope == 'cable':
        return [selected['id']]
    if scope == 'corridor':
        from shapely.geometry import LineString
        point = LineString(selected['trunk']).interpolate(0.5, normalized=True)
        return [d['id'] for _, _, d in graph.edges(data=True)
                if LineString(d['geometry']).distance(point) < 0.00001]
    if scope == 'shared_risk':
        if corridor is None:
            return [selected['id']]
        partners = set(corridor.corridor_of(selected['id'], [d['id'] for _, _, d in graph.edges(data=True)]))
        return sorted(partners | {selected['id']})
    raise ValueError('Тасралтын төрөл буруу байна.')


def analyse(model, topology, edge_id, scope='cable', corridor=None):
    """Cut one cable and report what the network looks like afterwards."""
    graph = model.topology(topology)
    if not isinstance(edge_id, str) or not isinstance(scope, str):
        raise ValueError('Кабелийн ID болон тасралтын төрөл текст байна.')
    selected = _edge_by_id(graph, edge_id)
    if selected is None:
        raise ValueError('Сонгосон кабель энэ топологид байхгүй.')
    if scope not in SCOPE_LABELS:
        raise ValueError('Тасралтын төрөл буруу байна.')

    failed = failed_edges_for(graph, selected, scope, corridor)
    alive = graph.copy()
    alive.remove_edges_from((u, v) for u, v, d in graph.edges(data=True) if d['id'] in failed)
    components = list(nx.connected_components(alive))
    root = 'UB' if 'UB' in alive else (next(iter(alive)) if len(alive) else None)
    root_component = next((c for c in components if root in c), set())
    isolated = sorted(set(alive) - root_component)

    u, v = selected['u'], selected['v']
    path = nx.shortest_path(alive, u, v, weight='distance_km') if nx.has_path(alive, u, v) else []
    distance = nx.path_weight(alive, path, 'distance_km') if path else None
    baseline = model.stats['mst']['km'] if model.stats.get('mst') else 0
    after = statistics(alive, baseline) if len(alive) else None

    label, note = SCOPE_LABELS[scope]
    return {'connected': nx.is_connected(alive) if len(alive) else False,
            'isolated': isolated,
            'reference_node': root,
            'components': [sorted(c) for c in components],
            'component_count': len(components),
            'failed_edges': failed,
            'scope': scope,
            'scope_label': label,
            'scope_basis': 'logical_edge' if scope == 'cable' else ('midpoint_probe' if scope == 'corridor' else 'projected_overlap'),
            'scope_note': note,
            'reroute': path,
            'reroute_edges': ['--'.join(sorted(e)) for e in zip(path, path[1:])],
            'reroute_km': distance,
            'reroute_rtt_ms': distance * .01 if distance is not None else None,
            'after': after}


def replay(model, topology, edge_id, scope='cable', corridor=None):
    """A frame sequence for the failure timeline.

    Every frame is a state the engine actually computed. Nothing here is
    scripted: the playback only moves between states the graph produced.
    """
    graph = model.topology(topology)
    selected = _edge_by_id(graph, edge_id)
    if selected is None:
        raise ValueError('Сонгосон кабель энэ топологид байхгүй.')
    baseline = model.stats['mst']['km'] if model.stats.get('mst') else 0
    before = statistics(graph, baseline)
    result = analyse(model, topology, edge_id, scope, corridor)
    failed = result['failed_edges']

    frames = [{
        'key': 'before',
        'title': 'Эхний төлөв',
        'caption': f"{before['edges']} кабель бүх хот холбогдсон. Bridge: {before['bridge_count']}.",
        'failed_edges': [],
        'components': result['components'],
        'reroute': [],
        'reroute_edges': [],
        'metrics': {'connected': before['connected'], 'component_count': 1,
                    'isolated': 0, 'rtt_ms': before['rtt_ms'],
                    'bridge_count': before['bridge_count']},
    }, {
        'key': 'failure',
        'title': 'Гэмтэл илэрсэн',
        'caption': (f"{len(failed)} кабель тасарлаа. Сүлжээ {result['component_count']} хэсэгт хуваалагдлаа."
                    if len(failed) > 1 else "Нэг кабель тасарлаа. Сүлжээгүү хэсгүүд үүслээ."),
        'failed_edges': failed,
        'components': result['components'],
        'reroute': [],
        'reroute_edges': [],
        'metrics': {'connected': result['connected'], 'component_count': result['component_count'],
                    'isolated': len(result['isolated']), 'rtt_ms': None,
                    'bridge_count': None},
    }]

    if result['reroute']:
        delta = None
        if result['reroute_rtt_ms'] is not None and before['rtt_ms'] is not None:
            delta = result['reroute_rtt_ms'] - before['rtt_ms']
        frames.append({
            'key': 'reroute',
            'title': 'Нөөц зам',
            'caption': f"Нөөц чиглэл олдсон: {result['reroute_km']:.0f} км, RTT {result['reroute_rtt_ms']:.1f} мс.",
            'failed_edges': failed,
            'components': result['components'],
            'reroute': result['reroute'],
            'reroute_edges': result['reroute_edges'],
            'metrics': {'connected': result['connected'], 'component_count': result['component_count'],
                        'isolated': len(result['isolated']), 'rtt_ms': result['reroute_rtt_ms'],
                        'delta_rtt_ms': delta, 'bridge_count': None},
        })

    after = result['after'] or {}
    frames.append({
        'key': 'after',
        'title': 'Шинэ төлөв',
        'caption': (f"Тасралтын дараа {after.get('bridge_count')} bridge, "
                    f"хамгийн их RTT {after.get('rtt_ms', 0):.1f} мс." if after.get('rtt_ms') is not None
                    else f"Тасралтын дараа {after.get('component_count', 0)} салангид хэсэг."),
        'failed_edges': failed,
        'components': result['components'],
        'reroute': result['reroute'],
        'reroute_edges': result['reroute_edges'],
        'metrics': {'connected': result['connected'], 'component_count': result['component_count'],
                    'isolated': len(result['isolated']), 'rtt_ms': after.get('rtt_ms'),
                    'bridge_count': after.get('bridge_count')},
    })

    return {'topology': topology, 'edge_id': edge_id, 'scope': scope,
            'scope_label': result['scope_label'], 'scope_basis': result['scope_basis'],
            'scope_note': result['scope_note'],
            'frames': frames, 'before': before, 'after': after,
            'isolated': result['isolated'], 'failed_edges': failed}
