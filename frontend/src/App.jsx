import { useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle, Mountain, Waves, Trees, Route, Map, GitBranch, AlertTriangle, X, RotateCcw, Link2, Grid2x2, Radio } from 'lucide-react';
import { api } from './api';
import { COLORS, TOPOLOGIES, fmt } from './constants';
import Header from './components/Header';
import GeoMap, { BASEMAPS } from './components/GeoMap';
import TopologyRail from './components/TopologyRail';
import CableInspector from './components/CableInspector';
import FailureLab from './components/FailureLab';
import DataPanel from './components/DataPanel';
import Method from './components/Method';
import NodeModal from './components/NodeModal';
import Tour, { TOUR_STEPS } from './components/Tour';
import Toasts from './components/Toasts';

const LAYER_TOGGLES = [['mountain', 'Уул', Mountain], ['lake', 'Нуур', Waves], ['river', 'Гол', Waves], ['forest', 'Ой', Trees], ['access', 'Нэвтрэх хэсэг', Route], ['bridges', 'Bridge', GitBranch], ['added', 'Нэмэлт холбоос', Link2], ['soums', 'Сум', Grid2x2], ['flow', 'Урсгал', Radio]];
const TAB_KEYS = ['design', 'failure', 'manage', 'method'];

// Tab, topology and selected cable live in the URL hash so a view can be reloaded or shared during the presentation.
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  return {tab: TAB_KEYS.includes(p.get('tab')) ? p.get('tab') : 'design', topology: TOPOLOGIES.some(t => t.key === p.get('topo')) ? p.get('topo') : 'protected', selected: p.get('edge') || 'Murun--Uliastai'};
}
// Light is the default regardless of the OS setting; dark stays an explicit choice behind the toggle.
function initialTheme() {
  try { const saved = localStorage.getItem('fiber-theme-v2'); if (saved === 'dark' || saved === 'light') return saved; } catch {}
  return 'light';
}

