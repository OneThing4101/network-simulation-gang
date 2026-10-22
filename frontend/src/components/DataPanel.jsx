import { useState } from 'react';
import { Plus, RotateCcw, Search, Pencil } from 'lucide-react';
import { fmt } from '../constants';

// Data tab panel: nodes and the candidate route catalogue. Edits persist locally on the backend.
export default function DataPanel({data, busy, name, edgeName, onAddNode, onEditNode, onReset, onToggleRoute, changeSelected, onSelectNode, onHover}) {
  const [view, setView] = useState('nodes');
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const routes = data.routes.filter(r => !q || `${name(r.u)} ${name(r.v)} ${r.id}`.toLowerCase().includes(q));
  const excluded = new Set(data.excluded);
  return <>
    <div className="panel-title"><span>Өгөгдлийн удирдлага</span><p>Зангилаа нэмэх, засах, хасах. Трассыг боломжит сангаас хасах, сэргээх. Засвар зөвхөн энэ компьютерт хадгалагдана.</p></div>
    <div className="flex gap-2">
      <button className="btn btn-primary flex-1" disabled={!!busy} onClick={onAddNode}><Plus size={15}/>Зангилаа нэмэх</button>
      <button className="btn" disabled={!!busy} onClick={onReset} title="Анхны 22 хотын төлөвт буцах"><RotateCcw size={15}/>Анхны төлөв</button>
    </div>
    <div className="mini-tabs" role="tablist">
      <button role="tab" aria-selected={view === 'nodes'} onClick={() => setView('nodes')}>Зангилаа · {data.cities.length}</button>
      <button role="tab" aria-selected={view === 'routes'} onClick={() => setView('routes')}>Трассын сан · {data.routes.length}</button>
    </div>
    {view === 'nodes' ? <div className="scroll"><table className="table">
      <thead><tr><th>Хот</th><th>Солбицол</th><th/></tr></thead>
      <tbody>{data.cities.map(c => <tr key={c.id}>
        <td><button className="link" onClick={() => onSelectNode(c)}>{c.name}</button><small className="block text-muted text-[11.5px]">{c.id}</small></td>
        <td className="text-slate text-[12px]">{c.lat.toFixed(3)}<br/>{c.lon.toFixed(3)}</td>
        <td><button className="btn btn-sm" onClick={() => onEditNode(c)} aria-label={`${c.name} засах`}><Pencil size={13}/></button></td>
      </tr>)}</tbody></table></div>
    : <>
      <label className="search"><Search size={14}/><input aria-label="Трасс хайх" placeholder="Хотоор хайх…" value={search} onChange={e => setSearch(e.target.value)}/></label>
      <div className="scroll"><table className="table">
        <thead><tr><th>Трасс</th><th>Урт</th><th>Төлөв</th></tr></thead>
        <tbody>{routes.map(r => { const off = excluded.has(r.id); return <tr key={r.id} className={off ? 'opacity-60' : ''} onMouseEnter={() => onHover(r.id)} onMouseLeave={() => onHover(null)}>
          <td><button className="link" onClick={() => changeSelected(r.id)}>{edgeName(r)}</button></td>
          <td className="whitespace-nowrap text-slate text-[12px]">{fmt(r.distance_km)} км</td>
          <td><button className={`chip ${off ? 'chip-fail' : ''}`} disabled={!!busy} onClick={() => onToggleRoute(r.id, off)}>{off ? 'Сэргээх' : 'Хасах'}</button></td>
        </tr>; })}</tbody></table>
        {!routes.length && <div className="empty mt-2">Хайлтад таарах трасс олдсонгүй.</div>}
      </div>
    </>}
  </>;
}
