"""Local Flask API and built React UI. No cloud account or runtime data fetch."""
import csv
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

    def rebuild(self, cities):
        self.require_idle()
        self.busy = True
        job_id = str(uuid.uuid4())
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
        return jsonify(status='ok', application='fiber-atlas', root=str(ROOT), busy=store.busy, revision=store.revision)

    @app.get('/api/network/topologies')
    def topologies():
        with store.lock:
            return jsonify(**store.model.payload(), revision=store.revision, busy=store.busy,
                           preprocessing=store.preprocessing)

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
