import {useCallback, useEffect, useRef, useState} from 'react';
import L from 'leaflet';
import {Crosshair, Minus, Plus} from 'lucide-react';
import {COLORS, MONGOLIA_BOUNDS, HIGHLIGHT, FAIL} from '../constants';

export const RELIEF_BOUNDS = [[41.0, 87.0], [52.5, 120.5]];
export const BASEMAPS = [
  {key: 'relief', label: 'Рельеф (офлайн)'},
  {key: 'plain', label: 'Энгийн (офлайн)'},
  {key: 'osm', label: 'OpenStreetMap', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'},
  {key: 'carto-light', label: 'CARTO цайвар', url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'},
  {key: 'carto-dark', label: 'CARTO харанхуй', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'},
  {key: 'topo', label: 'OpenTopoMap', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM | &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)'},
];

// Geography palette per theme. Cable colours never change: they are fixed by the assignment.
const PALETTE = {
  light: {country: {color: '#6B7C86', fill: .04}, aimag: {color: '#A3B2B9', fill: 0}, mountain: {color: '#6F8290', fill: .13}, lake: {color: '#5FAFD3', fill: .6}, river: {color: '#4A9FC9', fill: 0}, forest: {color: '#6E9466', fill: .13}, marker: '#2E3F4D', focus: '#16232E', markerFill: '#fff', casing: '#fff', soum: '#8A9AA3', graticule: '#9AA7AE'},
  dark: {country: {color: '#8FA3B0', fill: .07}, aimag: {color: '#4A5B66', fill: 0}, mountain: {color: '#9FB0BC', fill: .12}, lake: {color: '#3E88AD', fill: .55}, river: {color: '#3E88AD', fill: 0}, forest: {color: '#5B7D55', fill: .18}, marker: '#D5DEE3', focus: '#F2F4F3', markerFill: '#1B2730', casing: '#111A21', soum: '#4F6270', graticule: '#3D4E58'},
};
const WEIGHT = {country: 1.4, aimag: .6, mountain: .7, lake: .7, river: 1.6, forest: .6};
const LABEL_DIR = {Zuunmod: 'bottom', Bulgan: 'left', Erdenet: 'top', Darkhan: 'right', UB: 'top', Bayankhongor: 'left', Arvaikheer: 'right', Mandalgovi: 'bottom', Choir: 'right', Khentii: 'top', Tsetserleg: 'left', Uliastai: 'bottom'};
const text = value => { const el = document.createElement('span'); el.textContent = value; return el; };
const toLatLng = coords => coords.map(([lon, lat]) => [lat, lon]);

const MERIDIANS = [90, 95, 100, 105, 110, 115, 120];
const PARALLELS = [42, 44, 46, 48, 50, 52];
const NICE_KM = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

function graticuleLayers(map, palette) {
  const group = L.layerGroup();
  MERIDIANS.forEach(lon => {
    group.addLayer(L.polyline([[41, lon], [52.5, lon]], {color: palette.graticule, weight: .7, opacity: .7, interactive: false}));
    group.addLayer(L.marker([52.45, lon], {interactive: false, keyboard: false, icon: L.divIcon({className: 'graticule-label', html: `<span>${lon}°E</span>`, iconSize: null})}));
  });
  PARALLELS.forEach(lat => {
    group.addLayer(L.polyline([[lat, 87], [lat, 120.5]], {color: palette.graticule, weight: .7, opacity: .7, interactive: false}));
    group.addLayer(L.marker([lat, 120.4], {interactive: false, keyboard: false, icon: L.divIcon({className: 'graticule-label', html: `<span>${lat}°N</span>`, iconSize: null})}));
  });
  return group;
}

// A measured bar: the map is a plate, so it carries its own scale.
function scaleFor(map) {
  const origin = map.containerPointToLatLng([0, 0]);
  const span = map.containerPointToLatLng([100, 0]);
  const metresPerPixel = map.distance(origin, span) / 100;
  if (!Number.isFinite(metresPerPixel) || metresPerPixel <= 0) return null;
  const targetKm = 120 * metresPerPixel / 1000;
  const km = NICE_KM.reduce((best, value) => Math.abs(value - targetKm) < Math.abs(best - targetKm) ? value : best, NICE_KM[0]);
  return {km, width: Math.max(24, Math.round(km * 1000 / metresPerPixel))};
}

export default function MapPlate({
  data, geography, geometry, topology, selected, node, replay, path, layers, basemap,
  theme, picking, hover, onSelectEdge, onSelectNode, onHover, onPick, onTileFailure, focus, corridor, highlightIds,
}) {
  const element = useRef(null), map = useRef(null);
  const baseLayer = useRef(null), networkLayer = useRef(null), markerLayer = useRef(null);
  const graticuleLayer = useRef(null), tiles = useRef(null), relief = useRef(null);
  const lines = useRef({}), markers = useRef({});
  const userMoved = useRef(false);
  const [scale, setScale] = useState(null);
  const [cursor, setCursor] = useState(null);
  const soums = useRef({data: null, loading: false, lines: null, labels: null, aimags: null});
  const handlers = useRef({});
  handlers.current = {onPick, onTileFailure, onHover, picking};

  const palette = PALETTE[theme] || PALETTE.light;
  const selectedEdge = (replay?.edge_id) || selected;

  useEffect(() => {
    const m = L.map(element.current, {zoomControl: false, attributionControl: true, minZoom: 4, maxZoom: 13, zoomSnap: .1, preferCanvas: true});
    m.attributionControl.setPrefix('').addAttribution('Natural Earth · сургалтын загвар');
    relief.current = L.imageOverlay('/relief.webp', RELIEF_BOUNDS, {opacity: 1, interactive: false, className: 'relief-image', pane: 'tilePane'});
    m.on('click', e => { if (handlers.current.picking) handlers.current.onPick?.({lat: e.latlng.lat.toFixed(4), lon: e.latlng.lng.toFixed(4)}); });
    m.createPane('soums').style.zIndex = 350;
    m.createPane('soumLabels').style.zIndex = 360;
    m.createPane('graticule').style.zIndex = 320;
    map.current = m;

    // The plate is refitted when its frame changes, until the reader takes
    // control of the camera themselves.
    const fit = () => {
      m.invalidateSize();
      if (element.current.clientHeight > 200) m.fitBounds(MONGOLIA_BOUNDS, {padding: [18, 18]});
    };
    const markUser = () => { userMoved.current = true; };
    m.on('dragstart', markUser);
    m.on('wheel', markUser, {passive: true});
    m.on('mousemove', e => setCursor({lat: e.latlng.lat, lon: e.latlng.lng}));
    m.on('mouseout', () => setCursor(null));
    const observer = new ResizeObserver(() => { if (!userMoved.current) fit(); else m.invalidateSize(); });
    observer.observe(element.current);
    fit();
    return () => { observer.disconnect(); m.remove(); };
  }, []);

  // The scale bar follows the zoom level.
  useEffect(() => {
    const m = map.current; if (!m) return;
    const update = () => setScale(scaleFor(m));
    update();
    m.on('zoomend', update);
    m.on('moveend', update);
    const observer = new ResizeObserver(update);
    observer.observe(element.current);
    return () => { m.off('zoomend', update); m.off('moveend', update); observer.disconnect(); };
  }, []);

  useEffect(() => {
    const m = map.current; if (!m) return;
    tiles.current?.remove(); tiles.current = null;
    const b = BASEMAPS.find(x => x.key === basemap) || BASEMAPS[0];
    if (b.key === 'relief') relief.current.addTo(m); else relief.current.remove();
    if (b.url) {
      let failures = 0;
      tiles.current = L.tileLayer(b.url, {maxZoom: 18, subdomains: 'abcd', attribution: b.attribution});
      tiles.current.on('tileerror', () => { if (++failures >= 3 && tiles.current) { tiles.current.remove(); tiles.current = null; handlers.current.onTileFailure?.(); } });
      tiles.current.addTo(m);
    }
  }, [basemap]);

  // Graticule: the map is a measured plate, so the coordinate frame is drawn.
  useEffect(() => {
    const m = map.current; if (!m) return;
    graticuleLayer.current?.remove();
    graticuleLayer.current = null;
    if (!layers.graticule) return;
    const group = graticuleLayers(m, palette);
    graticuleLayer.current = group;
    group.addTo(m);
    return () => { group.remove(); };
  }, [layers.graticule, theme]);

  const refreshSoums = useCallback(() => {
    const m = map.current, st = soums.current;
    if (!m) return;
    const z = m.getZoom(), pal = PALETTE[theme] || PALETTE.light;
    const wantBorders = layers.soums && z >= 7, wantLabels = layers.soums && z >= 8, wantAimags = layers.soums && z >= 5.5 && z < 8.5;
    if ((wantBorders || wantAimags) && !st.data && !st.loading) {
      st.loading = true;
      fetch('/soums.geojson').then(r => r.json()).then(d => { st.data = d; st.loading = false; refreshSoums(); }).catch(() => { st.loading = false; });
      return;
    }
    if (!st.data) return;
    if (wantBorders && !st.lines) st.lines = L.geoJSON(st.data, {pane: 'soums', interactive: false, style: {color: pal.soum, weight: .7, opacity: .9, fill: false}}).addTo(m);
    if (!wantBorders && st.lines) { st.lines.remove(); st.lines = null; }
    if (wantLabels && !st.labels) st.labels = L.layerGroup(st.data.features.map(f => L.marker([f.properties.c[1], f.properties.c[0]], {pane: 'soumLabels', interactive: false, keyboard: false, icon: L.divIcon({className: 'soum-label', html: `<span>${f.properties.n}</span>`, iconSize: null})}))).addTo(m);
    if (!wantLabels && st.labels) { st.labels.remove(); st.labels = null; }
    if (wantAimags && !st.aimags) st.aimags = L.layerGroup(st.data.aimags.map(a => L.marker([a.c[1], a.c[0]], {pane: 'soumLabels', interactive: false, keyboard: false, icon: L.divIcon({className: 'aimag-label', html: `<span>${a.n}</span>`, iconSize: null})}))).addTo(m);
    if (!wantAimags && st.aimags) { st.aimags.remove(); st.aimags = null; }
    if (st.lines) st.lines.setStyle({color: pal.soum});
  }, [layers.soums, theme]);

  useEffect(() => { refreshSoums(); }, [refreshSoums]);
  useEffect(() => {
    const m = map.current; if (!m) return;
    const onZoom = () => refreshSoums();
    m.on('zoomend', onZoom);
    return () => { m.off('zoomend', onZoom); };
  }, [refreshSoums]);

  // Geography: one layer group, rebuilt only when the data or the toggles change.
  useEffect(() => {
    const m = map.current; if (!m || !geography) return;
    baseLayer.current?.remove();
    const group = L.layerGroup().addTo(m);
    baseLayer.current = group;
    L.geoJSON(geography, {
      filter: f => ['country', 'aimag'].includes(f.properties.kind) || layers[f.properties.kind],
      style: f => {
        const k = f.properties.kind, s = palette[k] || palette.aimag;
        return {color: s.color, weight: WEIGHT[k] || .6, fillColor: s.color, fillOpacity: s.fill, dashArray: k === 'mountain' ? '4 4' : null, interactive: false};
      },
      interactive: false,
    }).addTo(group);
  }, [geography, layers, theme]);

  // The network: rebuilt only when the topology or its geometry changes.
  useEffect(() => {
    const m = map.current; if (!m || !data || !geometry) return;
    networkLayer.current?.remove();
    const group = L.layerGroup().addTo(m);
    networkLayer.current = group;
    lines.current = {};

    const topo = data.topologies[topology];
    const ids = new Set(topo.edge_ids);
    const cityName = Object.fromEntries(data.cities.map(c => [c.id, c.name]));
    const full = topology === 'full';
    const added = new Set(layers.added && topology === 'protected' ? (data.optimization.added || []) : []);

    data.routes.filter(r => ids.has(r.id)).forEach(r => {
      const coords = geometry[r.id];
      if (!coords) return;
      const latlng = toLatLng(coords);
      const isAdded = added.has(r.id);
      const base = full
        ? {weight: 1.1, opacity: .13, color: COLORS[topology], dashArray: null}
        : {weight: isAdded ? 4.2 : 2.6, opacity: .92, color: COLORS[topology], dashArray: null};
      const line = L.polyline(latlng, {...base, interactive: true});
      line.base = base;
      line.addTo(group);
      lines.current[r.id] = line;
      line.on('click', e => { L.DomEvent.stopPropagation(e); onSelectEdge(r.id); });
      line.on('mouseover', () => handlers.current.onHover?.(r.id));
      line.on('mouseout', () => handlers.current.onHover?.(null));
      line.bindTooltip(text(`${cityName[r.u]} — ${cityName[r.v]} · ${Math.round(r.distance_km)} км${isAdded ? ' · нэмэлт нөөц холбоос' : ''}`), {sticky: true});
    });
  }, [data, geometry, topology, layers.added, theme]);

  // Status styling: selection, failure and reroute are restyled in place so a
  // click never rebuilds 231 polylines.
  useEffect(() => {
    const m = map.current; if (!m) return;
    const topo = data?.topologies[topology];
    const bridgeSet = new Set(layers.bridges && topo?.stats ? topo.stats.bridges : []);
    const addedSet = new Set(layers.added && topology === 'protected' ? (data?.optimization.added || []) : []);
    const failed = new Set(replay?.failed_edges || []);
    const lit = new Set(replay?.reroute_edges || path?.edges || []);
    const marked = new Set(highlightIds || []);
    const full = topology === 'full';
    const pal = palette;

    Object.entries(lines.current).forEach(([id, line]) => {
      const base = line.base;
      const isFocus = id === selectedEdge;
      const isBridge = bridgeSet.has(id);
      const isAdded = addedSet.has(id);
      const isLit = lit.has(id);
      const isMarked = marked.has(id);
      const isBad = failed.has(id);
      const color = isBad ? FAIL : isLit ? HIGHLIGHT : isMarked ? HIGHLIGHT : isFocus ? pal.focus : base.color;
      let weight = base.weight, opacity = base.opacity, dash = base.dashArray;
      if (isBad) { weight = 4.2; opacity = .85; dash = '6 7'; }
      else if (isLit) { weight = 5.2; opacity = 1; dash = null; }
      else if (isMarked) { weight = 4.6; opacity = 1; dash = '7 5'; }
      else if (isFocus) { weight = 5.2; opacity = 1; dash = null; }
      else if (full) { weight = 1.1; opacity = .13; }
      else if (isAdded) { weight = 4.2; }
      else if (isBridge) { weight = 3.2; dash = '9 6'; }
      line.setStyle({color, weight, opacity, dashArray: dash});
    });
    // The emphasised lines are drawn last so they read above the network.
    [selectedEdge, ...lit, ...failed].forEach(id => {
      const line = lines.current[id];
      if (line) line.bringToFront();
    });
  }, [data, topology, selectedEdge, replay, path, layers.bridges, layers.added, theme, highlightIds]);

  // Added redundancy reads as a second, lighter line over the trunk.
  useEffect(() => {
    const m = map.current; if (!m || !data || !geometry) return;
    const overlay = L.layerGroup().addTo(m);
    const added = new Set(layers.added && topology === 'protected' ? (data.optimization.added || []) : []);
    const failed = new Set(replay?.failed_edges || []);
    added.forEach(id => {
      if (!geometry[id] || failed.has(id) || id === selectedEdge) return;
      L.polyline(toLatLng(geometry[id]), {color: palette.casing, weight: 1.4, opacity: .9, dashArray: '5 6', interactive: false}).addTo(overlay);
    });
    return () => overlay.remove();
  }, [data, geometry, topology, layers.added, selectedEdge, replay, theme]);

  // River gates and the declared mountain access segments.
  useEffect(() => {
    const m = map.current; if (!m || !data || !geometry) return;
    const overlay = L.layerGroup().addTo(m);
    const ids = new Set(data.topologies[topology].edge_ids);
    if (layers.gates) {
      data.routes.filter(r => ids.has(r.id)).forEach(r => {
        (r.river_crossings || []).forEach(g => {
          L.polyline(toLatLng(g.coords), {color: '#0A8786', weight: 3.4, dashArray: '3 4', interactive: false}).addTo(overlay);
        });
      });
    }
    if (layers.access) {
      data.routes.filter(r => ids.has(r.id) && r.id !== selectedEdge).forEach(r => {
        (r.access || []).filter(a => a.mountain_access).forEach(a => {
          L.polyline(toLatLng(a.coords), {color: '#DC992E', weight: 2.6, dashArray: '4 5', interactive: false}).addTo(overlay);
        });
      });
    }
    return () => overlay.remove();
  }, [data, geometry, topology, layers.gates, layers.access, selectedEdge]);

  // Shared-risk corridors drawn as a highlighted band.
  useEffect(() => {
    const m = map.current; if (!m || !data || !geometry) return;
    const overlay = L.layerGroup().addTo(m);
    if (layers.corridor && corridor?.groups) {
      const ids = new Set(data.topologies[topology].edge_ids);
      corridor.groups.forEach(group => {
        group.edge_ids.filter(id => ids.has(id)).forEach(id => {
          if (!geometry[id]) return;
          L.polyline(toLatLng(geometry[id]), {color: '#B3261E', weight: 9, opacity: .16, interactive: false, lineCap: 'round'}).addTo(overlay);
        });
      });
    }
    return () => overlay.remove();
  }, [corridor, layers.corridor, data, geometry, topology]);

  // City markers.
  useEffect(() => {
    const m = map.current; if (!m || !data) return;
    markerLayer.current?.remove();
    const group = L.layerGroup().addTo(m);
    markerLayer.current = group;
    markers.current = {};
    const isolated = new Set(replay?.isolated || []);
    data.cities.forEach(c => {
      const isIsolated = isolated.has(c.id);
      const isActive = node?.id === c.id;
      const isEndpoint = replay?.reroute?.length && (replay.reroute[0] === c.id || replay.reroute.at(-1) === c.id);
      const marker = L.circleMarker([c.lat, c.lon], {
        radius: c.id === 'UB' ? 6.5 : isActive ? 6.5 : 4.5, weight: 2,
        color: isIsolated ? FAIL : isActive ? palette.focus : isEndpoint ? HIGHLIGHT : palette.marker,
        fillColor: isIsolated ? '#F4B6B1' : isActive ? palette.focus : palette.markerFill, fillOpacity: 1,
        className: 'marker-hit',
      }).addTo(group);
      markers.current[c.id] = marker;
      const dir = LABEL_DIR[c.id] || 'top';
      marker.bindTooltip(text(c.name), {permanent: true, direction: dir, className: 'city-label', offset: dir === 'left' ? [-7, 0] : dir === 'right' ? [7, 0] : [0, dir === 'top' ? -5 : 5]});
      marker.on('click', e => { L.DomEvent.stopPropagation(e); onSelectNode(c); });
    });
  }, [data, node, replay, theme]);

  // Hover emphasis without a redraw.
  useEffect(() => {
    Object.values(lines.current).forEach(line => line.setStyle(line.base));
    const line = hover && lines.current[hover];
    if (line) {
      line.setStyle({weight: Math.max(line.base.weight + 2.4, 5), opacity: 1});
      line.bringToFront();
    }
  }, [hover]);

  // Focus a route or a node when the inspector asks for it.
  useEffect(() => {
    const m = map.current; if (!m || !focus) return;
    const target = focus.kind === 'node'
      ? (data?.cities.find(c => c.id === focus.id) || null)
      : (geometry?.[focus.id] ? toLatLng(geometry[focus.id]) : null);
    if (!target) return;
    if (focus.kind === 'node') m.setView([target.lat, target.lon], Math.max(m.getZoom(), 6), {animate: true});
    else m.fitBounds(L.latLngBounds(target).pad(0.35), {maxZoom: 8, animate: true});
  }, [focus, geometry, data]);

  const fit = () => {
    userMoved.current = false;
    map.current?.invalidateSize();
    map.current?.fitBounds(MONGOLIA_BOUNDS, {padding: [18, 18]});
  };

  return <>
    <div className={`map ${picking ? 'picking' : ''}`} ref={element} role="region" aria-label="Монгол улсын кабелийн сүлжээний газрын зураг"/>
    <div className="plate-frame" aria-hidden="true"><i/><i/><i/><i/></div>
    <div className="overlay plate-furniture">
      <div className="north" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 2 L15.5 21 L12 17.5 L8.5 21 Z" fill="currentColor" opacity=".85"/><path d="M12 2 L15.5 21 L12 17.5 Z" fill="currentColor" opacity=".45"/></svg>
        <span>С</span>
      </div>
      {scale && <div className="scalebar">
        <div className="scalebar-rule" style={{width: `${scale.width}px`}}/>
        <span>{scale.km >= 1 ? `${scale.km} км` : `${scale.km * 1000} м`}</span>
      </div>}
      <div className="readout num" aria-live="off">
        {cursor ? `${cursor.lat.toFixed(2)}° N · ${cursor.lon.toFixed(2)}° E` : 'WGS 84'}
      </div>
    </div>
    <div className="overlay zoom-stack" aria-label="Газрын зургийн удирдлага">
      <button onClick={() => map.current?.zoomIn()} aria-label="Томруулах"><Plus size={16}/></button>
      <button onClick={() => map.current?.zoomOut()} aria-label="Жижигрүүлэх"><Minus size={16}/></button>
      <button onClick={fit} aria-label="Монголыг бүтнээр харах" title="Монголыг бүтнээр харах"><Crosshair size={16}/></button>
    </div>
  </>;
}
