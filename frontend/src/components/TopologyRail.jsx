import { Route } from 'lucide-react';
import { COLORS, TOPOLOGIES, fmt } from '../constants';

// Left rail: pick a topology, read its headline numbers, compare it with the other two.
export default function TopologyRail({data, topology, setTopology, name, edgeName, onShowWorstPair, onHover, changeSelected, selected, busy}) {
  const stats = data.topologies[topology].stats;
  const fullKm = data.topologies.full.stats.km;
  const mstKm = data.topologies.mst.stats.km;
  const added = topology === 'protected' ? data.optimization.added : [];
  const routeOf = id => data.routes.find(r => r.id === id);
  return <aside className="rail" aria-label="Топологи ба үзүүлэлт">
    <div className="section-label">Топологи <small>1 · 2 · 3 товчлуур</small></div>
    <div className="topo-list" role="radiogroup" aria-label="Топологи сонгох">
      {TOPOLOGIES.map(t => { const s = data.topologies[t.key].stats; return (
        <button key={t.key} className="topo" role="radio" aria-checked={topology === t.key} onClick={() => setTopology(t.key)}>
          <i className="swatch" style={{background: COLORS[t.key]}}/>
          <span><b>{t.short === 'MST' ? 'MST' : t.name}</b><small>{t.hint}</small></span>
          <em>{s.edges} кабель</em>
        </button>);
      })}
    </div>

    <div className="hero-stat">
      <b>{fmt(stats.km)}<small>км</small></b>
      <span>{topology === 'mst' ? 'Хамгийн бага бүрхэгч модны нийт урт' : `MST-ээс ${fmt(stats.overhead_pct, 1)}% илүү кабель`}</span>
    </div>
    <dl className="m-0">
      <div className="stat-row"><dt>Кабелийн тоо</dt><dd>{stats.edges}<small>{data.cities.length} хот, {stats.connected ? 'нэгдсэн сүлжээ' : 'салангид хэсэгтэй'}</small></dd></div>
      <div className="stat-row"><dt>Критик холбоос</dt><dd className={stats.fault_tolerant ? 'text-ok' : 'text-fail'}>{stats.bridge_count} bridge<small>{stats.fault_tolerant ? 'Нэг кабелийн тасралт даана' : 'Нэг кабель тасрахад хот тусгаарлагдана'}</small></dd></div>
      <div className="stat-row"><dt>Хамгийн их RTT</dt><dd className={stats.latency_pass ? '' : 'text-fail'}>{fmt(stats.rtt_ms, 1)} мс<small>{stats.worst_pair ? <button className="link text-[11px]" disabled={!!busy} onClick={onShowWorstPair} title="Энэ хоёр хотын замыг карт дээр харуулах"><Route size={11}/>{name(stats.worst_pair[0])} — {name(stats.worst_pair[1])}</button> : '—'} · хязгаар 50 мс</small></dd></div>
      <div className="stat-row"><dt>Өртөг</dt><dd>{fmt(stats.cost_km)}<small>terrain-weighted км</small></dd></div>
    </dl>

    {added.length > 0 && <div className="mt-4">
      <div className="section-label">Нэмсэн нөөц холбоос <small>{added.length} · +{fmt(data.optimization.added_cost_km)} w-км</small></div>
      <div className="bridge-list added-list">{added.map(id => { const r = routeOf(id); return r && <button key={id} aria-current={selected === id} onClick={() => changeSelected(id)} onMouseEnter={() => onHover(id)} onMouseLeave={() => onHover(null)} onFocus={() => onHover(id)} onBlur={() => onHover(null)}><i/>{edgeName(r)}<em>{fmt(r.distance_km)} км</em></button>; })}</div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-muted">MST дээр MILP-ээр сонгосон: модны холбоос бүрийг дор хаяж нэг цагирагт оруулах хамгийн хямд багц. Карт дээр цайвар тасархай голтой зураас.</p>
    </div>}

    <div className="section-label mt-5">Уртын харьцуулалт <small>лог масштаб</small></div>
    <div className="bars">
      {TOPOLOGIES.map(t => { const s = data.topologies[t.key].stats; const w = Math.log10(s.km / mstKm * 10) / Math.log10(fullKm / mstKm * 10) * 100; return (
        <div key={t.key}><span>{t.short}</span><div className="track"><span style={{width: `${Math.max(4, w)}%`, background: COLORS[t.key]}}/></div><b>{fmt(s.km)} км</b></div>);
      })}
    </div>
    <p className="mt-3 text-[11.5px] leading-relaxed text-muted">Урт нь рельефийн тор дээрх симуляцийн зай, бодит авто замын хэмжилт биш. Өртөг нь харьцуулах нэгж, төгрөг биш.</p>
  </aside>;
}
