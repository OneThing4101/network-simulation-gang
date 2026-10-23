import itertools
import json
import math
from pathlib import Path
import time
import networkx as nx
import numpy as np
import pytest
from fiberlab.terrain import TerrainRouter, ROOT, geodesic_km
from fiberlab.engine import NetworkModel, tarjan_bridges, augment_mst, statistics
from fiberlab.app import create_app


@pytest.fixture(scope='module')
def cache():
    return json.loads((ROOT / 'data/routes.cache.json').read_text())


@pytest.fixture(scope='module')
def model(cache):
    return NetworkModel(cache['cities'], cache['routes'])


@pytest.fixture(scope='module')
def router():
    instance = TerrainRouter()
    yield instance
    # The routing grid is the largest native object in the suite. Releasing it
    # here keeps the process from tearing it down during shutdown.
    instance.release()


@pytest.fixture(scope='module')
def app():
    application = create_app(persist=False)
    application.testing = True
    return application


def test_all_routes_continuous_obstacle_and_endpoint_checks(router, cache):
    assert len(cache['routes']) == 231 and len(cache['cities']) == 22
    assert cache['fingerprint'] == router.fingerprint(cache['cities'])
    for route in cache['routes']:
        assert all(router.validate_route(route).values()), route['id']
        u, v = cache['cities'][route['u']], cache['cities'][route['v']]
        assert route['geometry'][0] == [u['lon'], u['lat']]
        assert route['geometry'][-1] == [v['lon'], v['lat']]
        assert route['distance_km'] >= route['straight_km'] - 0.01
        assert math.isclose(route['distance_km'], geodesic_km(route['geometry']), rel_tol=1e-10)


def test_grid_has_no_corner_cutting(router):
    # Independent continuous check over ALL graph segments, not only city routes.
    from shapely import linestrings, intersects, covered_by
    graph = router.grid.tocoo()
    keep = graph.row < graph.col
    lines = linestrings(np.stack([router.xy[graph.row[keep]],router.xy[graph.col[keep]]],axis=1))
    assert not intersects(lines, router.blocked.difference(router.gate_geometry)).any()
    assert covered_by(lines, router.country).all()


def test_invalid_water_and_country_endpoints(router):
    point = router.lakes.representative_point()
    lon, lat = router.inverse.transform(point.x, point.y)
    with pytest.raises(ValueError):
        router.endpoint({'lat':lat,'lon':lon,'name':'Water'})
    with pytest.raises(ValueError):
        router.endpoint({'lat':0,'lon':0,'name':'Outside'})


def test_tarjan_matches_independent_oracle():
    for seed in range(30):
        graph = nx.gnp_random_graph(18, 0.13, seed=seed)
        assert set(tarjan_bridges(graph)) == {tuple(sorted(e)) for e in nx.bridges(graph)}


def test_exact_augmentation_matches_bruteforce():
    graph = nx.complete_graph(5)
    for u,v in graph.edges:
        graph[u][v].update(cost_km=1+(u*13+v*7)%17,id=f'{u}--{v}')
    tree = nx.minimum_spanning_tree(graph,weight='cost_km')
    result, info = augment_mst(graph,tree)
    candidates = [(u,v) for u,v in graph.edges if not tree.has_edge(u,v)]
    optimum = math.inf
    for mask in itertools.product((0,1),repeat=len(candidates)):
        H=tree.copy(); selected=[e for bit,e in zip(mask,candidates) if bit]
        H.add_edges_from(selected)
        if not list(nx.bridges(H)):
            optimum=min(optimum,sum(graph[u][v]['cost_km'] for u,v in selected))
    assert info['status']=='optimal'
    assert math.isclose(info['added_cost_km'],optimum)
    assert info['global_2ec_optimum'] is False


def test_every_single_failure_and_reroute(model):
    assert nx.is_tree(model.mst) and model.mst.number_of_edges()==21
    assert model.stats['protected']['bridge_count']==0
    assert model.optimization['status']=='optimal'
    for key,graph in model.graphs.items():
        for u,v,data in graph.edges(data=True):
            result=model.cut(key,data['id'])
            assert result['connected'] == (key!='mst')
            if key!='mst':
                assert not result['isolated']
                assert result['reroute'][0]==u and result['reroute'][-1]==v
                assert data['id'] not in result['reroute_edges']
                assert math.isclose(result['reroute_rtt_ms'],result['reroute_km']*.01)
            else:
                assert len(result['components'])==2 and result['isolated']
    assert all(s['latency_pass'] for s in model.stats.values())


def test_corridor_risk_is_not_misrepresented(model):
    cases=[model.cut('protected',d['id'],'corridor') for _,_,d in model.two.edges(data=True)]
    assert any(len(c['failed_edges'])>1 for c in cases)
    assert any(not c['connected'] for c in cases)


