import { ArrowRight, Route } from 'lucide-react';
import { fmt } from '../constants';

export default function PathTool({data, source, target, setSource, setTarget, path, busy, onFindPath, cut, name}) {
  return <div className="border-t border-line pt-4">
    <div className="section-label"><Route size={14}/>Хоёр хотын зам {cut && <small>тасралтыг тооцно</small>}</div>
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
      <select className="input" aria-label="Эхлэх хот" value={source} onChange={e => setSource(e.target.value)}>{data.cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <ArrowRight size={14} className="text-muted"/>
      <select className="input" aria-label="Хүрэх хот" value={target} onChange={e => setTarget(e.target.value)}>{data.cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
    </div>
    <button className="btn btn-block mt-2" disabled={!!busy || source === target} onClick={onFindPath}>Хамгийн богино зам олох</button>
    {path && <div className={`mt-3 cut-result ${path.connected ? 'ok' : 'fail'}`} role="status">
      {path.connected ? <><p className="route-text">{path.path.map(name).join(' → ')}</p><b>{fmt(path.km)} км · RTT {fmt(path.rtt_ms, 1)} мс</b></> : <p>Энэ төлөвт хоёр хотын хооронд зам байхгүй.</p>}
    </div>}
  </div>;
}
