import {useState} from 'react';
import {AlertTriangle, Check, LoaderCircle, MapPinned, ShieldCheck, X, Zap} from 'lucide-react';
import {fmt} from '../../constants';
import {get} from '../../api';
import PathTool from './PathTool';

const SCOPES = [
  {key: 'cable', short: 'Нэг кабель', label: 'Нэг логик кабель'},
  {key: 'corridor', short: 'Дунд цэг', label: 'Дунд цэгийн сэжиглэл (baseline)'},
  {key: 'shared_risk', short: 'Геометр', label: 'Геометр дээрх нийтлэг зурвас'},
];

// Failure lab: cut a cable, read the consequence, then look for the trap that
// logical redundancy cannot cover.
export default function ResiliencePanel({
  data, topology, edges, selected, chosen, busy, scope, setScope,
  replay, onRun, onClear, name, onSelectEdge, onFocus, corridor, corridorLoading,
  source, setSource, target, setTarget, onHighlight,
}) {
  const [audit, setAudit] = useState(null);
  const [auditing, setAuditing] = useState(false);
  const stats = data.topologies[topology]?.stats;
  const bridges = stats?.bridges || [];
  const routeOf = id => data.routes.find(r => r.id === id);
  const label = id => {
    const route = routeOf(id);
    return route ? `${name(route.u)} — ${name(route.v)}` : id;
  };

  async function runAudit() {
    setAuditing(true);
    try {
      setAudit(await get('/api/network/audit'));
    } catch {
      setAudit(null);
    } finally {
      setAuditing(false);
    }
  }

  return <>
    <div>
      <div className="eyebrow">Тасрах холбоос</div>
      <label className="field">
        <select className="input" value={chosen ? selected : ''} onChange={e => onSelectEdge(e.target.value)} aria-label="Тасрах кабель">
          <option value="" disabled>Кабель сонгоно уу</option>
          {edges.map(r => <option key={r.id} value={r.id}>{name(r.u)} — {name(r.v)}{bridges.includes(r.id) ? ' · bridge' : ''}</option>)}
        </select>
      </label>
    </div>

    <div>
      <div className="eyebrow">Гэмтлийн хамрах хүрээ</div>
      <div className="segmented" role="group" aria-label="Гэмтлийн хамрах хүрээ">
        {SCOPES.map(item => <button key={item.key} aria-pressed={scope === item.key} onClick={() => setScope(item.key)}>{item.short}</button>)}
      </div>
      <p className="prose" style={{marginTop: 6}}>{replay?.scope_note || SCOPES.find(s => s.key === scope)?.label}.</p>
    </div>

    <button className="btn btn-danger btn-block" disabled={!chosen || !!busy} onClick={onRun}>
      <Zap size={15}/>Кабель тасалж турших
    </button>

    {replay && <div className="callout callout-plain" role="status">
      <div style={{display: 'grid', gap: 6, width: '100%'}}>
        <strong style={{color: replay.after?.connected ? 'var(--color-ok)' : 'var(--color-fail)', display: 'flex', alignItems: 'center', gap: 7}}>
          {replay.after?.connected ? <ShieldCheck size={15}/> : <AlertTriangle size={15}/>}
          {replay.after?.connected ? 'Холболт хадгалагдлаа' : 'Сүлжээ тусгаарлагдлаа'}
        </strong>
        <span>{replay.failed_edges.length} кабель тасарлаа: {replay.failed_edges.map(label).join('; ')}.</span>
        {replay.isolated?.length > 0 && <span>Улаанбаатараас салсан хотууд: {replay.isolated.map(id => name(id)).join(', ')}.</span>}
        {replay.after?.reroute?.length > 0 && <span>Нөөц чиглэл: {replay.after.reroute.map(name).join(' → ')} ({fmt(replay.after.reroute_km)} км, {fmt(replay.after.reroute_rtt_ms, 1)} мс).</span>}
      </div>
      <button className="btn btn-sm btn-ghost" onClick={onClear} style={{marginTop: 8}}><X size={12}/>Арилгах</button>
    </div>}

    <div>
      <div className="eyebrow count"><span>Критик холбоос (bridge)</span><span className="num">{bridges.length} / {stats?.edges ?? 0}</span></div>
      {bridges.length ? <>
        <p className="prose" style={{marginBottom: 8}}>Tarjan-ийн low-link DFS олсон. Аль нэг нь тасрахад сүлжээ салангид хэсэгт хуваагдана.</p>
        <div className="list">
          {bridges.map(id => <button key={id} className="list-item" aria-current={selected === id} onClick={() => { onSelectEdge(id); onFocus?.({kind: 'edge', id}); }}>
            <i className="dash" style={{color: 'var(--color-fail)'}}/>
            <span>{label(id)}</span>
          </button>)}
        </div>
      </> : <div className="callout callout-ok"><Check size={15}/>Энэ топологид bridge байхгүй. Логик 1-edge тэсвээр хамгаалагдлаа.</div>}
    </div>

    {corridor && <div>
      <div className="eyebrow count"><span>Геометр дээрх нийтлэг зурвас</span><span className="num">{corridor.groups?.length ?? 0} бүлэг</span></div>
      {corridor.groups?.length ? <>
        <p className="prose">Проекцласан метр зангилаанд <strong>зэрэгцээ явж</strong> байгаа кабелийн бүлэг. Эдгээрийг нэгэн зэрэг гасгаж болно.</p>
        <div className="list">
          {corridor.groups.slice(0, 8).map(group => <button key={group.id} className="list-item" onClick={() => onSelectEdge(group.edge_ids[0])}>
            <MapPinned size={13} style={{color: 'var(--color-fail)'}}/>
            <span>{group.edge_ids.length} кабель</span><em className="num">{fmt(group.overlap_km, 1)} км</em>
          </button>)}
        </div>
      </> : <p className="prose">Өгөгдсөн зайлшгүйцээсээр олдсон давхцлын бүлэг байхгүй.</p>}
    </div>}

    {corridorLoading && <div>
      <div className="eyebrow count"><span>Геометр дээрх нийтлэг зурвас</span></div>
      <div className="empty" style={{display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center'}}>
        <LoaderCircle className="spin" size={14}/>Зурвасны давхцлыг тооцож байна…
      </div>
      <p className="prose" style={{marginTop: 6}}>Бүх маршрутын хоорондын давхцлыг шалгах нь хамгийн удаан тооцоо. Full mesh топологид энэ нь хэдэн секунд үргэлжлэх бөгөөд дараагийн удаа хурдан болно.</p>
    </div>}

    {corridor?.coverage?.length > 0 && (() => {
      const shared = corridor.coverage.filter(item => item.parallel_km >= 1);
      const meetingOnly = corridor.coverage.length - shared.length;
      const worst = [...shared].sort((a, b) => b.parallel_km - a.parallel_km)[0];
      if (!worst) return null;
      return <div>
        <div className="eyebrow count"><span>Логик хамгаалалтын географийн дүнцэг</span><span className="num">{shared.length}/{corridor.coverage.length}</span></div>
        <div className="callout callout-fail" style={{flexDirection: 'column', alignItems: 'stretch', gap: 8}}>
          <span><strong>{shared.length} нэмэлт холбоос</strong> байгаа нь хамгаалж байгаа модны холбоосоо <strong>1 км-ээс дээш</strong> уртаар зэрэгцээ явж байна.</span>
          <span>Хамгийн их нь <strong className="num">{fmt(worst.parallel_km, 1)} км</strong>: <strong>{label(worst.tree_edge)}</strong> холбоосыг хамгаалах <strong>{label(worst.chord)}</strong> нь хамт нь явж байна. Энэ хэсэгт нэг шахал хийвэл нөөц зам устана.</span>
          <span>Үлдсэн <strong>{meetingOnly}</strong> нэмэлт холбоос хамгаалж байгаа холбоосоо <strong>зөвхөн зангилаанаар</strong> шүргэлцэнэ — тэдгээрийн хамгаалалт логик, физик биш.</span>
        </div>
        <div className="list" style={{marginTop: 8}}>
          {shared.sort((a, b) => b.parallel_km - a.parallel_km).slice(0, 6).map(item => <button
            key={`${item.tree_edge}-${item.chord}`}
            className="list-item"
            onClick={() => onSelectEdge(item.chord)}>
            <i className="dash" style={{color: 'var(--color-fail)'}}/>
            <span>{label(item.chord)}</span>
            <em className="num">{fmt(item.parallel_km, 1)} км</em>
          </button>)}
        </div>
      </div>;
    })()}

    <div>
      <div className="eyebrow">Бүх кабелийн гэмтлийг шалгах</div>
      <p className="prose" style={{marginBottom: 8}}>Гурван топологийн кабель бүрийг нэг нэгээр тасалж, холбоотой үлдсэн тоог гаргана.</p>
      {audit ? <div className="list">
        {Object.entries(audit).map(([key, value]) => {
          if (!value) return <div className="list-item" key={key}><span>{key}</span><em>боломжгүй</em></div>;
          const pass = value.passed === value.tested;
          return <div className="list-item" key={key} style={{cursor: 'default'}}>
            {pass ? <Check size={13} style={{color: 'var(--color-ok)'}}/> : <X size={13} style={{color: 'var(--color-fail)'}}/>}
            <span>{key}</span><em className="num">{value.passed} / {value.tested}</em>
          </div>;
        })}
      </div> : <button className="btn btn-block" disabled={auditing} onClick={runAudit}><ShieldCheck size={15}/>{auditing ? 'Шалгаж байна…' : 'Шалгалт ажиллуулах'}</button>}
    </div>

    <PathTool data={data} topology={topology} source={source} setSource={setSource} target={target} setTarget={setTarget} replay={replay} name={name} onFocus={onFocus} onHighlight={onHighlight}/>
  </>;
}
