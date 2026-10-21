import { AlertTriangle, RotateCcw, ShieldCheck, Zap, Check, X } from 'lucide-react';
import { COLORS, TOPOLOGIES, fmt } from '../constants';
import PathTool from './PathTool';

// Failure tab panel: cut one cable (or a shared corridor), read the consequence, list bridges, run the exhaustive audit.
export default function FailureLab(props) {
  const {data, topology, edge, edges, selected, chosen, busy, scope, setScope, cut, onCut, onClearCut, audit, onAudit, edgeName, changeSelected, name, onSelectNode, onHover} = props;
  const stats = data.topologies[topology].stats;
  const bridges = stats.bridges;
  const routeOf = id => data.routes.find(r => r.id === id);
  const failures = audit?.[topology]?.cases.filter(c => !c.connected) || [];
  return <>
    <div className="panel-title"><span>Тасралтын лаборатори</span><p>Кабель тасалж, сүлжээ холбоотой үлдэх эсэхийг шалгана.</p></div>
    <label className="field"><span>Тасрах кабель</span>
      <select className="input" value={chosen ? selected : ''} onChange={e => changeSelected(e.target.value)}>
        <option value="" disabled>Кабель сонгоно уу</option>
        {edges.map(r => <option key={r.id} value={r.id}>{edgeName(r)}{bridges.includes(r.id) ? ' · bridge' : ''}</option>)}
      </select></label>
    <label className="field"><span>Гэмтлийн хамрах хүрээ</span>
      <select className="input" value={scope} onChange={e => setScope(e.target.value)}>
        <option value="cable">Нэг логик кабель</option>
        <option value="corridor">Нэг зурвасын давхцсан бүх кабель</option>
      </select></label>
    <button className="btn btn-danger btn-block" disabled={!chosen || !!busy} onClick={onCut}><Zap size={15}/>Кабель тасалж турших</button>

    {cut && <div className={`cut-result ${cut.connected ? 'ok' : 'fail'}`} role="status">
      <h4>{cut.connected ? <ShieldCheck size={16}/> : <AlertTriangle size={16}/>}{cut.connected ? 'Холболт хадгалагдлаа' : 'Сүлжээ тусгаарлагдлаа'}</h4>
      <p>{cut.failed_edges.length} кабель тасарсан{cut.scope === 'corridor' ? ' (нэг зурвас)' : ''}: {cut.failed_edges.map(id => edgeName(routeOf(id))).join('; ')}.</p>
      {cut.isolated.length ? <><p>Улаанбаатараас салсан хот:</p><div className="chips">{cut.isolated.map(id => <button key={id} className="chip chip-fail" onClick={() => onSelectNode(data.cities.find(c => c.id === id))}>{name(id)}</button>)}</div></> : <p>Бүх {data.cities.length} хот сүлжээнд хэвээр.</p>}
      {cut.reroute.length > 0 && <><p className="mt-2 mb-1 text-[12px] font-medium opacity-80">Нөөц чиглэл (шар)</p><p className="route-text">{cut.reroute.map(name).join(' → ')}</p><b>{fmt(cut.reroute_km)} км · RTT {fmt(cut.reroute_rtt_ms, 1)} мс</b></>}
      {cut.after && <p className="mt-2 text-[12px] opacity-80">Тасралтын дараа: {cut.after.bridge_count} bridge, {cut.after.rtt_ms == null ? `${cut.after.components.length} салангид хэсэг` : `хамгийн их RTT ${fmt(cut.after.rtt_ms, 1)} мс`}.</p>}
      <button className="link mt-2" onClick={onClearCut}><RotateCcw size={12}/>Тасралтыг арилгах</button>
    </div>}

    <div>
      <div className="section-label">Критик холбоос (bridge) <small>{bridges.length} / {stats.edges}</small></div>
      {bridges.length ? <>
        <p className="mt-0 mb-2 text-[12px] leading-relaxed text-slate">Tarjan-ийн алгоритмаар илэрсэн. Аль нэг нь тасрахад сүлжээ салангид хэсэгт хуваагдана.</p>
        <div className="bridge-list">{bridges.map(id => <button key={id} aria-current={selected === id} onClick={() => changeSelected(id)} onMouseEnter={() => onHover(id)} onMouseLeave={() => onHover(null)} onFocus={() => onHover(id)} onBlur={() => onHover(null)}><i/>{edgeName(routeOf(id))}</button>)}</div>
      </> : <div className="callout callout-ok"><Check size={15}/>Энэ топологид bridge байхгүй. Сүлжээ 2-edge-connected.</div>}
    </div>

    <div>
      <div className="section-label">Бүх кабелийн гэмтлийг шалгах</div>
      <p className="mt-0 mb-2 text-[12px] leading-relaxed text-slate">Гурван топологийн кабель бүрийг нэг нэгээр тасалж, холбоотой үлдсэн тоог гаргана.</p>
      {audit ? <div className="audit-grid">{TOPOLOGIES.map(t => { const a = audit[t.key]; const pass = a && a.passed === a.tested; return (
        <div key={t.key}><i className="swatch" style={{background: COLORS[t.key]}}/><span>{t.name}</span><b>{a ? `${a.passed} / ${a.tested}` : '—'}</b>{pass ? <Check size={14} className="text-ok"/> : <X size={14} className="text-fail"/>}</div>);
      })}</div> : <button className="btn btn-block" disabled={!!busy} onClick={onAudit}><ShieldCheck size={15}/>Шалгалт ажиллуулах</button>}
      {audit && failures.length > 0 && <p className="mt-2 text-[12px] leading-relaxed text-slate">{TOPOLOGIES.find(t => t.key === topology).short} дээр {failures.length} кабель тасрахад сүлжээ салдаг. Дээрх bridge жагсаалттай таарна.</p>}
    </div>
    <PathTool {...props} />
  </>;
}