def test_disconnected_and_infeasible_model(cache):
    excluded=[r['id'] for r in cache['routes'] if r['u']=='UB' or r['v']=='UB']
    model=NetworkModel(cache['cities'],cache['routes'],excluded)
    assert not model.stats['full']['connected']
    assert model.stats['full']['rtt_ms'] is None
    assert not model.stats['full']['latency_pass']
    assert model.two is None


def test_api_contract_and_performance(app):
    client=app.test_client()
    timings={}
    for path in ['/api/health','/api/network/topologies','/api/geography','/api/network/audit','/api/export/geojson','/api/export/csv','/api/export/json']:
        start=time.perf_counter();response=client.get(path);timings[path]=(time.perf_counter()-start)*1000
        assert response.status_code==200,path
        assert timings[path]<1000,(path,timings[path])
    model=app.extensions['network_store'].model
    route=next(iter(model.two.edges(data=True)))[2]
    for path,body in [('/api/network/simulate-cut',{'topology':'protected','edge_id':route['id']}),('/api/network/path',{'source':'UB','target':'Darkhan','topology':'protected'})]:
        start=time.perf_counter();response=client.post(path,json=body);timings[path]=(time.perf_counter()-start)*1000
        assert response.status_code==200 and response.json['connected']
        assert timings[path]<1000
    (ROOT/'evidence/api-benchmark.json').write_text(json.dumps(timings,indent=2))


@pytest.mark.parametrize('path,body',[
    ('/api/network/simulate-cut',{'edge_id':'absent'}),
    ('/api/network/simulate-cut',{'topology':'wrong'}),
    ('/api/network/simulate-cut',{'topology':[],'edge_id':'no'}),
    ('/api/network/simulate-cut',{'edge_id':[]}),
    ('/api/network/path',{'source':'wrong','target':'UB'}),
    ('/api/network/path',{'source':[],'target':'UB'}),
    ('/api/network/path',{'source':'UB','target':'UB','failed_edges':'bad'}),
    ('/api/nodes',{'id':'bad--','name':'x','lat':47,'lon':107}),
    ('/api/nodes',{'id':'New','name':'','lat':47,'lon':107}),
    ('/api/nodes',{'id':'New','name':None,'lat':47,'lon':107}),
    ('/api/nodes',{'id':'UB','name':'duplicate','lat':47,'lon':107}),
])
def test_api_rejects_invalid_requests(app,path,body):
    assert app.test_client().post(path,json=body).status_code==400


def test_api_origin_and_malformed(app):
    client=app.test_client()
    assert client.post('/api/network/reset',json={},headers={'Origin':'https://elsewhere.invalid'}).status_code==403
    assert client.post('/api/network/reset',data='text').status_code==415
    assert client.post('/api/network/reset',json=[]).status_code==400
    assert client.get('/api/jobs/missing').status_code==404
    assert client.get('/api/export/wrong').status_code==404


def test_edge_crud_recompute(app):
    client=app.test_client()
    key=next(iter(app.extensions['network_store'].model.routes))
    assert client.delete(f'/api/edges/{key}',json={}).status_code==200
    assert key in client.get('/api/network/topologies').json['excluded']
    assert client.post(f'/api/edges/{key}',json={'cost_factor':2}).status_code==200
    assert key not in client.get('/api/network/topologies').json['excluded']
    assert client.get('/api/network/topologies').json['cost_factors'][key]==2
    assert client.patch(f'/api/edges/{key}',json={'cost_factor':-1}).status_code==400
    assert client.post('/api/network/reset',json={}).status_code==200


def test_node_crud_and_atomic_failure(app,router):
    store=app.extensions['network_store'];store.router=router
    client=app.test_client()
    def wait(response):
        assert response.status_code==202
        job_id=response.json['job_id']
        deadline=time.monotonic()+40
        while time.monotonic()<deadline:
            state=client.get('/api/jobs/'+job_id).json
            if state['status']!='running': return state
            time.sleep(.02)
        pytest.fail('Route rebuild did not finish')
    result=wait(client.post('/api/nodes',json={'id':'Demo','name':'Туршилт','lat':45.7,'lon':107.0}))
    assert result['status']=='complete',result
    assert len(client.get('/api/network/topologies').json['cities'])==23
    result=wait(client.patch('/api/nodes/Demo',json={'name':'Зассан','lat':45.8}))
    assert result['status']=='complete'
    assert store.model.cities['Demo']['name']=='Зассан'
    assert client.delete('/api/nodes/Demo',json={}).status_code==200
    assert len(store.model.cities)==22
    result=wait(client.post('/api/nodes',json={'id':'Outside','name':'Гадна','lat':42,'lon':88}))
    assert result['status']=='failed' and 'Outside' not in store.model.cities
    assert client.delete('/api/nodes/UB',json={}).status_code==400
    assert client.post('/api/network/reset',json={}).status_code==200
