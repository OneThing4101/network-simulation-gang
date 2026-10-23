"""How the network is built, stage by stage, from the data the engine computed.

The five stages are not an animation script. Each one is read back from the
objects the algorithms produced: the candidate graph, the Prim tree with the
order Prim added its edges, the Tarjan bridge list with the partition each
bridge creates, the candidate chords with their fundamental cycles, and the
selected chord set the MILP chose.
"""
import networkx as nx

from .engine import tarjan_bridges


def prim_steps(full, tree):
    """Prim's edge order, so the tree can be shown as it was actually grown."""
    steps = []
    for index, (u, v, data) in enumerate(nx.minimum_spanning_edges(full, weight='cost_km', algorithm='prim')):
        steps.append({'step': index + 1, 'edge_id': data['id'], 'u': u, 'v': v,
                      'cost_km': data['cost_km'], 'distance_km': data['distance_km']})
    return steps


def bridge_partitions(tree, bridge):
    """The two components a bridge splits the tree into."""
    u, v = bridge
    broken = tree.copy()
    broken.remove_edge(u, v)
    parts = [sorted(component) for component in nx.connected_components(broken)]
    parts.sort(key=len, reverse=True)
    return parts


def chord_cycles(tree, chords):
    """For each candidate chord: its fundamental cycle and the tree edges it covers."""
    result = []
    for u, v, data in chords:
        path = nx.shortest_path(tree, u, v)
        cycle = ['--'.join(sorted(edge)) for edge in zip(path, path[1:])]
        result.append({'edge_id': data['id'], 'u': u, 'v': v,
                       'cost_km': data['cost_km'], 'distance_km': data['distance_km'],
                       'cycle': cycle, 'covers': cycle, 'cycle_length_km': sum(
                           tree.edges[e[0], e[1]]['distance_km'] for e in zip(path, path[1:]))})
    return result


def coverage_map(tree, tree_edges, chords):
    """Which chords protect which tree edge."""
    coverage = {edge: [] for edge in tree_edges}
    for u, v, data in chords:
        path = nx.shortest_path(tree, u, v)
        for edge in zip(path, path[1:]):
            key = '--'.join(sorted(edge))
            if key in coverage:
                coverage[key].append(data['id'])
    return coverage


def evolution(model):
    """The five construction stages, each backed by computed values."""
    full, mst = model.full, model.mst
    tree_edges = ['--'.join(sorted(e)) for e in mst.edges]
    selected = set(model.optimization.get('added') or [])
    candidates = [(u, v, d) for u, v, d in full.edges(data=True) if not mst.has_edge(u, v)]
    chosen = [(u, v, d) for u, v, d in candidates if d['id'] in selected]
    others = [(u, v, d) for u, v, d in candidates if d['id'] not in selected]

    stages = []

    stages.append({
        'key': 'candidates',
        'title': 'Боломжит трасс',
        'caption': f"{full.number_of_nodes()} хот, {full.number_of_edges()} боломжит хос холбоо. Тус бүр нь рельефийн тор дээр тооцсон нэг трасс.",
        'edge_ids': [d['id'] for _, _, d in full.edges(data=True)],
        'metrics': {'candidates': full.number_of_edges(), 'cities': full.number_of_nodes(),
                    'connected': nx.is_connected(full),
                    'total_km': sum(d['distance_km'] for _, _, d in full.edges(data=True))},
        'focus': None,
    })

    stages.append({
        'key': 'mst',
        'title': 'Prim-ийн хамгийн бага мод',
        'caption': f"Prim алгоритм {len(tree_edges)} холбоос сонгож, {model.stats['mst']['km']:.0f} км мод байгууллаа. Модны холбоос бүр ганц замтай.",
        'edge_ids': tree_edges,
        'metrics': {'edges': len(tree_edges), 'km': model.stats['mst']['km'],
                    'cost_km': model.stats['mst']['cost_km']},
        'focus': None,
    })

    bridges = tarjan_bridges(mst)
    stages.append({
        'key': 'bridges',
        'title': 'Tarjan-ийн bridge',
        'caption': f"Модны {len(bridges)} холбоос бүггээр bridge: тасрахад мод хоёр хэсэгт хуваагдана.",
        'edge_ids': tree_edges,
        'metrics': {'bridges': len(bridges), 'edges': len(tree_edges)},
        'focus': None,
    })

    stages.append({
        'key': 'chords',
        'title': 'Нөөц цагирагын боломжууд',
        'caption': f"{len(candidates)} боломжит цагираг. Тус бүр нь модны нэг зам дээр байрлаж, тэр хэсгүүдийг bridge-ээс хамгаална.",
        'edge_ids': tree_edges,
        'metrics': {'candidates': len(candidates), 'selected': len(chosen)},
        'focus': None,
    })

    protected = model.graphs['protected']
    stages.append({
        'key': 'protected',
        'title': 'Хамгаалсан сүлжээ',
        'caption': (f"MILP {len(chosen)} цагираг сонгож, {model.stats['protected']['km']:.0f} км "
                    f"({model.stats['protected']['overhead_pct']:.1f}% нэмэлт) bridge-гүй сүлжээ байгууллаа."),
        'edge_ids': [d['id'] for _, _, d in protected.edges(data=True)] if protected is not None else [],
        'metrics': {'edges': protected.number_of_edges() if protected is not None else 0,
                    'km': model.stats['protected']['km'] if model.stats['protected'] else 0,
                    'overhead_pct': model.stats['protected']['overhead_pct'] if model.stats['protected'] else 0,
                    'bridges': 0},
        'focus': None,
    })

    return {
        'stages': stages,
        'prim_order': prim_steps(full, mst),
        'bridges': [{'edge_id': '--'.join(sorted(e)), 'u': e[0], 'v': e[1],
                     'partition': bridge_partitions(mst, e)} for e in bridges],
        'chords': chord_cycles(mst, chosen),
        'candidate_chords': chord_cycles(mst, others),
        'coverage': coverage_map(mst, tree_edges, chosen),
        'optimization': model.optimization,
        'feasible': protected is not None,
    }
