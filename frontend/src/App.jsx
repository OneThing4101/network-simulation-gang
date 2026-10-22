import {useCallback, useEffect, useMemo, useState} from 'react';
import {AlertTriangle, LoaderCircle, PanelRightClose, PanelRightOpen, RotateCcw} from 'lucide-react';
import {useAtlas} from './hooks/useAtlas';
import {useMediaQuery} from './hooks/useMediaQuery';
import {post} from './api';
import {TOPOLOGIES, fmt} from './constants';
import TopBar, {ModeSwitch} from './components/TopBar';
import SceneRail from './components/SceneRail';
import MapPlate from './components/MapPlate';
import SummaryStrip from './components/SummaryStrip';
import LayerControl from './components/LayerControl';
import Legend from './components/Legend';
import FailureTimeline from './components/FailureTimeline';
import Inspector from './components/Inspector';
import MethodScene from './components/MethodScene';
import NodeModal from './components/NodeModal';
import Toasts from './components/Toasts';

export default function App() {
  const atlas = useAtlas();
  const {
    data, geography, geometry, loadError, busy, error, toasts, revision,
    scene, setScene, topology, setTopology, selected, setSelected, node, setNode,
    hover, setHover, replay, setReplay, corridor, evolution,
    layers, setLayers, basemap, setBasemap, theme, setTheme,
    source, setSource, target, setTarget, notify, load, perform, mutate, runReplay,
    name, edge, stats, edges,
  } = atlas;

  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [focus, setFocus] = useState(null);
  const [stage, setStage] = useState('mst');
  const [scope, setScope] = useState('cable');
  const [factor, setFactor] = useState(1);
  const [modal, setModal] = useState(null);
  const [picking, setPicking] = useState(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [highlight, setHighlight] = useState([]);
  const isNarrow = useMediaQuery('(max-width: 760px)');

  // The inspector is a column on the desktop and a sheet on a phone, so it
  // follows the viewport rather than the width the page loaded at.
  useEffect(() => { setInspectorOpen(!isNarrow); }, [isNarrow]);

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => { setFactor(data?.cost_factors?.[selected] || 1); }, [selected, data]);
  useEffect(() => { setHighlight([]); }, [scene]);

  useEffect(() => {
    const onKey = event => {
      if (event.key === 'Escape' && !modal) {
        setReplay(null); setNode(''); setFocus(null);
        return;
      }
      if (modal || event.target.closest?.('input,select,textarea') || event.metaKey || event.ctrlKey || event.altKey) return;
      const index = ['1', '2', '3'].indexOf(event.key);
      if (index >= 0) setTopology(TOPOLOGIES[index].key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, setTopology]);

  const selectEdge = useCallback((id, focusRoute = true) => {
    setSelected(id);
    if (focusRoute) setFocus({kind: 'edge', id, nonce: Date.now()});
  }, [setSelected]);

  const runFailure = useCallback(() => {
    runReplay(topology, selected, scope);
  }, [runReplay, topology, selected, scope]);

  // Show the two cities that are furthest apart on the current topology, and
  // draw the path the engine actually computes between them.
  const showWorstPair = useCallback(async () => {
    if (!stats?.worst_pair || stats.worst_pair.length !== 2) return;
    const [from, to] = stats.worst_pair;
    setSource(from); setTarget(to);
    setScene('resilience');
    setInspectorOpen(true);
    try {
      const value = await post('/api/network/path', {topology, source: from, target: to, failed_edges: replay?.failed_edges || []});
      setHighlight(value.edges || []);
    } catch {
      setHighlight([]);
    }
  }, [stats, topology, replay, setScene]);

  const onFactorSave = useCallback(() => {
    perform('Өртөг шинэчилж байна', () => mutate(`/api/edges/${selected}`, {cost_factor: Number(factor)}, 'PATCH', 'Өртгийн үржвэр хадгалагдлаа'));
  }, [perform, mutate, selected, factor]);

  const onExclude = useCallback(() => {
    perform('Трасс хасаж байна', () => mutate(`/api/edges/${selected}`, {}, 'DELETE', 'Трассыг сангаас хаслаа'));
  }, [perform, mutate, selected]);

  const onToggleRoute = useCallback((id, restore) => {
    perform(restore ? 'Трасс сэргээж байна' : 'Трасс хасаж байна', () => mutate(`/api/edges/${id}`, {}, restore ? 'POST' : 'DELETE', restore ? 'Трассыг сэргээлээ' : 'Трассыг сангаас хаслаа'));
  }, [perform, mutate]);

  const statusText = useMemo(() => {
    if (busy) return busy;
    if (replay) {
      const parts = [`Тасралт идэвхтэй: ${replay.failed_edges.length} кабель`];
      if (replay.isolated?.length) parts.push(`${replay.isolated.length} хот салсан`);
      else parts.push('бүх хот холбоотой');
      return parts.join(' · ');
    }
    return `${data?.cities.length ?? 0} хот · ${data?.routes.length ?? 0} боломжит трасс · ${stats?.edges ?? 0} сонгогдсон кабель`;
  }, [busy, replay, data, stats]);

  const inspectorProps = {
    data, topology, edge, edges, selected, setSelected: selectEdge, onSelectEdge: selectEdge, node, setNode, stats,
    chosen: !!edge, name, busy, factor, setFactor, onFactorSave, onExclude,
    onFocus: setFocus, onEdit: city => setModal({type: 'edit', ...city}),
    onAddNode: () => setModal({type: 'new'}),
    onReset: () => setModal({type: 'reset'}),
    onToggleRoute,
    scope, setScope, onRun: runFailure, onClear: () => setReplay(null),
    replay, corridor, evolution, stage, setStage,
    source, setSource, target, setTarget, onHighlight: setHighlight,
    onShowWorstPair: showWorstPair,
    notify,
  };

  // The evolution stage and a computed path both mark edges on the plate.
  const stageIds = scene === 'evolution' && evolution
    ? (evolution.stages.find(item => item.key === stage)?.edge_ids || [])
    : [];
  const markedIds = scene === 'evolution' ? stageIds : highlight;

  return <div className="app">
    <TopBar
      topology={topology}
      setTopology={setTopology}
      theme={theme}
      setTheme={setTheme}
      revision={revision}
      busy={busy}
      onExport={() => window.open(`/api/export/geojson?topology=${topology}`, '_blank')}
      onMethod={() => setScene('method')}
      compact={isNarrow}
    />

    {!data
      ? <div className="loading">
        {loadError
          ? <>
            <div className="error-banner" role="alert"><AlertTriangle size={15}/><span>Сервертэй холбогдсонгүй: {loadError}</span></div>
            <p className="prose">Backend ажиллаж байгаа эсэхийг шалгаад дахин оролдоно уу.</p>
            <button className="btn" onClick={load}><RotateCcw size={14}/>Дахин оролдох</button>
          </>
          : <><LoaderCircle className="spin" size={22}/>Маршрутын загварыг бэлтгэж байна…</>}
      </div>
      : scene === 'method'
        ? <MethodScene data={data}/>
        : <div className="shell" data-inspector={inspectorOpen ? 'open' : 'closed'}>
          <SceneRail scene={scene} setScene={setScene}/>
          <div className="stage" data-timeline={replay ? 'on' : 'off'}>
            <MapPlate
              data={data}
              geography={geography}
              geometry={geometry[topology]}
              topology={topology}
              selected={selected}
              node={node}
              replay={replay}
              layers={layers}
              basemap={basemap}
              theme={theme}
              picking={!!picking}
              hover={hover}
              corridor={corridor}
              focus={focus}
              highlightIds={markedIds}
              onSelectEdge={id => selectEdge(id)}
              onSelectNode={city => { setNode(city); setInspectorOpen(true); setFocus({kind: 'node', id: city.id, nonce: Date.now()}); }}
              onHover={setHover}
              onPick={location => { setModal({type: picking.type, ...picking, ...location}); setPicking(null); }}
              onTileFailure={() => {
                setBasemap('relief');
                notify('Онлайн tile холбогдсонгүй. Офлайн рельефээр үргэлжилнэ.', 'fail');
              }}
            />
            <SummaryStrip stats={stats} cities={data.cities.length}/>
            {isNarrow && <div className="overlay mode-plate"><ModeSwitch topology={topology} setTopology={setTopology}/></div>}
            <LayerControl layers={layers} setLayers={setLayers} basemap={basemap} setBasemap={setBasemap}/>
            <Legend topology={topology} stats={stats} layers={layers} replay={replay} scene={scene}/>
            <FailureTimeline replay={replay} reducedMotion={reducedMotion} onReset={() => setReplay(null)}/>
          </div>
          {inspectorOpen && <Inspector {...inspectorProps} scene={scene} onClose={() => setInspectorOpen(false)}/>}
        </div>}

    <div className="statusbar">
      <span className="grow">{statusText}</span>
      <span>Тооцоо {fmt(data?.compute_ms, 1)} мс</span>
      <button className="btn btn-sm btn-ghost" onClick={() => setInspectorOpen(open => !open)} aria-label="Дэлгэрэнгүй хайврыг нээх эсвэл хаах">
        {inspectorOpen ? <PanelRightClose size={13}/> : <PanelRightOpen size={13}/>}
      </button>
      <span className="keys"><span className="kbd">1</span><span className="kbd">2</span><span className="kbd">3</span> топологи <span className="kbd">Esc</span> цэвэрлэх</span>
    </div>

    {modal && <NodeModal
      modal={modal}
      busy={busy}
      error={error}
      onClose={() => { setModal(null); }}
      onSubmit={values => perform('Маршрутыг дахин тооцож байна', () => mutate(
        modal.type === 'new' ? '/api/nodes' : `/api/nodes/${modal.id}`,
        values,
        modal.type === 'new' ? 'POST' : 'PATCH',
        modal.type === 'new' ? `${values.name} нэмэгдлээ` : `${values.name} шинэчлэгдлээ`))}
      onPickOnMap={values => { setPicking({...modal, ...values}); setModal(null); }}
      onDelete={() => perform('Зангилаа хасаж байна', () => mutate(`/api/nodes/${modal.id}`, {}, 'DELETE', `${modal.name} хасагдлаа`))}
      onReset={() => perform('Суурь төлөв сэргээж байна', () => mutate('/api/network/reset', {}, 'POST', 'Суурь 22 хотын төлөв сэргээлээ'))}
    />}
    <Toasts items={toasts}/>
  </div>;
}
