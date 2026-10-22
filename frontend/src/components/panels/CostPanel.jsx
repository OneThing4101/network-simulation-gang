import {useState} from 'react';
import {AlertTriangle, Calculator, Check} from 'lucide-react';
import {fmt} from '../../constants';
import {post} from '../../api';

// Resilience x cost. Every point on the frontier is a solution the solver
// actually produced for that budget; nothing here is interpolated.
export default function CostPanel({data, busy, onHighlight, onSelectEdge, name}) {
  const [budget, setBudget] = useState(4000);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [picked, setPicked] = useState(null);
  const stats = data.topologies.protected?.stats;
  const base = data.optimization?.added_cost_km || 0;

  async function solve() {
    setRunning(true); setError('');
    try {
      const custom = Number(budget);
      const budgets = [500, 1000, 2000, 3000, 4000, 6000, 8000, 12000];
      if (Number.isFinite(custom) && custom > 0 && !budgets.includes(custom)) budgets.push(custom);
      budgets.sort((a, b) => a - b);
      const value = await post('/api/network/optimize', {budgets_wkm: budgets});
      setResult(value);
      setPicked(null);
      onHighlight?.([]);
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  const rows = result?.frontier || [];
  const maxCovered = Math.max(1, ...rows.map(r => r.covered || 0));

  function choose(row) {
    setPicked(row);
    onHighlight?.(row.added || []);
  }

  return <>
    <div>
      <div className="eyebrow">Сүлжээний өртгийн бүрэлдэхүүн</div>
      <dl className="rows m-0">
        <div className="row"><dt>MST-ийн өртөг</dt><dd className="num">{fmt(data.topologies.mst?.stats?.cost_km)} w-км</dd></div>
        <div className="row"><dt>Бүрэн хамгаалалтын өртөг</dt><dd className="num">{fmt(base)} w-км</dd></div>
        <div className="row"><dt>Нэмэлт урт</dt><dd className="num">{stats ? `${fmt(stats.overhead_pct, 1)}%` : '—'}</dd></div>
      </dl>
      <p className="prose" style={{marginTop: 8}}>Задалбарт «15–20% нэмэлт кабель» гэж зөвшөөрөгдсөн боловч энэ өгөгдлөөр бодит нэмэлт урт <strong>{stats ? fmt(stats.overhead_pct, 1) : '—'}%</strong> байна. 15–20% нь заавал биелэхгүй.</p>
    </div>

    <div>
      <div className="eyebrow">Төсөвийн шийд</div>
      <label className="field">
        <span>Нэмэлт төсөв (weighted-км)</span>
        <input className="input num" type="number" min="0" step="500" value={budget} onChange={e => setBudget(e.target.value)}/>
      </label>
      <button className="btn btn-block" style={{marginTop: 8}} disabled={running || !!busy} onClick={solve}>
        <Calculator size={15}/>{running ? 'Бодож байна…' : 'Төсөвийн хязгаар бодох'}
      </button>
      <p className="prose" style={{marginTop: 6}}>Задалбар бүрийн хувьд хамгийн их bridge-ийг хамгаалах нэмэлт холбоосын багцыг HiGHS бодно.</p>
    </div>

    {error && <div className="error-banner" role="alert"><AlertTriangle size={15}/><span>{error}</span></div>}

    {rows.length > 0 && <>
      <div>
        <div className="eyebrow count"><span>Төсөвийн фронт</span><span className="num">{rows.length} цэг</span></div>
        <div className="frontier">
          {rows.map(row => <button key={row.budget_wkm} className="frontier-row" aria-current={picked?.budget_wkm === row.budget_wkm} onClick={() => choose(row)}>
            <span>{fmt(row.budget_wkm)} w-км төсөв</span>
            <span className="track"><span style={{width: `${(row.covered || 0) / maxCovered * 100}%`}}/></span>
            <em className="num" style={{fontStyle: 'normal', textAlign: 'right'}}>{row.covered}/{row.covered + (row.uncovered?.length || 0)}</em>
          </button>)}
        </div>
        <p className="prose" style={{marginTop: 6}}>Зүүн талын тоо нь хамгаалагдсан bridge-ийн тоо. Баруун тал нь нийт. Мөр дээр дарвал тэр төсөвийн шийдийг карт дээр харуулна.</p>
      </div>

      {picked && <div>
        <div className="eyebrow count"><span>Сонгосон шийд</span><span className="num">{picked.added?.length ?? 0} холбоос</span></div>
        <dl className="rows m-0">
          <div className="row"><dt>Төсөв</dt><dd className="num">{fmt(picked.budget_wkm)} w-км</dd></div>
          <div className="row"><dt>Бодит нэмэлт өртөг</dt><dd className="num">{fmt(picked.added_cost_km, 1)} w-км</dd></div>
          <div className="row"><dt>Хамгаалагдсан bridge</dt><dd className="num">{picked.covered}</dd></div>
          <div className="row"><dt>Үлдсэн bridge</dt><dd className={`num ${picked.uncovered?.length ? 'fail' : 'ok'}`}>{picked.uncovered?.length ?? 0}</dd></div>
          <div className="row"><dt>Бодлогын байдал</dt><dd className="num">{picked.status}</dd></div>
        </dl>
        {picked.added?.length > 0 && <div className="list" style={{marginTop: 8}}>
          {picked.added.map(id => {
            const route = data.routes.find(r => r.id === id);
            return <button key={id} className="list-item" onClick={() => onSelectEdge?.(id)}>
              <i style={{color: 'var(--color-protected)'}}/>
              <span>{route ? `${name(route.u)} — ${name(route.v)}` : id}</span>
            </button>;
          })}
        </div>}
        {picked.uncovered?.length > 0 && <p className="prose" style={{marginTop: 8}}>Энэ төсөвөөр {picked.uncovered.length} bridge хамгаалагдахгүй: {picked.uncovered.map(id => {
          const route = data.routes.find(r => r.id === id);
          return route ? `${name(route.u)} — ${name(route.v)}` : id;
        }).join('; ')}.</p>}
      </div>}

      <div>
        <div className="eyebrow count"><span>Бодлогын мэдээлэл</span></div>
        <dl className="rows m-0">
          <div className="row"><dt>Байдал</dt><dd className={`num ${rows.every(r => r.status === 'optimal') ? 'ok' : 'amber'}`}>{rows[0].status}</dd></div>
          <div className="row"><dt>Хамрах хүрээ</dt><dd className="num">Тогтсон MST</dd></div>
          {rows[0].gap != null && <div className="row"><dt>Gap</dt><dd className="num">{fmt(rows[0].gap * 100, 4)}%</dd></div>}
        </dl>
      </div>

      {rows.some(r => r.status === 'infeasible') && <div className="callout callout-amber">
        <AlertTriangle size={15}/><span>Зарим төсөвөөр бүх bridge-ийг хамгаалах боломжгүй. Энэ нь шууд «учир байхгүй» гэсэн үг — хариу нь төсөвийн хязгаарт хүрэлцэхгүй байна гэсэн үг.</span>
      </div>}

      {rows.filter(r => r.covered > 0).length > 0 && <div>
        <div className="eyebrow count"><span>Хамгийн их хамрах багц</span><Check size={12}/></div>
        <p className="prose">Хамгийн өндөр төсөвт: {fmt(Math.max(...rows.map(r => r.covered || 0)))}/{stats?.bridge_count ?? '—'} bridge хамгаалагдлаа, нэмэлт өртөг {fmt(Math.min(...rows.filter(r => r.covered > 0).map(r => r.added_cost_km || 0)))} w-км.</p>
      </div>}
    </>}
  </>;
}
