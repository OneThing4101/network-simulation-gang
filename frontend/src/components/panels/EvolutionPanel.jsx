import {Check, GitBranch, Link2, Network, ShieldCheck, Split} from 'lucide-react';
import {fmt} from '../../constants';

const STAGE_ICONS = {
  candidates: Network, mst: GitBranch, bridges: Split, chords: Link2, protected: ShieldCheck,
};

// "From tree to resilience": each step is a stage the engine actually produced.
export default function EvolutionPanel({evolution, stage, setStage, selected, setSelected, name, onFocus}) {
  if (!evolution) return <div className="empty">Хувьсгалын тооцоо хийгдэж байна…</div>;
  if (!evolution.feasible) {
    return <div className="callout callout-fail">
      <ShieldCheck size={15}/><span>Энэ өгөгдлөөр 2-edge-connected сүлжээ байгуулах боломжгүй. Топологи бүхэлдээ bridge-тэй үлдсэн.</span>
    </div>;
  }

  const current = evolution.stages.find(s => s.key === stage) || evolution.stages[1];
  const chord = evolution.chords.find(c => c.edge_id === selected);
  const bridge = evolution.bridges.find(b => b.edge_id === selected);

  return <>
    <div>
      <div className="eyebrow">Байгуулалтын тайлбар</div>
      <div className="list">
        {evolution.stages.map(item => {
          const Icon = STAGE_ICONS[item.key] || GitBranch;
          return <button key={item.key} className="list-item" aria-current={current.key === item.key} onClick={() => setStage(item.key)}>
            <Icon size={14}/>
            <span>{item.title}</span>
            <em className="num">{item.metrics.edges ?? item.metrics.candidates ?? item.metrics.bridges ?? ''}</em>
          </button>;
        })}
      </div>
    </div>

    <div>
      <div className="eyebrow">Алхам</div>
      <p className="prose">{current.caption}</p>
      <dl className="rows m-0" style={{marginTop: 8}}>
        {Object.entries(current.metrics).filter(([key]) => key !== 'connected').map(([key, value]) => (
          <div className="row" key={key}><dt>{key}</dt><dd className="num">{typeof value === 'number' ? fmt(value, Number.isInteger(value) ? 0 : 1) : String(value)}</dd></div>
        ))}
      </dl>
    </div>

    {chord && <div>
      <div className="eyebrow count"><span>Сонгосон нөөц холбоос</span><Check size={12}/></div>
      <h3 className="title" style={{fontSize: 13}}>{name(chord.u)} — {name(chord.v)}</h3>
      <p className="prose" style={{marginTop: 4}}>Энэ цагираг модны {chord.covers.length} холбоосыг bridge-ээс хамгаална: {chord.covers.map(c => name(c.split('--')[0]) + '–' + name(c.split('--')[1])).join(', ')}.</p>
      <button className="btn btn-sm" onClick={() => onFocus?.({kind: 'edge', id: chord.edge_id})}>Трассыг харуулах</button>
    </div>}

    {bridge && <div>
      <div className="eyebrow count"><span>Сонгосон bridge</span><Split size={12}/></div>
      <h3 className="title" style={{fontSize: 13}}>{name(bridge.u)} — {name(bridge.v)}</h3>
      <p className="prose" style={{marginTop: 4}}>Тасрахад мод хоёр хэсэгт хуваагдана: {bridge.partition.map((part, index) => `${part.length} хот`).join(' болон ')}.</p>
      <p className="prose">Хамгаалсан хувилбарт энэ холбоосыг хамгаалагч цагираг: {evolution.coverage[bridge.edge_id]?.length ? evolution.coverage[bridge.edge_id].map(id => name(id.split('--')[0]) + '–' + name(id.split('--')[1])).join(', ') : 'байхгүй'}.</p>
    </div>}

    <div>
      <div className="eyebrow count"><span>Бүх нэмэлт холбоос</span><span className="num">{evolution.chords.length}</span></div>
      <div className="list">
        {evolution.chords.map(item => <button key={item.edge_id} className="list-item" aria-current={selected === item.edge_id} onClick={() => { setSelected(item.edge_id); onFocus?.({kind: 'edge', id: item.edge_id}); }}>
          <span>{name(item.u)} — {name(item.v)}</span><em className="num">{item.covers.length} холбоос</em>
        </button>)}
      </div>
    </div>

    <div className="callout callout-plain">
      <ShieldCheck size={15}/><span>Энэ нь <strong>өгөгдсөн нэг MST-ийг</strong> хамгаалах оновчлол. Бүх 2-edge-connected сүлжээний глобал оптимум гэж үзэхгүй.</span>
    </div>
  </>;
}
