from pathlib import Path
import sys
import textwrap
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import nbformat
from fiberlab.terrain import ROOT

cells=[]
def md(source):cells.append(nbformat.v4.new_markdown_cell(textwrap.dedent(source).strip()))
def code(source):cells.append(nbformat.v4.new_code_cell(textwrap.dedent(source).strip()))

md('''
# Бие даалт — Монголын шилэн кабелийн сүлжээ

**Зорилго:** 22 хотын трассын өртгийг тооцож, MST, bridge-гүй нөөцтэй сүлжээ, full mesh-ийг харьцуулах; кабель тасрахад нөөц зам, тусгаарлагдах хот, хоцролтыг шалгах.

Энэ notebook нь шинэ Flask/React вебтэй **ижил газарзүй, ижил алгоритмын модулийг** ашиглана. Өгсөн эх ажил `BiyDaalt/Biydaalt.ipynb` тусдаа хэвээр. Картын шугамууд нь улсын хэмжээний симуляцийн трасс; бодит авто замын хэмжилт биш.

**Ажиллуулах:** `Python (Сүлжээний загварчлал)` kernel → **Restart Kernel and Run All**. Нэг нүд: **Shift+Enter**. Хадгалах: **Ctrl+S**.

Веб нээх команд (Terminal):
```bash
bash '/home/sembee/University-coursework/3A_semester/Сүлжээний загварчлал, симуляци/BiyDaalt/run-fiber-atlas.sh'
```
''')
md('''
## 1. Орчин, эх өгөгдөл

Natural Earth-ийн хил, аймаг, 14 нуур, 4 уулын бүс, 7 голын геометр ашиглана. Хотын солбицол ба ой нь эх notebook-ийн өгөгдөл. 5 км метрийн тор, бүх хэрчмийн geometry validation-тай. Өртөг нь ой болон төлөвлөсөн голын гарцын нэмэлт өртгийг тооцно.
''')
code('''
from pathlib import Path
import sys, json, math, time
root = next(p for p in [Path.cwd(), *Path.cwd().parents] if (p/'fiberlab/engine.py').exists())
sys.path.insert(0,str(root))
import networkx as nx
import pandas as pd
import matplotlib.pyplot as plt
from IPython.display import display
from fiberlab.terrain import TerrainRouter, geodesic_km
from fiberlab.engine import NetworkModel, tarjan_bridges
from shapely.geometry import shape

cache=json.loads((root/'data/routes.cache.json').read_text())
assert cache['fingerprint']==TerrainRouter.fingerprint(cache['cities'])
model=NetworkModel(cache['cities'],cache['routes'])
names={k:v['name'] for k,v in model.cities.items()}
print('Python:',sys.version.split()[0], 'NetworkX:',nx.__version__)
print('Хот:',len(model.cities),'Боломжит трасс:',len(model.routes))
print('Топологийн тооцоо:',round(model.compute_ms,2),'мс')
''')
md('''
## 2. Prim MST → MILP нөөц холбоос

MST нь бүх хотыг холбосон мод тул 22−1=21 кабельтай; бүх холбоос нь bridge. Prim-ийн жин нь terrain-weighted `cost_km`. Нэмэлт кабель сонгох бинар MILP нь MST-ийн холбоос бүрийг дор хаяж нэг cycle-д багтаах нөхцөлтэй. Энэ нь сонгосон MST дээрх хамгийн бага нэмэлт өртөг; бүх боломжит 2-edge сүлжээний глобал оптимум биш.

RTT нь хоёр талын тархалтын хугацааны **тооцоо**: `2 × урт_км × 5 / 1000` мс. Төхөөрөмжийн processing, queueing, throughput хэмжээгүй.
''')
code('''
summary=pd.DataFrame([
    {'Топологи':key,'Кабель':s['edges'],'Урт (км)':round(s['km'],1),
     'Өртөг (weighted-км)':round(s['cost_km'],1),'Bridge':s['bridge_count'],
     'RTT (мс)':round(s['rtt_ms'],2),'Нэмэлт урт (%)':round(s['overhead_pct'],1),
     'Нэг тасралт даах':s['fault_tolerant']}
    for key,s in model.stats.items()
])
display(summary)
print('MILP төлөв:',model.optimization['status'],'gap:',model.optimization['gap'])
display(pd.DataFrame([
    {'Нэмэлт кабель':names[r['u']]+' — '+names[r['v']], 'Урт (км)':round(r['distance_km'],1),
     'Төлөвлөсөн голын гарц':len(r['river_crossings'])}
    for r in model.routes.values() if r['id'] in model.optimization['added']
]))
''')
md('''
## 3. Газарзүйн трасс ба гурван топологи

MST улаан, 2-edge цэнхэр, full mesh ногоон. Нуур цэнхэр, уулын бүс бор шар. Хотын уулын бүсээс гарах нэвтрэх хэсэг шар тасархай. Голын төлөвлөсөн гарц ногоон цэнхэр тасархай. Зургийн шугамыг хялбаршуулж нуур, уул дээгүүр товчлохгүй.
''')
code('''
geo=json.loads((root/'data/layers.geojson').read_text())
def draw_geometry(ax,g,**kw):
    if g.is_empty:return
    if g.geom_type=='Polygon':
        x,y=g.exterior.xy;ax.fill(x,y,**kw)
    elif hasattr(g,'geoms'):
        for part in g.geoms:draw_geometry(ax,part,**kw)
    elif g.geom_type=='LineString':
        ax.plot(*g.xy,**kw)

fig,axes=plt.subplots(1,3,figsize=(19,6))
colors={'mst':'#cf5555','protected':'#3276ce','full':'#28865a'}
for ax,(kind,graph) in zip(axes,model.graphs.items()):
    for f in geo['features']:
        k=f['properties']['kind'];g=shape(f['geometry'])
        if k=='country':draw_geometry(ax,g,facecolor='#f1f3e9',edgecolor='#a2ad98',linewidth=.6)
        if k=='mountain':draw_geometry(ax,g,facecolor='#d7c9ac',edgecolor='none',alpha=.7)
        if k=='lake':draw_geometry(ax,g,facecolor='#82c3df',edgecolor='none')
        if k=='river':draw_geometry(ax,g,color='#78b9cd',linewidth=.6)
    for u,v,d in graph.edges(data=True):
        x,y=zip(*d['geometry']);ax.plot(x,y,color=colors[kind],lw=.4 if kind=='full' else 1.3,alpha=.15 if kind=='full' else .9)
        if kind!='full':
            for a in d['access']:
                if a['mountain_access']:
                    x,y=zip(*a['coords']);ax.plot(x,y,color='#df9c2f',ls='--',lw=1)
            for a in d['river_crossings']:
                x,y=zip(*a['coords']);ax.plot(x,y,color='#008987',ls='--',lw=2)
    for n,c in model.cities.items():ax.scatter(c['lon'],c['lat'],s=12,c='white',edgecolors='#284c3b',linewidth=.6,zorder=10)
    ax.set_xlim(87,120.5);ax.set_ylim(41,52.5);ax.set_aspect(1/math.cos(math.radians(47)))
    ax.set_title(f"{kind}: {model.stats[kind]['km']:,.0f} km / {graph.number_of_edges()} cables")
    ax.set_axis_off()
plt.tight_layout();plt.show()
''')
md('''
## 4. Нуур, уул, голын геометрийн шалгалт

Зөвхөн зургийг хараад “тойрсон” гэж дүгнэхгүй. Трассын бүх шугам улсын хил дотор, нуур огтлоогүй, үндсэн хэсэг уулыг огтлоогүй, голыг зөвхөн урьдчилан зарласан гарцаар гаталсан эсэхийг шалгана. Mountain polygon дотор байрлах хотын local access нь ил тод онцгой нөхцөл. Голын гарцууд нь **санал болгосон байршил**, бодит гүүрийн бүртгэл биш.
''')
code('''
router=TerrainRouter()
checks={r['id']:router.validate_route(r) for r in model.routes.values()}
assert all(all(c.values()) for c in checks.values())
print('Шалгасан трасс:',len(checks),'Зөрчилтэй трасс:',sum(not all(c.values()) for c in checks.values()))
print('Саадгүй торны орой:',len(router.xy),'Голын төлөвлөсөн гарц:',len(router.gates))
access=[]
for key,city in model.cities.items():
    _,a=router.endpoint(city)
    if a['mountain_access']:access.append({'Хот':names[key],'Уулын бүс дэх нэвтрэх хэсэг (км)':round(a['length_km'],1)})
display(pd.DataFrame(access))
''')
md('''
## 5. Нэг кабель тасрахад

MST-д байгаа нэг ижил кабелийг суурь ба нөөцтэй сүлжээнд тасалж харьцуулна. UB-тай холбоогүй үлдсэн хотуудыг тусгаарлагдсан гэж тооцно. Нөөцтэй сүлжээ холбоотой бол тасарсан кабелийг ашиглахгүй хамгийн богино зам буцаана.
''')
code('''
edge_id=next(d['id'] for _,_,d in model.mst.edges(data=True))
for kind in ['mst','protected']:
    result=model.cut(kind,edge_id)
    print(kind,edge_id,'Холбоотой:',result['connected'])
    print('Тусгаарлагдсан:',[names[n] for n in result['isolated']])
    if result['reroute']:
        print('Нөөц зам:',' → '.join(names[n] for n in result['reroute']))
        print('Урт:',round(result['reroute_km'],1),'км')
''')
md('''
## 6. Бүх нэг кабелийн тасралтыг exhaustive шалгах

Нэг амжилттай жишээ бүх кабелийн баталгаа болохгүй. Топологи бүрийн бүх ирмэгийг нэг нэгээр нь тасалж шалгана. Нөөцтэй сүлжээний амжилт нийт кабелийн тоотой тэнцэх ёстой.
''')
code('''
survey=[]
for kind,graph in model.graphs.items():
    cases=[model.cut(kind,d['id']) for _,_,d in graph.edges(data=True)]
    passed=sum(r['connected'] for r in cases)
    survey.append({'Топологи':kind,'Туршсан':len(cases),'Холбоотой үлдсэн':passed})
    if kind=='protected':assert passed==graph.number_of_edges()
display(pd.DataFrame(survey))
''')
md('''
## 7. Логик нөөц ба газар дээрх хам эрсдэл

Нэг трассын дундах цэгт газар дээр давхацсан бүх кабелийг хамт таслах туршилт. Нэг логик кабелийн тасралтаас өөр нөхцөл тул 2-edge сүлжээ заавал даах албагүй. Инженерийн physically disjoint хамгаалалт хийхэд тусдаа сувгийн трасс, өөр голын гарц, нэмэлт зардал шаардлагатай.
''')
code('''
shared=[model.cut('protected',d['id'],'corridor') for _,_,d in model.two.edges(data=True)]
print('Хам эрсдэлийн туршилт:',len(shared))
print('Сүлжээ салсан тохиолдол:',sum(not r['connected'] for r in shared))
print('Хамт тасарсан хамгийн олон кабель:',max(len(r['failed_edges']) for r in shared))
''')
md('''
## 8. Хоёр хотын хамгийн богино зам ба дүгнэлт

Доорх эхлэх/хүрэх хотыг өөрчлөөд дахин ажиллуулж болно. Жин нь км-ээрх `distance_km`; нийлмэл өртөг эсвэл зураг дээрх шугамын урттай андуурахгүй.
''')
code('''
source,target='Darkhan','Khentii'
route=model.path('protected',source,target)
print(' → '.join(names[n] for n in route['path']))
print('Урт:',round(route['km'],1),'км; тархалтын RTT:',round(route['rtt_ms'],2),'мс')
assert model.stats['protected']['bridge_count']==0
assert model.stats['protected']['latency_pass']
assert model.optimization['status']=='optimal'
assert len(checks)==231
print('БҮХ ШАЛГАЛТ АМЖИЛТТАЙ: 22 хот, 231 трасс, bridge-free нөөцтэй сүлжээ.')
''')
md('''
## Үр дүнг тайлбарлах хүрээ

- Зардал нь terrain-weighted км; төгрөгийн CAPEX гэж нэрлэхгүй.
- RTT нь шилэн кабелийн тархалтын тооцоо; бодит ping, traffic хэмжилт биш.
- MST дээрх нэмэлт холбоосын оптимум; бүх 2-edge сүлжээний глобал оптимум биш.
- Natural Earth нь ерөнхий бүсийн зураг; DEM налуу, хад, жижиг горхи, газар эзэмшил, бодит авто/төмөр замын трасс ороогүй.
- Уул доторх хотын нэвтрэх хэсэг ба голын төлөвлөсөн гарц тусдаа тайлагнагдсан.
- Дэлгэрэнгүй техникийн тайлан: `docs/REPORT.md`; шаардлагын нотолгоо: `docs/REQUIREMENTS.md`; тест: `evidence/pytest.txt`.

Эх сурвалж: [Natural Earth](https://www.naturalearthdata.com/), [SciPy MILP](https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.milp.html), [NetworkX](https://networkx.org/documentation/stable/), багшийн өгсөн заавар ба эх notebook.
''')
nb=nbformat.v4.new_notebook(cells=cells,metadata={'kernelspec':{'display_name':'Python (Сүлжээний загварчлал)','language':'python','name':'network-simulation'},'language_info':{'name':'python'}})
nbformat.write(nb,ROOT/'BiyDaalt_SSS.ipynb')
print('Created BiyDaalt_SSS.ipynb:',len(cells),'cells')
