import L from 'leaflet';

// Canvas overlay that animates light pulses travelling along cables.
// It sits above the polyline renderer and below markers; pointer events pass through.
export const FlowLayer = L.Layer.extend({
  initialize(options) { L.setOptions(this, options); this._routes = []; this._paths = []; },
  onAdd(map) {
    this._map = map;
    this._canvas = L.DomUtil.create('canvas', 'flow-canvas');
    map.getPanes().overlayPane.appendChild(this._canvas);
    map.on('moveend zoomend resize', this._reset, this);
    map.on('zoomstart', this._hide, this);
    this._reset();
    this._start = performance.now();
    this._tick = this._tick.bind(this);
    this._raf = requestAnimationFrame(this._tick);
  },
  onRemove(map) {
    cancelAnimationFrame(this._raf);
    map.off('moveend zoomend resize', this._reset, this);
    map.off('zoomstart', this._hide, this);
    L.DomUtil.remove(this._canvas);
  },
  setRoutes(routes) { this._routes = routes; if (this._map) this._project(); },
  _hide() { this._canvas.style.opacity = 0; },
  _reset() {
    const size = this._map.getSize(), topLeft = this._map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this._canvas, topLeft);
    this._canvas.width = size.x * devicePixelRatio; this._canvas.height = size.y * devicePixelRatio;
    this._canvas.style.width = `${size.x}px`; this._canvas.style.height = `${size.y}px`;
    this._canvas.style.opacity = 1;
    this._project();
  },
  _project() {
    const map = this._map;
    this._paths = this._routes.map((r, i) => {
      const pts = r.latlng.map(ll => map.latLngToContainerPoint(ll));
      const cum = [0];
      for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + pts[k].distanceTo(pts[k - 1]));
      return {pts, cum, length: cum[cum.length - 1], color: r.color, speed: r.speed || 38, spacing: r.spacing || 72, phase: (i * 37) % 72, reverse: r.reverse};
    });
  },
  _pointAt(p, d) {
    if (p.reverse) d = p.length - d;
    let k = 1; while (k < p.cum.length - 1 && p.cum[k] < d) k++;
    const a = p.pts[k - 1], b = p.pts[k], seg = p.cum[k] - p.cum[k - 1];
    const t = seg ? (d - p.cum[k - 1]) / seg : 0;
    return [a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t];
  },
  _tick(now) {
    this._raf = requestAnimationFrame(this._tick);
    if (!this._paths.length || document.hidden) return;
    const ctx = this._canvas.getContext('2d'), dpr = devicePixelRatio;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    const t = (now - this._start) / 1000;
    for (const p of this._paths) {
      if (p.length < 4) continue;
      const shift = (t * p.speed + p.phase) % p.spacing;
      ctx.fillStyle = p.color;
      for (let d = shift; d < p.length; d += p.spacing) {
        const [x, y] = this._pointAt(p, d);
        ctx.globalAlpha = .28; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  },
});
