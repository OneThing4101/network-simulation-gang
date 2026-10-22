import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {get, patch, post, remove, waitForJob} from '../api';
import {SCENES, TOPOLOGIES} from '../constants';

const SCENE_KEYS = SCENES.map(s => s.key);
const TOPO_KEYS = TOPOLOGIES.map(t => t.key);

function readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  return {
    scene: SCENE_KEYS.includes(params.get('scene')) ? params.get('scene') : 'atlas',
    topology: TOPO_KEYS.includes(params.get('topo')) ? params.get('topo') : 'protected',
    edge: params.get('edge') || '',
    node: params.get('node') || '',
  };
}

function readTheme() {
  try {
    const saved = localStorage.getItem('fiber-theme');
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {}
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const DEFAULT_LAYERS = {
  mountain: true, lake: true, river: true, forest: false, soums: true,
  bridges: true, added: true, access: true, gates: true,
  reroute: true, corridor: false, graticule: true,
};

// The whole workspace state lives here so scenes stay presentational and the
// map never rebuilds because a panel re-rendered.
export function useAtlas() {
  const start = useRef(readHash()).current;
  const alive = useRef(true);
  const [data, setData] = useState(null);
  const [geography, setGeography] = useState(null);
  const [geometry, setGeometry] = useState({});
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [toasts, setToasts] = useState([]);
  const [revision, setRevision] = useState(0);

  const [scene, setScene] = useState(start.scene);
  const [topology, setTopology] = useState(start.topology);
  const [selected, setSelected] = useState(start.edge);
  const [node, setNode] = useState(start.node);
  const [hover, setHover] = useState(null);
  const [replay, setReplay] = useState(null);
  const [corridor, setCorridor] = useState(null);
  const [evolution, setEvolution] = useState(null);
  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const [basemap, setBasemap] = useState(() => {
    try { return localStorage.getItem('fiber-basemap') || 'relief'; } catch { return 'relief'; }
  });
  const [theme, setTheme] = useState(readTheme);
  const [source, setSource] = useState('UB');
  const [target, setTarget] = useState('Darkhan');

  const notify = useCallback((text, kind = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts(list => [...list, {id, text, kind}]);
    setTimeout(() => alive.current && setToasts(list => list.filter(item => item.id !== id)), 4200);
  }, []);

  const reload = useCallback(async () => {
    const value = await get('/api/network/topologies');
    if (!alive.current) return value;
    setData(value);
    setRevision(value.revision);
    setSource(old => value.cities.some(c => c.id === old) ? old : value.cities[0].id);
    setTarget(old => value.cities.some(c => c.id === old) ? old : value.cities.at(-1).id);
    return value;
  }, []);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const [value, geo] = await Promise.all([reload(), get('/api/geography').then(setGeography)]);
      return value;
    } catch (e) {
      setLoadError(e.message);
      return null;
    }
  }, [reload]);

  useEffect(() => {
    alive.current = true;
    load();
    return () => { alive.current = false; };
  }, [load]);

  useEffect(() => { try { localStorage.setItem('fiber-basemap', basemap); } catch {} }, [basemap]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('fiber-theme', theme); } catch {}
  }, [theme]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('scene', scene);
    params.set('topo', topology);
    if (selected) params.set('edge', selected);
    if (node) params.set('node', node);
    history.replaceState(null, '', `#${params.toString()}`);
  }, [scene, topology, selected, node]);

  // A pasted or shared link, and the browser's back button, must both land on
  // the view they name rather than on whatever was last opened.
  useEffect(() => {
    const onHash = () => {
      const next = readHash();
      setScene(next.scene);
      setTopology(next.topology);
      if (next.edge) setSelected(next.edge);
      if (next.node) setNode(next.node);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // A selection that does not exist in the active topology is not "current":
  // the inspector must never present a stale audit as the live one.
  useEffect(() => {
    if (!data) return;
    const ids = data.topologies[topology].edge_ids;
    if (selected && !ids.includes(selected)) {
      const owner = TOPO_KEYS.find(key => data.topologies[key].edge_ids.includes(selected));
      if (owner) { setTopology(owner); return; }
      setSelected(ids[0] || '');
    }
    if (node && !data.cities.some(c => c.id === node)) setNode('');
    setReplay(null);
  }, [topology, data, node]);

  // Geometry is fetched per topology so the map never downloads all 231 routes.
  useEffect(() => {
    if (!data) return;
    const key = topology;
    let cancelled = false;
    get(`/api/network/geometry?topology=${key}`).then(value => {
      if (!cancelled && alive.current) setGeometry(previous => ({...previous, [key]: value.geometry}));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [topology, data]);

  useEffect(() => {
    if (scene !== 'evolution' || evolution) return;
    get('/api/network/evolution').then(value => alive.current && setEvolution(value)).catch(() => {});
  }, [scene, evolution]);

  useEffect(() => {
    if (scene !== 'resilience' || corridor) return;
    get(`/api/network/corridors?topology=${topology}`).then(value => alive.current && setCorridor(value)).catch(() => {});
  }, [scene, corridor, topology]);

  const perform = useCallback(async (label, task) => {
    setError('');
    setBusy(label);
    try {
      return await task();
    } catch (e) {
      setError(e.message);
      notify(e.message, 'fail');
      return null;
    } finally {
      if (alive.current) setBusy('');
    }
  }, [notify]);

  const mutate = useCallback(async (path, body, method = 'POST', done = 'Хадгаллаа') => {
    const response = await (method === 'PATCH' ? patch(path, body) : method === 'DELETE' ? remove(path, body) : post(path, body));
    if (response.job_id) await waitForJob(response.job_id);
    await reload();
    setReplay(null);
    setEvolution(null);
    setCorridor(null);
    notify(done);
    return response;
  }, [reload, notify]);

  const runReplay = useCallback(async (topo, edgeId, scope = 'cable') => {
    if (!edgeId) return;
    await perform('Тасралтыг шалгаж байна', async () => {
      const result = await post('/api/network/failure-replay', {topology: topo, edge_id: edgeId, scope});
      if (alive.current) { setReplay(result); setSelected(edgeId); }
      return result;
    });
  }, [perform]);

  const changeScene = useCallback(next => {
    setScene(next);
    if (next === 'method' || next === 'data') setNode('');
  }, []);

  const changeSelected = useCallback(id => {
    setSelected(id);
    setNode('');
  }, []);

  const names = useMemo(
    () => Object.fromEntries((data?.cities || []).map(c => [c.id, c.name])),
    [data]);
  const name = useCallback(id => names[id] || id, [names]);
  const edge = useMemo(
    () => data?.routes.find(r => r.id === selected) || null,
    [data, selected]);
  const stats = data?.topologies[topology]?.stats || null;
  const edges = useMemo(() => {
    const ids = new Set(data?.topologies[topology]?.edge_ids || []);
    return (data?.routes || []).filter(r => ids.has(r.id));
  }, [data, topology]);

  return {
    data, geography, geometry, loadError, busy, error, toasts, revision,
    scene, setScene: changeScene, topology, setTopology,
    selected, setSelected: changeSelected, node, setNode, hover, setHover,
    replay, setReplay, corridor, setCorridor, evolution, setEvolution,
    layers, setLayers, basemap, setBasemap, theme, setTheme,
    source, setSource, target, setTarget,
    notify, reload, load, perform, mutate, runReplay,
    names, name, edge, stats, edges,
  };
}
