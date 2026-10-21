"""Recompute geometry/graph evidence and write the assignment's technical report."""
import json
import platform
import sys
import time
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import networkx as nx
from fiberlab.terrain import ROOT, TerrainRouter
from fiberlab.engine import NetworkModel

cache = json.loads((ROOT / 'data/routes.cache.json').read_text())
router = TerrainRouter()
assert cache['fingerprint'] == router.fingerprint(cache['cities'])
model = NetworkModel(cache['cities'], cache['routes'])
route_checks = {d['id']: router.validate_route(d) for d in cache['routes']}
assert all(all(c.values()) for c in route_checks.values())
audit = {}
for kind, graph in model.graphs.items():
    cuts = [model.cut(kind, d['id']) for _, _, d in graph.edges(data=True)]
    corridor = [model.cut(kind, d['id'], 'corridor') for _, _, d in graph.edges(data=True)]
    audit[kind] = {'tested': len(cuts), 'connected_after_cut': sum(c['connected'] for c in cuts),
                   'worst_after_cut_rtt_ms': max((c['after']['rtt_ms'] for c in cuts if c['connected']), default=None),
                   'corridor_tests': len(corridor), 'corridor_failures': sum(not c['connected'] for c in corridor),
                   'max_shared_cables': max(len(c['failed_edges']) for c in corridor)}
assert audit['protected']['tested'] == audit['protected']['connected_after_cut']
info = {
    'timestamp': datetime.now(ZoneInfo('Asia/Ulaanbaatar')).isoformat(timespec='seconds'),
    'python': platform.python_version(), 'networkx': nx.__version__,
    'cities': len(cache['cities']), 'candidate_routes': len(cache['routes']),
    'geometry_checks': route_checks, 'grid_nodes': len(router.xy), 'grid_directed_edges': router.grid.nnz,
    'strict_free_components': router.strict_component_count, 'proposed_crossings': list(router.gates.values()),
    'grid_preprocessing_ms': router.build_ms, 'route_dijkstra_ms': cache['dijkstra_ms'],
    'topology_compute_ms': model.compute_ms, 'optimization': model.optimization,
    'topologies': model.stats, 'failure_audit': audit,
    'local_access_cities': {n: router.endpoint(c)[1] for n, c in cache['cities'].items() if router.endpoint(c)[1]['mountain_access']},
}
(ROOT / 'evidence/validation.json').write_text(json.dumps(info, ensure_ascii=False, indent=2))
names = {n: c['name'] for n,c in cache['cities'].items()}
rows = []
for key, label in [('mst','MST'),('protected','2-Edge-Connected'),('full','Full Mesh')]:
    s = model.stats[key]
    rows.append(f"| {label} | {s['edges']} | {s['km']:,.1f} | {s['cost_km']:,.1f} | {s['bridge_count']} | {s['rtt_ms']:.2f} | {audit[key]['connected_after_cut']}/{audit[key]['tested']} |")
