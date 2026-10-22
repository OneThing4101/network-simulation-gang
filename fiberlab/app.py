"""Local Flask API and built React UI. No cloud account or runtime data fetch."""
import csv
import gzip
import io
import json
import os
from pathlib import Path
import threading
import time
import uuid
import math
import networkx as nx
from flask import Flask, jsonify, request, send_from_directory, Response
from werkzeug.exceptions import HTTPException
from .terrain import ROOT, TerrainRouter
from .engine import NetworkModel, statistics
from . import evolution as evolution_module
from . import scenario as scenario_module


def default_cities():
    return {key: {'lat': value[0], 'lon': value[1], 'name': value[2]}
            for key, value in json.loads((ROOT / 'data/cities.json').read_text()).items()}


class Store:
    def __init__(self, persist=True):
        self.lock = threading.RLock()
        self.router = None
        self.persist = persist
        self.jobs = {}
        self.busy = False
        self.revision = 0
        self.audit_cache = None
        self.corridor_cache = None
        cache_path = ROOT / 'data/routes.cache.json'
        cache = json.loads(cache_path.read_text()) if cache_path.exists() else None
        cities = default_cities()
        if cache is None or cache.get('fingerprint') != TerrainRouter.fingerprint(cities):
            self.router = TerrainRouter()
            routes = self.router.route_all(cities)
            cache = {'fingerprint': TerrainRouter.fingerprint(cities), 'routes': routes, 'cities': cities,
                     'grid_ms': self.router.build_ms, 'dijkstra_ms': self.router.last_dijkstra_ms}
            cache_path.write_text(json.dumps(cache, ensure_ascii=False))
            (ROOT / 'data/layers.geojson').write_text(json.dumps(self.router.layers(), ensure_ascii=False))
        self.default_routes = cache['routes']
        self.preprocessing = {k: cache.get(k) for k in ('grid_ms', 'dijkstra_ms')}
        self.model = NetworkModel(cities, self.default_routes)
        saved = ROOT / '.state/network.json'
        if persist and saved.exists():
            state = json.loads(saved.read_text())
            if state.get('fingerprint') != TerrainRouter.fingerprint(state['cities']):
                self.router = self.router or TerrainRouter()
                state['routes'] = self.router.route_all(state['cities'])
            self.model = NetworkModel(state['cities'], state['routes'], state.get('excluded'), state.get('overrides'))

    def save(self):
        self.audit_cache = None
        self.corridor_cache = {}
        self.revision += 1
        if self.persist:
            directory = ROOT / '.state'
            directory.mkdir(exist_ok=True)
            payload = {'cities': self.model.cities, 'routes': list(self.model.routes.values()),
                       'excluded': sorted(self.model.excluded), 'overrides': self.model.overrides,
                       'fingerprint': TerrainRouter.fingerprint(self.model.cities)}
            temporary = directory / 'network.tmp'
            temporary.write_text(json.dumps(payload, ensure_ascii=False))
            os.replace(temporary, directory / 'network.json')

    def require_idle(self):
        if self.busy:
            raise ValueError('Маршрут шинэчилж байна. Дууссаны дараа дахин оролдоно уу.')

    def prune_jobs(self, keep=20):
        """Finished jobs are kept briefly so a late poll can still read them."""
        if len(self.jobs) <= keep:
            return
        finished = [(key, job) for key, job in self.jobs.items() if job.get('status') != 'running']
        for key, _ in finished[:len(self.jobs) - keep]:
            self.jobs.pop(key, None)

    def corridor_analyzer(self, buffer_km=5.0):
        """Built on demand: the projected geometry is only needed by the
        shared-risk scenes, and it must be rebuilt when the graph changes."""
        if self.corridor_cache is None:
            self.corridor_cache = {}
        key = round(float(buffer_km), 3)
        if key not in self.corridor_cache:
            from .corridor import CorridorAnalyzer
            self.corridor_cache[key] = CorridorAnalyzer(list(self.model.routes.values()), buffer_km=key)
        return self.corridor_cache[key]

    def rebuild(self, cities):
        self.require_idle()
        self.busy = True
        job_id = str(uuid.uuid4())
        self.prune_jobs()
        self.jobs[job_id] = {'status': 'running', 'message': 'Саадыг тооцож маршрутуудыг шинэчилж байна.'}

        def worker():
            try:
                router = self.router or TerrainRouter()
                routes = router.route_all(cities)
                model = NetworkModel(cities, routes, self.model.excluded, self.model.overrides)
                if not nx.is_connected(model.full):
                    raise ValueError('Шинэ зангилаанд холбоотой маршрутын сүлжээ үүссэнгүй.')
                with self.lock:
                    self.router, self.model = router, model
                    self.save()
                    self.jobs[job_id] = {'status': 'complete', 'revision': self.revision}
            except Exception as error:
                with self.lock:
                    self.jobs[job_id] = {'status': 'failed', 'message': str(error)}
            finally:
                with self.lock:
                    self.busy = False
        threading.Thread(target=worker, daemon=True).start()
        return job_id


