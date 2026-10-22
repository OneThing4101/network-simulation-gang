import {fmt} from '../constants';

// The headline numbers, compressed to one strip over the map. Details stay in
// the inspector; the strip answers "what am I looking at" without scrolling.
export default function SummaryStrip({stats, cities}) {
  if (!stats) {
    return <div className="overlay overlay-panel summary-strip">
      <div className="metric"><small>Топологи</small><b>—</b></div>
      <div className="metric"><small>Тайлбар</small><b style={{fontSize: 11}}>Байгуулах боломжгүй</b></div>
    </div>;
  }
  return <div className="overlay overlay-panel summary-strip" aria-label="Топологийн үндсэн үзүүлэлт">
    <div className="metric">
      <small>Кабель</small>
      <b className="num">{fmt(stats.edges)}</b>
    </div>
    <div className="metric" data-tone={stats.bridge_count === 0 ? 'ok' : 'fail'}>
      <small>Bridge</small>
      <b className="num">{fmt(stats.bridge_count)}</b>
    </div>
    <div className="metric">
      <small>Урт</small>
      <b className="num">{fmt(stats.km)}<em>км</em></b>
    </div>
    <div className="metric">
      <small>Хамгийн их RTT</small>
      <b className="num">{stats.rtt_ms == null ? '—' : fmt(stats.rtt_ms, 1)}<em>мс</em></b>
    </div>
    <div className="metric">
      <small>Өртөг</small>
      <b className="num">{fmt(stats.cost_km)}<em>w-км</em></b>
    </div>
    <div className="metric">
      <small>Хот</small>
      <b className="num">{fmt(cities)}</b>
    </div>
  </div>;
}
