import {Mountain, MapPin, Route, Waves, X, Pencil, Crosshair} from 'lucide-react';
import {COLORS, fmt} from '../../constants';

// What is this cable, what does it cost, what is attached to it.
export default function TopologyPanel({data, topology, edge, edges, selected, node, stats, chosen, name, setNode, onSelectEdge, onFocus, onEdit, busy, factor, setFactor, onFactorSave, onExclude, onShowWorstPair}) {
  if (node) {
    const ids = new Set(data.topologies[topology].edge_ids);
    const links = data.routes.filter(r => ids.has(r.id) && (r.u === node.id || r.v === node.id)).sort((a, b) => a.distance_km - b.distance_km);
    return <>
      <div>
        <div className="eyebrow count"><span>Зангилаа</span><button className="btn btn-sm btn-ghost" onClick={() => setNode(null)} aria-label="Хотын мэдээллийг хаах"><X size={13}/></button></div>
        <h3 className="title" style={{display: 'flex', alignItems: 'center', gap: 8}}><MapPin size={16}/>{node.name}</h3>
        <p className="prose" style={{marginTop: 4}}>{node.id} · {node.lat}° N, {node.lon}° E</p>
      </div>
      <div>
        <div className="eyebrow count"><span>Холбогдсон кабель</span><span className="num">{links.length}</span></div>
        {links.length ? <div className="list">
          {links.map(r => {
            const other = r.u === node.id ? r.v : r.u;
            return <button key={r.id} className="list-item" onClick={() => { onSelectEdge(r.id); onFocus?.({kind: 'edge', id: r.id}); }}>
              <span>{name(other)}</span><em className="num">{fmt(r.distance_km)} км</em>
            </button>;
          })}
        </div> : <div className="empty">Энэ топологид холбогдсон кабель байхгүй.</div>}
      </div>
      <div>
        <div className="eyebrow">Үйлдэл</div>
        <div style={{display: 'flex', gap: 6, flexWrap: 'wrap'}}>
          <button className="btn btn-sm" onClick={() => onFocus?.({kind: 'node', id: node.id})}><Crosshair size={13}/>Газар руу</button>
          <button className="btn btn-sm" onClick={() => onEdit(node)}><Pencil size={13}/>Засах</button>
        </div>
      </div>
    </>;
  }

  return <>
    <div>
      <div className="eyebrow count"><span>Сонгосон кабель</span><span className="num">{chosen ? '1' : '0'}</span></div>
      <label className="field">
        <select className="input" value={chosen ? selected : ''} onChange={e => onSelectEdge(e.target.value)} aria-label="Кабель сонгох">
          <option value="" disabled>Кабель сонгоно уу</option>
          {edges.map(r => <option key={r.id} value={r.id}>{name(r.u)} — {name(r.v)}</option>)}
        </select>
      </label>
    </div>

    {edge ? <>
      <div>
        <h3 className="title">{name(edge.u)} — {name(edge.v)}</h3>
        <div className="facts" style={{marginTop: 10}}>
          <div><small>Трассын урт</small><b className="num">{fmt(edge.distance_km, 1)}<em>км</em></b></div>
          <div><small>Шулуун зай</small><b className="num">{fmt(edge.straight_km, 1)}<em>км</em></b></div>
        </div>
      </div>
      <dl className="rows m-0">
        <div className="row"><dt><Route size={13}/>Саадыг тойрсон урт</dt><dd className="num">+{fmt(edge.detour_pct, 1)}%</dd></div>
        <div className="row"><dt><Waves size={13}/>Төлөвлөсөн голын гарц</dt><dd className="num">{edge.river_crossings?.length || 0}</dd></div>
        <div className="row"><dt>Өртөг (weighted км)</dt><dd className="num">{fmt(edge.cost_km)}<small>үржвэр ×{fmt(data.cost_factors[edge.id] || 1, 1)}</small></dd></div>
      </dl>
      {edge.mountain_access_km > 0 && <div className="callout callout-amber">
        <Mountain size={15}/><span>{fmt(edge.mountain_access_km, 1)} км нь уулын бүс доторх хотын нэвтрэх хэсэг. Карт дээр шар тасархайгаар харагдана.</span>
      </div>}
      <div>
        <div className="eyebrow">Трассын өртгийг засах</div>
        <div style={{display: 'flex', gap: 6, alignItems: 'flex-end'}}>
          <label className="field" style={{flex: 1}}>
            <span>Үржвэр (0.1–20)</span>
            <input className="input num" type="number" min="0.1" max="20" step="0.1" value={factor} onChange={e => setFactor(e.target.value)}/>
          </label>
          <button className="btn" disabled={!!busy} onClick={onFactorSave}>Хадгалах</button>
        </div>
        <button className="btn btn-ghost btn-sm" style={{marginTop: 8, color: 'var(--color-fail)'}} disabled={!!busy} onClick={onExclude}>Трассыг боломжит сангаас хасах</button>
        <p className="prose" style={{marginTop: 6}}>Үржвэр өөрчлөгдөхөд MST ба нөөц холбоос дахин бодогдоно.</p>
      </div>
    </> : <div className="empty">Карт дээр кабель дарж эсвэл дээрх жагсаалтаас сонгоно уу.</div>}

    {stats && <>
      <div>
        <div className="eyebrow">Одоогийн топологи</div>
        <dl className="rows m-0">
          <div className="row"><dt>Кабель</dt><dd className="num">{stats.edges}</dd></div>
          <div className="row"><dt>Bridge</dt><dd className={`num ${stats.bridge_count ? 'fail' : 'ok'}`}>{stats.bridge_count}</dd></div>
          <div className="row"><dt>Нийт урт</dt><dd className="num">{fmt(stats.km)} км</dd></div>
          <div className="row"><dt>Хамгийн их RTT</dt><dd className={`num ${stats.latency_pass ? 'ok' : 'fail'}`}>{stats.rtt_ms == null ? '—' : `${fmt(stats.rtt_ms, 1)} мс`}</dd></div>
        </dl>
        {stats.worst_pair?.length === 2 && <button className="btn btn-sm btn-block" style={{marginTop: 9}} onClick={onShowWorstPair}>
          <Route size={13}/>{name(stats.worst_pair[0])} — {name(stats.worst_pair[1])}
        </button>}
      </div>

      <div>
        <div className="eyebrow">Топологийн харьцуулалт</div>
        <div className="bars">
          {Object.entries(data.topologies).map(([key, value]) => {
            if (!value.stats) return null;
            const ratio = value.stats.km / (data.topologies.mst.stats?.km || 1);
            const width = Math.min(100, Math.log10(ratio) / Math.log10(40) * 100);
            return <div key={key}>
              <span style={{color: COLORS[key]}}>{key === 'mst' ? 'MST' : key === 'protected' ? '2-Edge' : 'Full'}</span>
              <div className="track"><span style={{width: `${Math.max(4, width)}%`, background: COLORS[key]}}/></div>
              <b className="num">{fmt(value.stats.km)} км</b>
            </div>;
          })}
        </div>
        <p className="prose" style={{marginTop: 8}}>Урт нь рельефийн тор дээрх симуляцийн зай, бодит авто замын хэмжилт биш. Өртөг нь харьцуулах нэгж, төгрөг биш.</p>
      </div>
    </>}
  </>;
}
