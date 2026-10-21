import { ArrowRight, MapPin, Mountain, Route, X, Pencil, Waves } from 'lucide-react';
import { fmt } from '../constants';
import PathTool from './PathTool';

function EdgeSelect({edges, selected, onChange, edgeName}) {
  return <label className="field"><span>Кабель</span>
    <select className="input" value={selected || ''} onChange={e => onChange(e.target.value)}>
      <option value="" disabled>Кабель сонгоно уу</option>
      {edges.map(r => <option key={r.id} value={r.id}>{edgeName(r)}</option>)}
    </select></label>;
}

function NodeCard({node, data, topology, cut, name, onClose, onEdit, onSelectEdge, setSource, setTarget, onHover}) {
  const ids = new Set(data.topologies[topology].edge_ids);
  const links = data.routes.filter(r => ids.has(r.id) && (r.u === node.id || r.v === node.id)).sort((a, b) => a.distance_km - b.distance_km);
  const isolated = cut?.isolated?.includes(node.id);
  return <>
    <div className="panel-title"><span><span className="flex items-center gap-2"><MapPin size={17}/>{node.name}</span><button className="btn btn-sm" onClick={onClose} aria-label="Хотын мэдээллийг хаах"><X size={14}/></button></span></div>
    <div className="text-[12.5px] text-slate">{node.id} · {node.lat}° N, {node.lon}° E</div>
    {isolated && <div className="callout callout-fail">Одоогийн тасралтаар энэ хот Улаанбаатараас салсан байна.</div>}
    <div>
      <div className="section-label">Холбогдсон кабель <small>{links.length}</small></div>
      {links.length ? <div className="node-list">{links.map(r => { const other = r.u === node.id ? r.v : r.u; return (
        <div key={r.id} onMouseEnter={() => onHover(r.id)} onMouseLeave={() => onHover(null)}><button className="link" onClick={() => onSelectEdge(r.id)} onFocus={() => onHover(r.id)} onBlur={() => onHover(null)}>{name(other)}</button><span className="text-slate text-[12.5px]">{fmt(r.distance_km)} км</span></div>);
      })}</div> : <div className="empty">Энэ топологид холбогдсон кабель байхгүй.</div>}
    </div>
    <div className="flex flex-wrap gap-2">
      <button className="btn btn-sm" onClick={() => setSource(node.id)}>Эндээс зам</button>
      <button className="btn btn-sm" onClick={() => setTarget(node.id)}>Энд хүрэх</button>
      <button className="btn btn-sm" onClick={() => onEdit(node)}><Pencil size={13}/>Засах</button>
    </div>
  </>;
}

// Design tab panel: what is this cable, what does it cost, how would traffic travel between two cities.
export default function CableInspector(props) {
  const {data, topology, edge, edges, selected, node, chosen, busy, factor, setFactor, onFactorSave, onExclude, edgeName, changeSelected} = props;
  if (node) return <NodeCard {...props} />;
  return <>
    <div className="panel-title"><span>Трассын шинжилгээ</span></div>
    <EdgeSelect edges={edges} selected={chosen ? selected : ''} onChange={changeSelected} edgeName={edgeName}/>
    {edge ? <>
      <div>
        <h3 className="m-0 mb-3 text-[16px] font-semibold leading-snug">{edgeName(edge)}</h3>
        <div className="facts">
          <div><small>Трассын урт</small><b>{fmt(edge.distance_km, 1)}<span>км</span></b></div>
          <div><small>Шулуун зай</small><b>{fmt(edge.straight_km, 1)}<span>км</span></b></div>
        </div>
        <dl className="m-0 mt-2">
          <div className="stat-row"><dt><span className="flex items-center gap-1.5"><Route size={13}/>Саадыг тойрсон урт</span></dt><dd>+{fmt(edge.detour_pct, 1)}%</dd></div>
          <div className="stat-row"><dt><span className="flex items-center gap-1.5"><Waves size={13}/>Төлөвлөсөн голын гарц</span></dt><dd>{edge.river_crossings?.length || 0}</dd></div>
          <div className="stat-row"><dt>Өртөг (weighted км)</dt><dd>{fmt(edge.cost_km)}<small>үржвэр ×{fmt(data.cost_factors[edge.id] || 1, 1)}</small></dd></div>
        </dl>
      </div>
      {edge.mountain_access_km > 0 && <div className="callout callout-amber"><Mountain size={16}/><span>{fmt(edge.mountain_access_km, 1)} км нь уулын бүс доторх хотын нэвтрэх хэсэг. Карт дээр шар тасархайгаар харагдана.</span></div>}
      <details className="group">
        <summary className="link list-none">Трассын өртгийг засах</summary>
        <div className="mt-3 flex items-end gap-2">
          <label className="field flex-1"><span>Өртгийн үржвэр (0.1–20)</span><input className="input" type="number" min="0.1" max="20" step="0.1" value={factor} onChange={e => setFactor(e.target.value)}/></label>
          <button className="btn" disabled={!!busy} onClick={onFactorSave}>Хадгалах</button>
        </div>
        <button className="link link-danger mt-3" disabled={!!busy} onClick={onExclude}>Трассыг боломжит сангаас хасах</button>
        <p className="mt-2 text-[12px] leading-relaxed text-muted">Үржвэр өөрчлөгдөхөд MST ба нөөц холбоос дахин бодогдоно.</p>
      </details>
    </> : <div className="empty">Карт дээр кабель дарж эсвэл дээрх жагсаалтаас сонгоно уу.</div>}
    <PathTool {...props} />
  </>;
}
