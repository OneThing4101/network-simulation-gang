import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Crosshair, Minus, Plus } from 'lucide-react';
import { COLORS, MONGOLIA_BOUNDS, HIGHLIGHT, FAIL, fmt } from '../constants';
import { FlowLayer } from './flowLayer';

// Offline shaded-relief backdrop (Natural Earth gray relief), cropped to this box by scripts/make_relief.py.
export const RELIEF_BOUNDS = [[41.0, 87.0], [52.5, 120.5]];
// 'world' is an offline vector world (Natural Earth land + lakes, scripts/make_world.py) drawn in an Apple Maps-like
// cream/blue palette; the online styles sit on top of it, so a tile outage degrades to the same look without labels.
export const BASEMAPS = [
  {key: 'world', label: 'Дэлхий (офлайн)'},
  {key: 'relief', label: 'Дэлхий + рельеф (офлайн)'},
  {key: 'voyager', label: 'Voyager (онлайн)', url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'},
  {key: 'osm', label: 'OpenStreetMap', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'},
  {key: 'carto-light', label: 'CARTO цайвар', url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'},
  {key: 'carto-dark', label: 'CARTO харанхуй', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'},
  {key: 'topo', label: 'OpenTopoMap', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM | &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)'},
];

// Geography palette per theme. Cable colours never change: they are fixed by the assignment.
const PALETTE = {
  light: {country: {color: '#7C8A95', fill: .72, fillColor: '#FFFFFF'}, aimag: {color: '#B4C0C7', fill: 0}, mountain: {color: '#6F8290', fill: .12}, lake: {color: '#7FB9DE', fill: .9, fillColor: '#BFDBF0'}, river: {color: '#7FB9DE', fill: 0}, forest: {color: '#6E9466', fill: .13}, marker: '#2E3F4D', focus: '#16232E', markerFill: '#fff', casing: '#fff', soum: '#A3B2B9',
    land: {color: '#D9D3C9', fill: 1, fillColor: '#F4F2ED'}, worldLake: {color: '#BFDBF0', fill: 1, fillColor: '#BFDBF0'}},
  dark: {country: {color: '#8FA3B0', fill: .5, fillColor: '#223039'}, aimag: {color: '#4A5B66', fill: 0}, mountain: {color: '#9FB0BC', fill: .12}, lake: {color: '#3E88AD', fill: .9, fillColor: '#12222E'}, river: {color: '#3E88AD', fill: 0}, forest: {color: '#5B7D55', fill: .18}, marker: '#D5DEE3', focus: '#F2F4F3', markerFill: '#1B2730', casing: '#111A21', soum: '#4F6270',
    land: {color: '#2C3A45', fill: 1, fillColor: '#1B2630'}, worldLake: {color: '#12222E', fill: 1, fillColor: '#12222E'}},
};
const WEIGHT = {country: 1.2, aimag: .6, mountain: .7, lake: .7, river: 1.6, forest: .6};
const geoStyle = (s, weight, extra = {}) => ({color: s.color, weight, fillColor: s.fillColor || s.color, fillOpacity: s.fill, interactive: false, ...extra});
// Label placement tuned by hand so names in the dense centre do not collide.
const LABEL_DIR = {Zuunmod: 'bottom', Bulgan: 'left', Erdenet: 'top', Darkhan: 'right', UB: 'top', Bayankhongor: 'left', Arvaikheer: 'right', Mandalgovi: 'bottom', Choir: 'right', Khentii: 'top', Tsetserleg: 'left', Uliastai: 'bottom'};
// Floating side cards cover the map edges on desktop; keep Mongolia centred in the gap between them.
const fitPadding = () => {
  const w = el => (window.innerWidth > 960 && document.querySelector(el)?.offsetWidth) || 0;
  return {paddingTopLeft: [w('.rail') + 34, 70], paddingBottomRight: [w('.panel') + 34, 70]};
};
const text = value => { const el = document.createElement('span'); el.textContent = value; return el; };
const toLatLng = coords => coords.map(([lon, lat]) => [lat, lon]);

export default function GeoMap({data, geography, topology, selected, node, cut, path, layers, basemap, picking, hover, theme, onSelectEdge, onSelectNode, onHover, onPick, onTileFailure}) {
  const element = useRef(null), map = useRef(null), drawn = useRef(null), tiles = useRef(null), lines = useRef({});
  const soums = useRef({data: null, loading: false, lines: null, labels: null, aimags: null});
  const relief = useRef(null), flow = useRef(null);
  const world = useRef({data: null, loading: false, layer: null, labels: null});
  const handlers = useRef({});
  handlers.current = {onPick, onTileFailure, onHover, picking};

  useEffect(() => {
    const m = L.map(element.current, {zoomControl: false, attributionControl: true, minZoom: 2, maxZoom: 13, zoomSnap: .1, preferCanvas: true, worldCopyJump: true});
    m.fitBounds(MONGOLIA_BOUNDS, fitPadding());
    m.attributionControl.setPrefix('').addAttribution('Natural Earth · сургалтын загвар');
    relief.current = L.imageOverlay('/relief.webp', RELIEF_BOUNDS, {opacity: 1, interactive: false, className: 'relief-image', pane: 'tilePane'});
    flow.current = new FlowLayer();
    m.on('click', e => { if (handlers.current.picking) handlers.current.onPick?.({lat: e.latlng.lat.toFixed(4), lon: e.latlng.lng.toFixed(4)}); });
    // World land sits under the tile pane (200) so an online style covers it; soums and labels under the cables.
    m.createPane('world').style.zIndex = 150;
    m.createPane('soums').style.zIndex = 350;
    m.createPane('soumLabels').style.zIndex = 360;
    // City name tags only make sense once Mongolia is more than a thumbnail.
    const far = () => element.current.classList.toggle('zoom-far', m.getZoom() < 4.6);
    far();
    m.on('zoomend', () => { far(); handlers.current.refreshSoums?.(); handlers.current.refreshWorld?.(); });
    map.current = m;
    // The stage gets its final size after first paint; refit once so Mongolia fills the map.
    let fitted = false, narrow = window.innerWidth <= 960;
    const observer = new ResizeObserver(() => {
      m.invalidateSize();
      const nowNarrow = window.innerWidth <= 960;
      if ((!fitted && element.current.clientHeight > 200) || nowNarrow !== narrow) { fitted = true; narrow = nowNarrow; m.fitBounds(MONGOLIA_BOUNDS, fitPadding()); }
    });
    observer.observe(element.current);
    return () => { observer.disconnect(); m.remove(); };
  }, []);

  // Offline world: land and big lakes always, country names only while zoomed out (aimag names take over from 5.5).
  const refreshWorld = () => {
    const m = map.current, st = world.current;
    if (!m) return;
    if (!st.data && !st.loading) {
      st.loading = true;
      fetch('/world.geojson').then(r => r.json()).then(d => { st.data = d; st.loading = false; refreshWorld(); }).catch(() => { st.loading = false; });
      return;
    }
    if (!st.data) return;
    const pal = PALETTE[theme] || PALETTE.light, z = m.getZoom();
    if (!st.layer) st.layer = L.geoJSON(st.data, {pane: 'world', interactive: false, style: f => f.properties.k === 'lake' ? geoStyle(pal.worldLake, .5) : geoStyle(pal.land, .8)}).addTo(m);
    else st.layer.setStyle(f => f.properties.k === 'lake' ? geoStyle(pal.worldLake, .5) : geoStyle(pal.land, .8));
    // Each label carries Natural Earth's minimum zoom; Mongolia itself is labelled by its cities.
    const want = z < 5.5 ? st.data.labels.filter(l => l.a !== 'MN' && l.s <= z) : [];
    const key = want.map(l => l.a).join();
    if (st.labels && st.labelKey === key) return;
    st.labels?.remove();
    st.labelKey = key;
    st.labels = want.length ? L.layerGroup(want.map(l => L.marker([l.c[1], l.c[0]], {pane: 'soumLabels', interactive: false, keyboard: false, icon: L.divIcon({className: 'country-label', html: `<span>${l.n}</span>`, iconSize: null})}))).addTo(m) : null;
  };
  handlers.current.refreshWorld = refreshWorld;
  useEffect(() => { refreshWorld(); }, [theme]);

  // Basemap: offline world (optionally with relief inside Mongolia) or an online tile style over it. A failing tile source falls back to the offline world.
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

  // Signal flow: pulses move along every live cable; after a cut they vanish from isolated cities and follow the detour.
  useEffect(() => {
    const m = map.current; if (!m || !data) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!layers.flow || reduced) { flow.current.remove(); return; }
    if (!m.hasLayer(flow.current)) flow.current.addTo(m);
    const ids = new Set(data.topologies[topology].edge_ids), failed = new Set(cut?.failed_edges || []), isolated = new Set(cut?.isolated || []);
    const lit = new Set(path?.edges || cut?.reroute_edges || []);
    const dark = theme === 'dark';
    const routes = data.routes.filter(r => ids.has(r.id) && !failed.has(r.id) && !isolated.has(r.u) && !isolated.has(r.v) && (topology !== 'full' || lit.has(r.id) || r.id === selected))
      .map(r => ({latlng: toLatLng(r.geometry), color: lit.has(r.id) ? HIGHLIGHT : dark ? '#EAF2F7' : '#FFFFFF', speed: lit.has(r.id) ? 70 : 38, spacing: lit.has(r.id) ? 56 : 80, reverse: r.u === 'UB'}));
    flow.current.setRoutes(routes);
  }, [data, topology, cut, path, layers.flow, theme, selected]);

  // Administrative detail appears progressively: aimag names from zoom 5.5, soum borders from 7, soum names from 8.
  const refreshSoums = () => {
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
  };
  handlers.current.refreshSoums = refreshSoums;
  useEffect(() => { refreshSoums(); }, [layers.soums, theme]);

  useEffect(() => {
    if (!data || !geography || !map.current) return;
    const pal = PALETTE[theme] || PALETTE.light;
    drawn.current?.remove();
    const group = L.layerGroup().addTo(map.current);
    drawn.current = group; lines.current = {};

    L.geoJSON(geography, {
      filter: f => ['country', 'aimag'].includes(f.properties.kind) || layers[f.properties.kind],
      style: f => { const k = f.properties.kind; return geoStyle(pal[k] || pal.aimag, WEIGHT[k] || .6, {dashArray: k === 'mountain' ? '4 4' : null}); },
      interactive: false,
    }).addTo(group);

    const topo = data.topologies[topology];
    const ids = new Set(topo.edge_ids);
    const bridges = new Set(layers.bridges ? topo.stats.bridges : []);
    const added = new Set(layers.added && topology === 'protected' ? data.optimization.added : []);
    const failed = new Set(cut?.failed_edges || []);
    const lit = new Set(path?.edges || cut?.reroute_edges || []);
    const cityName = Object.fromEntries(data.cities.map(c => [c.id, c.name]));
    const full = topology === 'full';
    const routes = data.routes.filter(r => ids.has(r.id)).sort((a, b) => (a.id === selected) - (b.id === selected));

    routes.forEach(r => {
      const bad = failed.has(r.id), focus = r.id === selected, highlight = lit.has(r.id), bridge = bridges.has(r.id), extra = added.has(r.id);
      const latlng = toLatLng(r.geometry);
      const color = bad ? FAIL : highlight ? HIGHLIGHT : focus ? pal.focus : COLORS[topology];
      const weight = focus || highlight ? 5 : full ? 1.1 : extra ? 4.5 : bridge ? 3 : 2.6;
      const opacity = bad ? .75 : full && !focus && !highlight ? .16 : .9;
      const line = L.polyline(latlng, {color, weight, opacity, dashArray: bad ? '6 7' : bridge && !full && !focus ? '9 6' : null}).addTo(group);
      line.base = {weight, opacity};
      lines.current[r.id] = line;
      line.on('click', e => { L.DomEvent.stopPropagation(e); onSelectEdge(r.id); });
      line.on('mouseover', () => handlers.current.onHover?.(r.id));
      line.on('mouseout', () => handlers.current.onHover?.(null));
      line.bindTooltip(text(`${cityName[r.u]} — ${cityName[r.v]} · ${fmt(r.distance_km)} км${bridge ? ' · bridge' : extra ? ' · нэмэлт нөөц холбоос' : ''}`), {sticky: true});
      // Added redundancy links get a light dashed core so they read as "the extra ring" over the MST.
      if (extra && !bad && !highlight && !focus) L.polyline(latlng, {color: pal.casing, weight: 1.4, opacity: .95, dashArray: '5 6', interactive: false}).addTo(group);
      if (focus) L.polyline(latlng, {color: pal.casing, weight: 1.2, opacity: .9, interactive: false}).addTo(group);
      if (!full || focus) {
        if (layers.access) r.access.filter(a => a.mountain_access).forEach(a => L.polyline(toLatLng(a.coords), {color: '#DC992E', weight: 3, dashArray: '4 5', interactive: false}).addTo(group));
        (r.river_crossings || []).forEach(g => L.polyline(toLatLng(g.coords), {color: '#0A8786', weight: 4, dashArray: '3 4', interactive: false}).addTo(group));
      }
    });

    data.cities.forEach(c => {
      const isolated = cut?.isolated?.includes(c.id), active = node?.id === c.id, endpoint = path?.connected && (path.path[0] === c.id || path.path.at(-1) === c.id);
      const marker = L.circleMarker([c.lat, c.lon], {
        radius: c.id === 'UB' ? 7 : active ? 7 : 5, weight: 2,
        color: isolated ? FAIL : active ? pal.focus : endpoint ? HIGHLIGHT : pal.marker,
        fillColor: isolated ? '#F4B6B1' : active ? pal.focus : pal.markerFill, fillOpacity: 1,
      }).addTo(group);
      const dir = LABEL_DIR[c.id] || 'top';
      marker.bindTooltip(text(c.name), {permanent: true, direction: dir, className: 'city-label', offset: dir === 'left' ? [-7, 0] : dir === 'right' ? [7, 0] : [0, dir === 'top' ? -5 : 5]});
      marker.on('click', e => { L.DomEvent.stopPropagation(e); onSelectNode(c); });
    });
  }, [data, geography, topology, selected, node, cut, path, layers, theme]);

  // Hover from the side panels: emphasise one line without redrawing the whole layer.
  useEffect(() => {
    const all = lines.current;
    Object.values(all).forEach(l => l.setStyle(l.base));
    const l = hover && all[hover];
    if (l) { l.setStyle({weight: Math.max(l.base.weight + 2.5, 5), opacity: 1}); l.bringToFront(); }
  }, [hover]);

  const fit = () => map.current?.fitBounds(MONGOLIA_BOUNDS, fitPadding());
  return <>
    <div className={`map ${picking ? 'picking' : ''}`} ref={element} role="region" aria-label="Монгол улсын кабелийн сүлжээний газрын зураг"/>
    <div className="map-float zoom-stack" aria-label="Газрын зургийн удирдлага">
      <button onClick={() => map.current?.zoomIn()} aria-label="Томруулах"><Plus size={16}/></button>
      <button onClick={() => map.current?.zoomOut()} aria-label="Жижигрүүлэх"><Minus size={16}/></button>
      <button onClick={fit} aria-label="Монголыг бүтнээр харах" title="Монголыг бүтнээр харах"><Crosshair size={16}/></button>
    </div>
  </>;
}
