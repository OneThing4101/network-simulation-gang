import {useState} from 'react';
import {Database, Download, Plus, RotateCcw, Search, Undo2} from 'lucide-react';
import {fmt} from '../../constants';

const EXPORTS = [
  {kind: 'geojson', label: 'GeoJSON', note: 'Сонгосон топологийн хувиргалт'},
  {kind: 'csv', label: 'CSV', note: 'Кабель бүрийн зай ба өртөг'},
  {kind: 'json', label: 'JSON', note: 'Бүх загварын бүтэн снимок'},
];

// Data and evidence: what the model is made of, what can be changed, and how
// to take a result away with you.
export default function DataPanel({data, topology, busy, onAddNode, onEditNode, onReset, onToggleRoute, name, notify}) {
  const [query, setQuery] = useState('');
  const excluded = new Set(data.excluded || []);
  const routes = data.routes.filter(r => `${name(r.u)} ${name(r.v)} ${r.id}`.toLowerCase().includes(query.toLowerCase()));
  const cities = data.cities.filter(c => c.name.toLowerCase().includes(query.toLowerCase()));

  return <>
    <div>
      <div className="eyebrow count"><span>Загварын бүрэлдэхүүн</span><span className="num">{data.cities.length} хот · {data.routes.length} трасс</span></div>
      <label className="field">
        <span>Хот эсвэл кабель хайх</span>
        <input className="input" value={query} onChange={e => setQuery(e.target.value)} placeholder="Нэр бичнэ үү"/>
      </label>
      {cities.length > 0 && <div className="list" style={{marginTop: 8}}>
        {cities.slice(0, 8).map(city => <button key={city.id} className="list-item" onClick={() => onEditNode(city)}>
          <Search size={12}/><span>{city.name}</span><em className="num">{city.id}</em>
        </button>)}
      </div>}
    </div>

    <div>
      <div className="eyebrow">Зангилаа</div>
      <button className="btn btn-block" onClick={onAddNode}><Plus size={14}/>Шинэ зангилаа нэмэх</button>
      <p className="prose" style={{marginTop: 6}}>Шинэ зангилаа нэмэхэд рельефийн тор дээр бүх боломжит маршрутыг дахин тооцно.</p>
    </div>

    <div>
      <div className="eyebrow count"><span>Боломжит трасс</span><span className="num">{excluded.size} хасагдсан</span></div>
      {routes.length === 0 ? <div className="empty">Хайлтад тохирох трасс олдсонгүй.</div> : <div className="list" style={{maxHeight: 260, overflowY: 'auto'}}>
        {routes.slice(0, 60).map(route => {
          const off = excluded.has(route.id);
          return <button key={route.id} className="list-item" disabled={!!busy} onClick={() => onToggleRoute(route.id, off)}>
            <i className={off ? 'dash' : ''} style={{color: off ? 'var(--color-muted)' : 'var(--color-protected)'}}/>
            <span>{name(route.u)} — {name(route.v)}</span><em className="num">{off ? 'хасагдсан' : `${fmt(route.distance_km)} км`}</em>
          </button>;
        })}
      </div>}
      {routes.length > 60 && <p className="prose" style={{marginTop: 6}}>Эхний 60 харагдаж байна. Хэрэвтэй бол хайж нарийнчилж олно.</p>}
    </div>

    <div>
      <div className="eyebrow">Экспорт</div>
      <div className="list">
        {EXPORTS.map(item => <a key={item.kind} className="list-item" href={`/api/export/${item.kind}?topology=${topology}`} download>
          <Download size={13}/><span>{item.label}</span><em>{item.note}</em>
        </a>)}
      </div>
      <p className="prose" style={{marginTop: 6}}>Экспорт нь <strong>одоогийн</strong> сонгосон загварыг тусгана.</p>
    </div>

    <div>
      <div className="eyebrow">Эх сурвалж</div>
      <p className="prose">
        Хил, аймаг, нуур, уул: Natural Earth 1:10m. Гол: Natural Earth 1:10m. Ой: эх notebook-ийн гараар тэмдэглэсэн ойролцоо бүс.
        Хот: эх ажлын 22 солбицол. Аймаг, сумын хил: GADM 4.1 (2022), зөвхөн чиг баримжааны зориулалттай.
      </p>
      <p className="prose" style={{marginTop: 6}}>
        Зай нь 5 км алхамтай рельефийн тор дээрх least-cost маршрут — бодит авто замын хэмжилт биш.
        Өртөг нь харьцуулах weighted-км. RTT нь 5 мкс/км тархалтын тооцоо.
      </p>
    </div>

    <div>
      <div className="eyebrow">Суурь төлөв</div>
      <button className="btn btn-block" onClick={onReset}><Undo2 size={14}/>Анхны 22 хотын төлөвт буцаах</button>
    </div>
  </>;
}