export default function App() {
  const start = useRef(readHash()).current;
  const [data, setData] = useState(null), [geo, setGeo] = useState(null);
  const [tab, setTab] = useState(start.tab), [topology, setTopology] = useState(start.topology);
  const [selected, setSelected] = useState(start.selected), [node, setNode] = useState(null), [hover, setHover] = useState(null);
  const [cut, setCut] = useState(null), [path, setPath] = useState(null), [scope, setScope] = useState('cable');
  const [layers, setLayers] = useState({mountain: true, lake: true, river: true, forest: false, access: true, bridges: true, added: true, soums: true, flow: true});
  const [basemap, setBasemap] = useState(() => { try { const b = localStorage.getItem('fiber-basemap-v2'); return BASEMAPS.some(x => x.key === b) ? b : 'world'; } catch { return 'world'; } });
  const [source, setSource] = useState('Darkhan'), [target, setTarget] = useState('Khentii'), [audit, setAudit] = useState(null);
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [modal, setModal] = useState(null), [factor, setFactor] = useState(1);
  const [picking, setPicking] = useState(null); // form values carried while the user clicks the map
  const [tour, setTour] = useState(null), [tourRunning, setTourRunning] = useState(false);
  const [toasts, setToasts] = useState([]), [tileNotice, setTileNotice] = useState(''), [theme, setTheme] = useState(initialTheme);
  const [loadError, setLoadError] = useState('');
  const alive = useRef(true);

  const notify = useCallback((text, kind = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, {id, text, kind}]);
    setTimeout(() => alive.current && setToasts(t => t.filter(x => x.id !== id)), 4000);
  }, []);

  const reload = useCallback(async () => {
    const value = await api('/api/network/topologies');
    if (!alive.current) return value;
    setData(value); setAudit(null);
    setSource(old => value.cities.some(c => c.id === old) ? old : value.cities[0].id);
    setTarget(old => value.cities.some(c => c.id === old) ? old : value.cities.at(-1).id);
    return value;
  }, []);
  const load = useCallback(() => { setLoadError(''); Promise.all([reload(), api('/api/geography').then(setGeo)]).catch(e => setLoadError(e.message)); }, [reload]);

  useEffect(() => { alive.current = true; load(); return () => { alive.current = false; }; }, [load]);
  useEffect(() => { try { localStorage.setItem('fiber-basemap-v2', basemap); } catch {} }, [basemap]);
  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem('fiber-theme-v2', theme); } catch {} }, [theme]);
  useEffect(() => { history.replaceState(null, '', `#tab=${tab}&topo=${topology}&edge=${encodeURIComponent(selected)}`); }, [tab, topology, selected]);
  useEffect(() => { setCut(null); setPath(null); if (data && !data.topologies[topology].edge_ids.includes(selected)) setSelected(data.topologies[topology].edge_ids[0]); }, [topology, data]);
  useEffect(() => { setFactor(data?.cost_factors[selected] || 1); }, [selected, data]);
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape' && modal) { setModal(null); setError(''); return; }
      if (modal || e.target.closest('input,select,textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
      const i = ['1', '2', '3'].indexOf(e.key);
      if (i >= 0) setTopology(TOPOLOGIES[i].key);
      if (e.key === 'Escape') { setCut(null); setPath(null); setNode(null); setPicking(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal]);

  async function perform(task, fn) { setError(''); setBusy(task); try { return await fn(); } catch (e) { setError(e.message); notify(e.message, 'fail'); } finally { if (alive.current) setBusy(''); } }
  async function mutation(url, body, method = 'POST', done = 'Хадгаллаа') {
    const response = await api(url, body, method);
    if (response.job_id) {
      let status;
      do { await new Promise(r => setTimeout(r, 700)); status = await api(`/api/jobs/${response.job_id}`); } while (status.status === 'running' && alive.current);
      if (status.status === 'failed') throw new Error(status.message);
    }
    await reload(); setCut(null); setPath(null); setModal(null); setNode(null); notify(done);
  }
  const runCut = (topo, edgeId, sc) => perform('Тасралтыг симуляцилж байна', async () => { setPath(null); setCut(await api('/api/network/simulate-cut', {topology: topo, edge_id: edgeId, scope: sc})); });
  const runPath = (topo, s, t, failed = []) => perform('Зам тооцож байна', async () => setPath(await api('/api/network/path', {topology: topo, source: s, target: t, failed_edges: failed})));
  const runAudit = () => perform('Бүх кабелийг шалгаж байна', async () => setAudit(await api('/api/network/audit')));

  const names = Object.fromEntries((data?.cities || []).map(c => [c.id, c.name]));
  const name = id => names[id] || id;
  const edge = data?.routes.find(r => r.id === selected), stats = data?.topologies[topology].stats;
  const edgeIds = new Set(data?.topologies[topology].edge_ids || []);
  const edges = data?.routes.filter(r => edgeIds.has(r.id)) || [];
  const edgeName = r => r ? `${name(r.u)} — ${name(r.v)}` : 'Кабель сонгоно уу';
  const chosen = edgeIds.has(selected);
  function changeSelected(id) {
    setSelected(id); setNode(null); setPath(null);
    if (tab === 'manage' || tab === 'method') setTab('design');
    if (data && !edgeIds.has(id)) { const t = TOPOLOGIES.find(t => data.topologies[t.key].edge_ids.includes(id)); if (t) setTopology(t.key); }
  }
  function selectNode(c) { setNode(c); if (tab === 'manage' || tab === 'method') setTab('design'); }
  function showWorstPair() { const [a, b] = stats.worst_pair; setSource(a); setTarget(b); setNode(null); if (tab !== 'design' && tab !== 'failure') setTab('design'); runPath(topology, a, b, cut?.failed_edges || []); }

  // Tour steps drive the real UI through this controller.
  const tourContext = {setTab, setTopology, setScope, setSource, setTarget, clear: () => { setCut(null); setPath(null); setNode(null); }, cut: async (t, e, s) => { setSelected(e); await runCut(t, e, s); }, path: runPath, audit: runAudit};
  async function goTour(step) { setTour(step); setTourRunning(true); try { await TOUR_STEPS[step].run(tourContext); } finally { setTourRunning(false); } }

  const panelProps = {data, topology, edge, edges, selected, node, chosen, busy, name, edgeName, changeSelected, cut, path, source, target, setSource, setTarget, scope, setScope, audit, factor, setFactor, onHover: setHover,
    onSelectNode: selectNode, onSelectEdge: changeSelected, onClose: () => setNode(null), onEdit: c => setModal({type: 'edit', ...c}),
    onFindPath: () => runPath(topology, source, target, cut?.failed_edges || []),
    onCut: () => runCut(topology, selected, scope), onClearCut: () => { setCut(null); setPath(null); }, onAudit: runAudit,
    onFactorSave: () => perform('Өртөг шинэчилж байна', () => mutation(`/api/edges/${selected}`, {cost_factor: Number(factor)}, 'PATCH', 'Өртгийн үржвэр хадгалагдлаа')),
    onExclude: () => perform('Трасс хасаж байна', () => mutation(`/api/edges/${selected}`, {}, 'DELETE', 'Трассыг сангаас хаслаа')),
    onAddNode: () => setModal({type: 'new', lat: 47.5, lon: 107.5}), onEditNode: c => setModal({type: 'edit', ...c}), onReset: () => setModal({type: 'reset'}),
    onToggleRoute: (id, restore) => perform(restore ? 'Трасс сэргээж байна' : 'Трасс хасаж байна', () => mutation(`/api/edges/${id}`, {}, restore ? 'POST' : 'DELETE', restore ? 'Трассыг сэргээлээ' : 'Трассыг сангаас хаслаа')),
  };

  return <div className="app">
    <Header tab={tab} setTab={setTab} busy={busy} topology={topology} theme={theme} setTheme={setTheme} tourOpen={tour != null} onTour={() => tour == null ? goTour(0) : setTour(null)}/>
    {!data ? <div className="loading">{loadError ? <><div className="alert"><AlertTriangle size={15}/><span>Сервертэй холбогдсонгүй: {loadError}</span></div><p className="m-0 text-[13px] text-slate">Backend сервер ажиллаж байгаа эсэхийг шалгаад дахин оролдоно уу.</p><button className="btn" onClick={load}><RotateCcw size={14}/>Дахин оролдох</button></> : <><LoaderCircle className="spin" size={22}/>Маршрутын загварыг бэлтгэж байна…</>}</div>
    : tab === 'method' ? <Method data={data}/>
    : <div className="workspace">
      <TopologyRail data={data} topology={topology} setTopology={setTopology} name={name} edgeName={edgeName} onShowWorstPair={showWorstPair} onHover={setHover} changeSelected={changeSelected} selected={selected} busy={busy}/>
      <div className="map-stage">
        <GeoMap data={data} geography={geo} topology={topology} selected={selected} node={node} cut={cut} path={path} layers={layers} basemap={basemap} picking={!!picking} hover={hover} theme={theme}
          onSelectEdge={changeSelected} onSelectNode={selectNode} onHover={setHover}
          onPick={loc => { setModal({type: picking.type, ...picking, ...loc}); setPicking(null); }}
          onTileFailure={() => { setBasemap('world'); setTileNotice('Онлайн суурь зураг ачаалагдсангүй. Офлайн дэлхийн зургаар үргэлжилнэ.'); }}/>
        <div className="map-float layer-bar" role="group" aria-label="Газрын зургийн давхаргууд"><label className="basemap-pick"><Map size={12}/><select aria-label="Суурь зураг" value={basemap} onChange={e => setBasemap(e.target.value)}>{BASEMAPS.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}</select></label>{LAYER_TOGGLES.map(([k, label, Icon]) => (k !== 'added' || topology === 'protected') && <button key={k} aria-pressed={layers[k]} onClick={() => setLayers({...layers, [k]: !layers[k]})}><Icon size={12}/>{label}</button>)}</div>
        {tour == null && <div className="map-float legend"><div>
          <span><i style={{color: COLORS[topology]}}/>{TOPOLOGIES.find(t => t.key === topology).short} трасс</span>
          {layers.bridges && stats.bridge_count > 0 && <span><i className="dashed" style={{color: COLORS[topology]}}/>Bridge</span>}
          {layers.added && topology === 'protected' && <span><i className="cased" style={{color: COLORS[topology]}}/>Нэмэлт нөөц холбоос</span>}
          <span><i style={{color: '#C27A12'}}/>Нөөц зам / богино зам</span>
          <span><i className="dashed" style={{color: '#B3261E'}}/>Тасарсан</span>
          <span><i className="dashed" style={{color: '#DC992E'}}/>Уулын нэвтрэх хэсэг</span>
          <span><i className="dashed" style={{color: '#0A8786'}}/>Голын гарц</span>
        </div></div>}
        {picking && <div className="map-float picking-note"><div>Шинэ байршлыг газрын зураг дээр дарж сонгоно уу.<button onClick={() => { setModal({type: picking.type, ...picking}); setPicking(null); }}>Болих</button></div></div>}
        {tour != null && <Tour step={tour} running={tourRunning} onStep={goTour} onClose={() => setTour(null)}/>}
        <div className="statusbar">
          <span className="grow">{tileNotice || (cut ? `Тасралт идэвхтэй: ${cut.failed_edges.length} кабель · ${cut.isolated.length ? `${cut.isolated.length} хот салсан` : 'бүх хот холбоотой'}` : `${data.cities.length} хот · ${data.routes.length} боломжит трасс · ${stats.edges} сонгогдсон кабель`)}</span>
          <span>Тооцоо {fmt(data.compute_ms)} мс</span>
          <span className="keys"><span className="kbd">1</span><span className="kbd">2</span><span className="kbd">3</span> топологи <span className="kbd">Esc</span> цэвэрлэх</span>
        </div>
      </div>
      <aside className="panel" aria-label="Дэлгэрэнгүй">
        {error && !modal && <div className="alert" role="alert"><AlertTriangle size={15}/><span>{error}</span><button onClick={() => setError('')} aria-label="Алдааны мэдэгдлийг хаах"><X size={14}/></button></div>}
        {tab === 'failure' ? <FailureLab {...panelProps}/> : tab === 'manage' ? <DataPanel {...panelProps}/> : <CableInspector {...panelProps}/>}
      </aside>
    </div>}
    {modal && <NodeModal modal={modal} busy={busy} error={error} onClose={() => { setModal(null); setError(''); }}
      onSubmit={values => perform('Маршрутыг дахин тооцож байна', () => mutation(modal.type === 'new' ? '/api/nodes' : `/api/nodes/${modal.id}`, values, modal.type === 'new' ? 'POST' : 'PATCH', modal.type === 'new' ? `${values.name} нэмэгдлээ` : `${values.name} шинэчлэгдлээ`))}
      onPickOnMap={values => { setPicking({...modal, ...values}); setModal(null); if (tab === 'method') setTab('design'); }}
      onDelete={() => perform('Зангилаа хасаж байна', () => mutation(`/api/nodes/${modal.id}`, {}, 'DELETE', `${modal.name} хасагдлаа`))}
      onReset={() => perform('Анхны төлөвийг сэргээж байна', () => mutation('/api/network/reset', {}, 'POST', 'Анхны 22 хотын төлөв сэргэлээ'))}/>}
    <Toasts items={toasts}/>
  </div>;
}