added = '\n'.join(f"- {names[d['u']]} — {names[d['v']]}: {d['distance_km']:,.1f} км; {len(d['river_crossings'])} төлөвлөсөн голын гарц." for d in cache['routes'] if d['id'] in model.optimization['added'])
access = ', '.join(f"{names[n]} ({a['length_km']:.1f} км)" for n,a in info['local_access_cities'].items())
report = f'''# Монгол улсын шилэн кабелийн сүлжээний загварчлал ба симуляци

## 1. Удиртгал ба зорилго

Монголын 22 хотыг холбоход хамгийн бага кабельтай модон сүлжээ хямд боловч нэг холбоосын гэмтэлд бүхэл хэсэг тусгаарлагдана. Төслийн зорилго нь газарзүйн саадтай трасс дээр суурилан хөрөнгө оруулалт ба найдвартай байдлын харьцааг тооцох, нөөц холбоос нэмэх, гэмтлийн үр дагаврыг интерактив байдлаар шалгах юм. Эх ажлын notebook, зааврыг өөрчлөлгүй хадгалж, газарзүйн хөдөлгүүр, графын хөдөлгүүр, Flask REST API, React/Leaflet интерфейсийг тусдаа модульд хэрэгжүүлэв.

## 2. Өгөгдөл ба газарзүйн загвар

Хотуудын нэр ба ойролцоо солбицлыг эх ажлаас авсан. Хил, аймаг, 14 нуур, 4 уулын бүс нь өгсөн Natural Earth 1:10m excerpt. Голын 7 геометрийг Natural Earth 1:10m-ээс Монголын хилээр таслан хадгалсан. Ой нь эх notebook-ийн гараар тэмдэглэсэн ойролцоо бүс.

WGS84 координатыг Монголын төвд тохируулсан Lambert Azimuthal Equal Area метрийн проекцод хувиргаж, 5 км алхамтай тор байгуулсан. Нуурын хамгаалалтын зурвас 1 км, голынх 0.5 км, уулын бүсийнх 1 км. Хилээс гарах, нуур, уул огтлох торны хэрчмийг хассан. Диагоналийн хоёр төгсгөл боломжтой байсан ч бүтэн шугам саад огтолбол хориглоно. Зургийн polyline-ийг хялбаршуулж саад огтлох товчлол үүсгээгүй. Уртыг WGS84 эллипсоид дээр геодезийн аргаар тооцсон.

Уулын өргөн polygon доторх хотыг тусгаарлахгүйн тулд хамгийн ойр харагдах боломжит торонд нэвтрэх хэсэг байгуулж, урт болон онцгой нөхцөлийг тусад нь бүртгэсэн: {access}. Эдгээрийг газрын зурагт шар тасархайгаар харуулдаг. Нэвтрэх хэсэг ч нуур, гол болон улсын хил огтлохгүй.

Голыг бүрэн хаахад тор {router.strict_component_count} хэсэгт салдаг. Голын хоёр эргийн салангид хэсгийг холбох **{len(router.gates)} санал болгосон гарц** үүсгэсэн. Эдгээр нь бодит гүүрийн тооллого биш. Гарц нь нуур/уул огтлохгүй, нэг гарцад 100 terrain-weighted км-ийн нэмэлт өртөгтэй; газрын зураг дээр ногоон цэнхэр тасархайгаар ялгана. Голын гарцаас бусад газарт голыг тойрно. Инженерийн төсөл болгоход эдгээр гарцыг газар дээр судалж, зөвшөөрөл, хийц, төсөв батлах шаардлагатай.

## 3. Онол ба алгоритм

### 3.1 Трассын хамгийн бага өртөгтэй зам

Торны хөршүүдийн уртыг суурь өртөг болгоно. Ойн нүдний үржвэр 2.5. Саадгүй торон граф дээр хот бүрээс Dijkstra ажиллуулж, хос бүрийн 231 боломжит трасс үүсгэнэ. Өртөг нь харьцуулах weighted-км; мөнгөн нэгж биш. Хамгийн бага өртөг гэдэг нь энэ тор, өгөгдөл, таамгийн хүрээнд хамаарна.

### 3.2 Prim MST

231 боломжит трассаас `cost_km`-ийг жин болгон Prim-ийн алгоритмаар хамгийн бага бүрхэгч мод олно. 22 оройтой холбоотой мод 21 ирмэгтэй. Модны бүх ирмэг bridge байдаг тул дан MST нь нэг кабелийн гэмтлийг даахгүй.

### 3.3 Tarjan bridge илрүүлэлт

Depth-first search-ийн нэвтрэх дугаар `tin`, хамгийн эрт хүрэх боломжтой өвгийн дугаар `low`-г тооцно. Модны u–v холбоосын хувьд `low[v] > tin[u]` бол bridge. Хугацааны төвөгшил O(V+E). Өөрийн хэрэгжилтийг 30 санамсаргүй граф дээр NetworkX-ийн bridge үр дүнтэй тулгасан.

### 3.4 MST дээрх нөөц холбоосын оновчлол

Нэмэлт холбоос j-г сонгох бинар хувьсагч x_j, өртгийг c_j гэвэл min Σ c_j x_j. MST-ийн холбоос i бүрийн хувьд Σ A_ij x_j ≥ 1; нэмэлт холбоосын fundamental cycle нь i холбоосыг хамарвал A_ij=1. Бүх модны холбоос дор хаяж нэг cycle-д орвол bridge үлдэхгүй.

SciPy/HiGHS MILP-ийн төлөв `{model.optimization['status']}`, optimality gap {model.optimization['gap']:.6f}. Энэ баталгаа **сонгосон нэг MST дээрх, өгсөн боломжит трассуудын нэмэлтийн** хамгийн бага өртөгт хамаарна. Бүх боломжит газар дээрх трасс эсвэл бүх 2-edge-connected сүлжээний глобал оптимум гэж үзээгүй. Жижиг 5 оройн граф дээр бүх нэмэлтийн хувилбарыг exhaustive enumeration хийж MILP-ийн хариутай тулгасан.

## 4. Симуляцийн бодит үр дүн

Дахин тооцсон цаг: {info['timestamp']}. Python {info['python']}, NetworkX {info['networkx']}. Эдгээр нь локал симуляцийн утга; бодит сүлжээний хэмжилт биш.

| Топологи | Кабель | Урт, км | Өртөг, weighted-км | Bridge | Хамгийн их RTT, мс | Нэг тасралтын дараа холбоотой |
|---|---:|---:|---:|---:|---:|---:|
{chr(10).join(rows)}

2-edge хувилбарт нэмсэн холбоосууд:

{added}

MST-ээс кабелийн урт **{model.stats['protected']['overhead_pct']:.1f}%** нэмэгдсэн. Зааврын 15–20% нь баталгаатай тогтмол үр дүн биш; зааварт “or more” зөвшөөрсөн. Өгөгдөл, хатуу саад, сонгосон MST-ээс хамаарч илүү нэмэгдэж болно. Тооцооны үр дүнг 20%-д хүчээр тааруулаагүй.

RTT = 2 × урт × 5 мкс/км. Суурь 2-edge сүлжээний хамгийн их RTT {model.stats['protected']['rtt_ms']:.2f} мс, нэг кабель тасарсны дараах хамгийн муу RTT {audit['protected']['worst_after_cut_rtt_ms']:.2f} мс. Энэ нь тархалтын тооцоо бөгөөд queueing, төхөөрөмжийн боловсруулалт, ачаалал ороогүй.

## 5. Тасралт ба газарзүйн хам эрсдэл

MST-ийн 21 кабель бүрийг тусад нь таслахад бүх тохиолдолд салсан. Нөөцтэй сүлжээний {audit['protected']['tested']} кабель бүрийг таслахад {audit['protected']['connected_after_cut']} тохиолдолд бүх 22 хот холбоотой үлдсэн. Тасарсан холбоосгүй shortest path-ийг нөөц чиглэл болгон буцаана. UB-тай нэг connected component-д үлдээгүй хотыг төвөөс тусгаарлагдсан гэж жагсаана.

Газар дээр давхцсан хоёр кабель нь логик хоёр ирмэг байсан ч нэг ухалтын гэмтэлд хамт тасарч болно. Сонгосон трассын голын цэгт давхацсан бүх кабелийг таслах shared-corridor туршилтаар 2-edge сүлжээний {audit['protected']['corridor_tests']} тохиолдлын **{audit['protected']['corridor_failures']}** нь сүлжээг салгасан. Иймээс логик 1-fault tolerance-ийг газарзүйн бүрэн бие даасан нөөцтэй андуурч болохгүй. Тусдаа суваг, өөр голын гарц бүхий physically disjoint трасс нэмэлт төсөв, судалгаа шаарддаг.

## 6. Веб систем ба өргөтгөх боломж

Flask API нь MST/2-edge/full mesh, тасралт, зам хайлт, бүх кабелийн audit, зангилаа/холбоос нэмэх-хасах-засах, GeoJSON/CSV/JSON экспорт өгнө. React + TailwindCSS интерфейс Leaflet карттай. MST улаан, 2-edge цэнхэр, full mesh ногоон. Монгол хэлний хотын шошго, саадын давхарга, кабелийн дэлгэрэнгүй, нөөц чиглэл, өгөгдлийн удирдлагатай. Засварууд локал хадгалагдаж, суурь 22 хотын төлөвт буцаах боломжтой.

Эх газарзүйн торын бэлтгэл {router.build_ms:.1f} мс, хотуудаас Dijkstra ажиллуулах хадгалсан хэмжилт {cache['dijkstra_ms']:.1f} мс. Бэлтгэсэн маршрутын топологи бодолт {model.compute_ms:.1f} мс. Хүйтэн preprocessing-ийг API-ийн warm хариунаас тусад нь хэмжсэн; зангилааны өөрчлөлтийн маршрутыг background job-оор шинэчилж хуучин зөв төлөвийг шинэ бодолт амжилттай болтол хадгална. API-ийн хэмжилт `evidence/api-benchmark.json`, автомат шалгалт `evidence/pytest.txt`-д бий.

## 7. Дүгнэлт ба хэрэглэх хүрээ

Өгсөн 22 хотын өгөгдөл дээр бүх логик нэг кабелийн гэмтлийг даах, bridge-гүй сүлжээ байгуулсан. Нуур, уулын бүс болон голын коридорыг бүх хэрчмийн огтлолцлоор шалгасан; зайлшгүй уулын нэвтрэх хэсэг ба төлөвлөсөн голын гарцыг ил тод ялгасан. Суурь notebook-оос ажиллах, засварлах, экспортлох интерактив систем болгож өргөтгөсөн.

Энэ нь улсын хэмжээний сургалтын төлөвлөлтийн симуляци. Бодит авто/төмөр замын дагуу татсан трасс, өндөршил/налуугийн DEM, зөвшөөрөлтэй bridge/culvert, мөнгөн CAPEX, сүлжээний traffic throughput болон device-failure хэмжилт ороогүй. Зааварт optional өгсөн бодит авто замын трассын баталгааг хийсэн гэж мэдэгдээгүй. Хотын солбицол ба Natural Earth уулын өргөн бүсүүдийг инженерийн survey-ээр солиход газарзүйн модулийг өргөтгөнө.

## Эх сурвалж ба дахин ажиллуулах

- Эх даалгавар: `Biydaalt_instruction_updated.md`; эх notebook: `BiyDaalt/Biydaalt.ipynb`.
- Natural Earth: https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-rivers-lake-centerlines/ — бүдүүн масштабын голын геометр, public domain.
- SciPy MILP: https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.milp.html — бинар оновчлолын solver.
- NetworkX MST: https://networkx.org/documentation/stable/reference/algorithms/generated/networkx.algorithms.tree.mst.minimum_spanning_tree.html
- Leaflet: https://leafletjs.com/reference.html ; OpenStreetMap attribution: https://www.openstreetmap.org/copyright
- Төслийн хавтас дотор `bash run-fiber-atlas.sh` — веб нээх.
- `../.venv-jupyter/bin/python -m pytest -q tests` — автомат тест.
- `../.venv-jupyter/bin/python scripts/verify_and_report.py` — үр дүн, тайланг шинээр бодох.
- `BiyDaalt_SSS.ipynb` — хичээлийн kernel-ээс алгоритм, зураг, шалгалтыг давтан ажиллуулах.
'''
(ROOT / 'docs/REPORT.md').write_text(report)
print(json.dumps({k:info[k] for k in ['cities','candidate_routes','grid_nodes','topology_compute_ms','optimization','failure_audit']},ensure_ascii=False,indent=2))