def create_app(persist=True):
    app = Flask(__name__, static_folder=None)
    app.config['MAX_CONTENT_LENGTH'] = 2 * 1024 * 1024
    store = Store(persist=persist)
    app.extensions['network_store'] = store

    @app.after_request
    def compress(response):
        # Route geometry is the bulk of the payload; gzip keeps the map snappy
        # on a local network without dropping any vertex.
        if (response.status_code == 200 and response.mimetype in ('application/json', 'application/geo+json')
                and 'gzip' in (request.headers.get('Accept-Encoding') or '')):
            data = response.get_data()
            if len(data) > 4096:
                response.set_data(gzip.compress(data, 6))
                response.headers['Content-Encoding'] = 'gzip'
                response.headers['Content-Length'] = str(len(response.get_data()))
        return response

    @app.before_request
    def validate_origin():
        # UI/API run on one origin; a foreign webpage cannot mutate localhost.
        if request.method in ('POST', 'PATCH', 'DELETE'):
            origin = request.headers.get('Origin')
            if origin and origin != request.host_url.rstrip('/'):
                return jsonify(error='Өөр origin-оос засварлах хүсэлт зөвшөөрөхгүй.'), 403
            if not request.is_json:
                return jsonify(error='application/json өгөгдөл шаардлагатай.'), 415

    @app.errorhandler(ValueError)
    def invalid(error):
        return jsonify(error=str(error)), 400

    @app.errorhandler(HTTPException)
    def http_error(error):
        return jsonify(error=error.description), error.code

    @app.errorhandler(Exception)
    def unexpected(error):
        # A solver or geometry failure must not leak a stack trace or a local path.
        app.logger.exception('Unhandled API error')
        return jsonify(error='Серверийн дотоод алдаа гарлаа. Үйлдлийг давтан хийж үзнэ үү.',
                       detail=type(error).__name__), 500

    def body():
        data = request.get_json()
        if not isinstance(data, dict):
            raise ValueError('JSON object шаардлагатай.')
        return data

    def city_values(data):
        if not isinstance(data.get('name'), str):
            raise ValueError('Хотын нэр текст байна.')
        try:
            value = {'lat': float(data['lat']), 'lon': float(data['lon']), 'name': str(data['name']).strip()}
        except (KeyError, ValueError, TypeError):
            raise ValueError('Хотын нэр, өргөрөг, уртраг шаардлагатай.')
        if not (math.isfinite(value['lat']) and math.isfinite(value['lon']) and
                41 < value['lat'] < 53 and 87 < value['lon'] < 121 and 1 <= len(value['name']) <= 60):
            raise ValueError('Хотын координат эсвэл нэр буруу байна.')
        return value

    @app.get('/api/health')
    def health():
        # The absolute install path is not part of the public surface.
        return jsonify(status='ok', application='fiber-atlas', busy=store.busy, revision=store.revision)

    @app.get('/api/network/topologies')
    def topologies():
        with store.lock:
            return jsonify(**store.model.payload(), revision=store.revision, busy=store.busy,
                           preprocessing=store.preprocessing)

    @app.get('/api/network/geometry')
    def geometry():
        # Vertex lists are fetched per topology: the map never needs all 231 at once.
        topology = request.args.get('topology', 'protected')
        with store.lock:
            return jsonify(topology=topology, geometry=store.model.geometry(topology),
                           revision=store.revision)

    @app.get('/api/network/evolution')
    def evolution():
        with store.lock:
            return jsonify(**evolution_module.evolution(store.model), revision=store.revision)

    @app.get('/api/network/corridors')
    def corridors():
        topology = request.args.get('topology', 'protected')
        buffer_km = float(request.args.get('buffer_km', 5))
        if not 0.1 <= buffer_km <= 100:
            raise ValueError('Коридорын өргөн 0.1–100 км байна.')
        with store.lock:
            model = store.model
            graph = model.graphs.get(topology)
            ids = [d['id'] for _, _, d in graph.edges(data=True)] if graph is not None else []
            analyzer = store.corridor_analyzer(buffer_km)
            pairs = analyzer.overlaps(ids)
            groups = analyzer.groups(ids)
            # The question the whole module exists for: does an added chord
            # protect a tree edge it actually shares ground with?
            coverage = []
            if topology == 'protected' and model.two is not None:
                from .evolution import coverage_map
                tree_edges = ['--'.join(sorted(e)) for e in model.mst.edges]
                chosen = [(u, v, d) for u, v, d in model.full.edges(data=True)
                          if d['id'] in set(model.optimization.get('added') or [])]
                mapping = coverage_map(model.mst, tree_edges, chosen)
                pair_index = {(p['a'], p['b']): p for p in pairs}
                for tree_edge, chords in mapping.items():
                    for chord in chords:
                        key = tuple(sorted((tree_edge, chord)))
                        pair = pair_index.get(key)
                        parallel = pair['parallel_km'] if pair else 0.0
                        coverage.append({
                            'tree_edge': tree_edge, 'chord': chord,
                            'parallel_km': parallel,
                            'overlap_km': pair['overlap_km'] if pair else 0.0,
                            # A chord can protect a tree edge logically while
                            # meeting it only at a node: the protection is then
                            # topological, not physical.
                            'shares_corridor': parallel > 0,
                        })
            return jsonify(topology=topology, buffer_km=buffer_km, pairs=pairs, groups=groups,
                           coverage=coverage, policy=analyzer.policy,
                           summary=analyzer.summary(ids), revision=store.revision)

    @app.post('/api/network/impact')
    def impact():
        data = body()
        topology = data.get('topology', 'protected')
        radius_km = float(data.get('radius_km', 25))
        buffer_km = float(data.get('buffer_km', 5))
        if not 1 <= radius_km <= 500:
            raise ValueError('Нөлөөллийн радиус 1–500 км байна.')
        with store.lock:
            model = store.model
            graph = model.graphs.get(topology)
            ids = [d['id'] for _, _, d in graph.edges(data=True)] if graph is not None else []
            analyzer = store.corridor_analyzer(buffer_km)
            result = analyzer.impact(float(data.get('lat', 47.9)), float(data.get('lon', 106.9)),
                                     radius_km, ids, buffer_km)
            failed = result['direct'] + result['correlated']
            after = None
            if failed and graph is not None:
                after = scenario_module.analyse(model, topology, failed[0], 'cable')
                after['failed_edges'] = failed
                after['scope_label'] = 'Нөлөөллийн хэсэг ба нийтлэг коридор'
                after['scope_basis'] = 'footprint_plus_corridor'
                after['scope_note'] = (f'{radius_km:.0f} км радиустай шорьсон хэсэг болон түүнтэй '
                                       f'зэрэгцээ явж байгаа коридороос {len(failed)} кабель тасагдлаа.')
            return jsonify(**result, topology=topology, after=after, revision=store.revision)

    @app.post('/api/network/optimize')
    def optimize():
        from . import optimize as optimize_module
        data = body()
        budget = data.get('budget_wkm')
        budgets = data.get('budgets_wkm')
        if budgets is None:
            if budget is None:
                raise ValueError('Төсөв (weighted-км) шаардлагатай.')
            budgets = [float(budget)]
        if not isinstance(budgets, list) or not budgets:
            raise ValueError('Төсөвийн жагсаалт шаардлагатай.')
        budgets = [float(b) for b in budgets]
        if any(b < 0 for b in budgets):
            raise ValueError('Төсөв сөрөг байж болохгүй.')
        with store.lock:
            model = store.model
            frontier = optimize_module.budget_frontier(model.full, model.mst, budgets)
            return jsonify(frontier=frontier, topology='protected', revision=store.revision)

    @app.get('/api/geography')
    def geography():
        # Layer export does not need the routing grid constructed at warm start.
        if store.router:
            return jsonify(store.router.layers())
        cache = ROOT / 'data/layers.geojson'
        if cache.exists():
            return Response(cache.read_text(), mimetype='application/geo+json')
        router = TerrainRouter()
        store.router = router
        layers = router.layers()
        cache.write_text(json.dumps(layers, ensure_ascii=False))
        return jsonify(layers)

    @app.post('/api/network/simulate-cut')
    def simulate_cut():
        data = body()
        return jsonify(store.model.cut(data.get('topology', 'protected'), data.get('edge_id'), data.get('scope', 'cable')))

    @app.post('/api/network/failure-replay')
    def failure_replay():
        data = body()
        with store.lock:
            topology = data.get('topology', 'protected')
            scope = data.get('scope', 'cable')
            corridor = store.corridor_analyzer() if scope == 'shared_risk' else None
            result = scenario_module.replay(store.model, topology, data.get('edge_id'), scope, corridor)
            return jsonify(**result, revision=store.revision)

    @app.post('/api/network/path')
    def path():
        data = body()
        failed = data.get('failed_edges', [])
        if not isinstance(failed, list) or not all(isinstance(x, str) for x in failed):
            raise ValueError('failed_edges нь кабелийн ID жагсаалт байна.')
        return jsonify(store.model.path(data.get('topology', 'protected'), data.get('source'), data.get('target'), failed))

    @app.get('/api/network/audit')
    def audit():
        with store.lock:
            if store.audit_cache is None:
                result = {}
                for key, graph in store.model.graphs.items():
                    if graph is None:
                        result[key] = None
                        continue
                    tests = []
                    for u, v, data in graph.edges(data=True):
                        H = graph.copy()
                        H.remove_edge(u, v)
                        connected = nx.is_connected(H)
                        tests.append({'edge_id': data['id'], 'connected': connected})
                    result[key] = {'tested': len(tests), 'passed': sum(t['connected'] for t in tests), 'cases': tests}
                store.audit_cache = result
            return jsonify(store.audit_cache)

    @app.get('/api/jobs/<job_id>')
    def job(job_id):
        if job_id not in store.jobs:
            return jsonify(error='Ажил олдсонгүй.'), 404
        return jsonify(store.jobs[job_id])

    @app.post('/api/nodes')
    def add_node():
        data = body()
        key = data.get('id', '')
        if not isinstance(key, str) or not key.isascii() or not key.replace('_', '').isalnum() or len(key) > 32:
            raise ValueError('ID нь 1–32 латин үсэг, тоо, доогуур зураас байна.')
        with store.lock:
            if key in store.model.cities:
                raise ValueError('Ийм ID-тай зангилаа байна.')
            if len(store.model.cities) >= 48:
                raise ValueError('Энэ локал хувилбар 48 хүртэл зангилаа дэмжинэ.')
            cities = dict(store.model.cities)
            cities[key] = city_values(data)
            job_id = store.rebuild(cities)
        return jsonify(job_id=job_id), 202

    @app.patch('/api/nodes/<key>')
    def edit_node(key):
        data = body()
        with store.lock:
            if key not in store.model.cities:
                raise ValueError('Зангилаа олдсонгүй.')
            cities = dict(store.model.cities)
            cities[key] = city_values({**cities[key], **data})
            job_id = store.rebuild(cities)
        return jsonify(job_id=job_id), 202

    @app.delete('/api/nodes/<key>')
    def delete_node(key):
        with store.lock:
            store.require_idle()
            if key not in store.model.cities or key == 'UB' or len(store.model.cities) <= 3:
                raise ValueError('Энэ зангилааг хасах боломжгүй. UB болон хамгийн багадаа 3 цэгийг хадгална.')
            cities = {k: v for k, v in store.model.cities.items() if k != key}
            routes = [r for r in store.model.routes.values() if key not in (r['u'], r['v'])]
            store.model = NetworkModel(cities, routes, store.model.excluded, store.model.overrides)
            store.save()
        return jsonify(ok=True)

    @app.route('/api/edges/<edge_id>', methods=['POST', 'PATCH', 'DELETE'])
    def edge(edge_id):
        data = body()
        with store.lock:
            store.require_idle()
            if edge_id not in store.model.routes:
                raise ValueError('Кабель олдсонгүй. Эхлээд хоёр зангилааг үүсгэнэ үү.')
            excluded = set(store.model.excluded)
            overrides = dict(store.model.overrides)
            if request.method == 'DELETE':
                excluded.add(edge_id)
            else:
                excluded.discard(edge_id)
                try:
                    factor = float(data.get('cost_factor', overrides.get(edge_id, 1)))
                except (ValueError, TypeError):
                    raise ValueError('Өртгийн үржвэр тоо байна.')
                if not math.isfinite(factor) or not 0.1 <= factor <= 20:
                    raise ValueError('Өртгийн үржвэр 0.1–20 байна.')
                overrides[edge_id] = factor
            store.model = NetworkModel(store.model.cities, list(store.model.routes.values()), excluded, overrides)
            store.save()
        return jsonify(ok=True)

    @app.post('/api/network/reset')
    def reset():
        body()
        with store.lock:
            store.require_idle()
            store.model = NetworkModel(default_cities(), store.default_routes)
            store.save()
        return jsonify(ok=True)

    @app.get('/api/export/<kind>')
    def export(kind):
        topology = request.args.get('topology', 'protected')
        graph = store.model.topology(topology)
        if kind == 'geojson':
            features = [{'type': 'Feature', 'properties': {k: v for k, v in d.items() if k not in ('geometry', 'trunk', 'access')},
                         'geometry': {'type': 'LineString', 'coordinates': d['geometry']}} for _, _, d in graph.edges(data=True)]
            for key, data in store.model.cities.items():
                features.append({'type': 'Feature', 'properties': {'id': key, **data}, 'geometry': {'type': 'Point', 'coordinates': [data['lon'], data['lat']]}})
            content = json.dumps({'type': 'FeatureCollection', 'features': features}, ensure_ascii=False)
            mime, suffix = 'application/geo+json', 'geojson'
        elif kind == 'csv':
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(['u', 'v', 'distance_km', 'cost_weighted_km', 'detour_pct', 'mountain_access_km'])
            for u, v, d in graph.edges(data=True):
                writer.writerow([u, v, d['distance_km'], d['cost_km'], d['detour_pct'], d['mountain_access_km']])
            content, mime, suffix = '\ufeff' + output.getvalue(), 'text/csv', 'csv'
        elif kind == 'json':
            content, mime, suffix = json.dumps(store.model.payload(), ensure_ascii=False), 'application/json', 'json'
        else:
            return jsonify(error='Экспортын төрөл олдсонгүй.'), 404
        return Response(content, mimetype=mime, headers={'Content-Disposition': f'attachment; filename="fiber-atlas-{topology}.{suffix}"'})

    @app.get('/')
    def index():
        return send_from_directory(ROOT / 'frontend/dist', 'index.html')

    @app.get('/<path:path>')
    def assets(path):
        return send_from_directory(ROOT / 'frontend/dist', path)

    return app


if __name__ == '__main__':
    create_app().run(host='127.0.0.1', port=int(os.environ.get('FIBERLAB_PORT', 5080)), debug=False, threaded=True)
