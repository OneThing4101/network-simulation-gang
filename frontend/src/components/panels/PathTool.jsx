import {useState} from 'react';
import {Route} from 'lucide-react';
import {fmt} from '../../constants';
import {post} from '../../api';

// The shortest path between two cities, computed on the live graph. When a
// failure is active the path avoids the failed cables.
export default function PathTool({data, topology, source, setSource, target, setTarget, replay, name, onHighlight}) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);

  async function solve() {
    setRunning(true); setError('');
    try {
      const value = await post('/api/network/path', {
        topology,
        source,
        target,
        failed_edges: replay?.failed_edges || [],
      });
      setResult(value);
      if (value.connected) onHighlight?.(value.edges);
    } catch (e) {
      setError(e.message);
      setResult(null);
    } finally {
      setRunning(false);
    }
  }

  return <div>
    <div className="eyebrow">Хоёр хотын хоорондох зам</div>
    <div style={{display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 6, alignItems: 'end'}}>
      <label className="field">
        <span>Эхлэх</span>
        <select className="input" value={source} onChange={e => setSource(e.target.value)}>
          {data.cities.map(city => <option key={city.id} value={city.id}>{city.name}</option>)}
        </select>
      </label>
      <span style={{paddingBottom: 8, color: 'var(--color-muted)'}}>→</span>
      <label className="field">
        <span>Хүрэх</span>
        <select className="input" value={target} onChange={e => setTarget(e.target.value)}>
          {data.cities.map(city => <option key={city.id} value={city.id}>{city.name}</option>)}
        </select>
      </label>
    </div>
    <button className="btn btn-block" style={{marginTop: 8}} disabled={running} onClick={solve}>
      <Route size={14}/>{running ? 'Тооцож байна…' : 'Хамгийн богино зам олох'}
    </button>
    {replay?.failed_edges?.length > 0 && <p className="prose" style={{marginTop: 6}}>Одоогийн {replay.failed_edges.length} тасарсан кабелийг дайрахгүйгээр тооцно.</p>}
    {error && <div className="error-banner" role="alert" style={{marginTop: 8}}><span>{error}</span></div>}
    {result && !result.connected && <div className="callout callout-fail" style={{marginTop: 8}}><span>Энэ хоёр хотын хоорондох зам олдсонгүй.</span></div>}
    {result?.connected && <div className="callout callout-ok" style={{marginTop: 8}}>
      <div style={{display: 'grid', gap: 4}}>
        <span>{result.path.map(name).join(' → ')}</span>
        <span className="num">{fmt(result.km)} км · RTT {fmt(result.rtt_ms, 1)} мс</span>
      </div>
    </div>}
  </div>;
}
