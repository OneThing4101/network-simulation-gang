import { Route } from 'lucide-react';
import { COLORS, TOPOLOGIES, fmt } from '../constants';

// Left card: segmented topology switch, KPI tiles for the chosen one, the added ring links, and a length comparison.
export default function TopologyRail({data, topology, setTopology, name, edgeName, onShowWorstPair, onHover, changeSelected, selected, busy}) {
  const current = TOPOLOGIES.find(t => t.key === topology);
  const stats = data.topologies[topology].stats;
  const fullKm = data.topologies.full.stats.km;
  const mstKm = data.topologies.mst.stats.km;
  const added = topology === 'protected' ? data.optimization.added : [];
  const routeOf = id => data.routes.find(r => r.id === id);
  return <aside className="rail" aria-label="Топологи ба үзүүлэлт">
    <div className="section-label">Топологи <small>1 · 2 · 3 товчлуур</small></div>
    <div className="topo-seg" role="radiogroup" aria-label="Топологи сонгох">
      {TOPOLOGIES.map(t => { const s = data.topologies[t.key].stats; return (
        <button key={t.key} className="topo" role="radio" aria-checked={topology === t.key} onClick={() => setTopology(t.key)}>
          <b>{t.short}</b><em>{s.edges} кабель</em><i style={{background: COLORS[t.key]}}/>
        </button>);
      })}
    </div>
    <p className="topo-desc"><b>{current.name}</b><span>{current.hint}</span></p>

    <div className="kpis">
      <div className="kpi wide"><small>Нийт кабелийн урт</small><b>{fmt(stats.km)}<span>км</span></b><em>{topology === 'mst' ? 'Хамгийн бага бүрхэгч модны нийт урт' : `MST-ээс ${fmt(stats.overhead_pct, 1)}% илүү кабель`}</em></div>
      <div className="kpi"><small>Кабель</small><b>{stats.edges}</b><em>{data.cities.length} хот · {stats.connected ? 'нэгдсэн' : 'салангид'}</em></div>
      <div className={`kpi ${stats.fault_tolerant ? 'ok' : 'fail'}`}><small>Критик холбоос</small><b>{stats.bridge_count}<span>bridge</span></b><em>{stats.fault_tolerant ? 'Нэг тасралтыг даана' : 'Нэг тасралтад хот сална'}</em></div>
      <div className={`kpi ${stats.latency_pass ? '' : 'fail'}`}><small>Хамгийн их RTT</small><b>{fmt(stats.rtt_ms, 1)}<span>мс</span></b><em>хязгаар 50 мс</em></div>
      <div className="kpi"><small>Өртөг</small><b>{fmt(stats.cost_km)}</b><em>terrain-weighted км</em></div>
      {stats.worst_pair && <div className="kpi wide"><small>Хамгийн урт зам</small><button className="link" disabled={!!busy} onClick={onShowWorstPair} title="Энэ хоёр хотын хоорондох замыг карт дээр харуулах"><Route size={11}/>{name(stats.worst_pair[0])} — {name(stats.worst_pair[1])}</button></div>}
    </div>

    {added.length > 0 && <div className="mt-4">
      <div className="section-label">Нэмсэн нөөц холбоос <small>{added.length} · +{fmt(data.optimization.added_cost_km)} w-км</small></div>
      <div className="bridge-list added-list">{added.map(id => { const r = routeOf(id); return r && <button key={id} aria-current={selected === id} onClick={() => changeSelected(id)} onMouseEnter={() => onHover(id)} onMouseLeave={() => onHover(null)} onFocus={() => onHover(id)} onBlur={() => onHover(null)}><i/>{edgeName(r)}<em>{fmt(r.distance_km)} км</em></button>; })}</div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-muted">MST дээр MILP-ээр сонгосон: модны холбоос бүрийг дор хаяж нэг цагирагт оруулах хамгийн хямд багц. Карт дээр цайвар тасархай голтой зураасаар харагдана.</p>
    </div>}

    <div className="section-label mt-5">Уртын харьцуулалт <small>лог масштаб</small></div>
    <div className="bars">
      {TOPOLOGIES.map(t => { const s = data.topologies[t.key].stats; const w = Math.log10(s.km / mstKm * 10) / Math.log10(fullKm / mstKm * 10) * 100; return (
        <div key={t.key}><span>{t.short}</span><div className="track"><span style={{width: `${Math.max(4, w)}%`, background: COLORS[t.key]}}/></div><b>{fmt(s.km)} км</b></div>);
      })}
    </div>
    <p className="mt-3 text-[11.5px] leading-relaxed text-muted">Урт нь рельефийн тор дээрх симуляцийн зай бөгөөд бодит авто замын хэмжилт биш. Өртөг нь харьцуулах нэгж, төгрөгөөр илэрхийлэгдээгүй.</p>
  </aside>;
}
