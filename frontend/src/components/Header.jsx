import { Download, Network, Play, ArrowUpRight, Sun, Moon } from 'lucide-react';

export const TABS = [['design', 'Төлөвлөлт'], ['failure', 'Тасралтын туршилт'], ['manage', 'Өгөгдөл'], ['method', 'Аргачлал']];

export default function Header({tab, setTab, busy, topology, onTour, tourOpen, theme, setTheme}) {
  return <header className="topbar">
    <a className="brand" href="/"><span className="brand-mark"><Network size={17}/></span><span>Network Simulation Gang<small>Монголын шилэн кабелийн сүлжээ</small></span></a>
    <nav className="tabs" role="tablist" aria-label="Үндсэн цэс">{TABS.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{label}</button>)}</nav>
    <span className={`status-dot ${busy ? 'busy' : ''}`} role="status"><i/>{busy ? `${busy}…` : 'Локал сервер'}</span>
    <div className="topbar-actions flex items-center gap-2">
      <button className="btn btn-sm icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Цайвар горим' : 'Харанхуй горим'} title={theme === 'dark' ? 'Цайвар горим' : 'Харанхуй горим'}>{theme === 'dark' ? <Sun size={14}/> : <Moon size={14}/>}</button>
      <button className="btn btn-sm" onClick={onTour} aria-pressed={tourOpen}><Play size={13}/>Танилцуулга</button>
      <details className="menu"><summary className="btn btn-sm"><Download size={13}/>Экспорт</summary>
        <div className="menu-list">{[['geojson', 'GeoJSON', 'картын давхарга'], ['csv', 'CSV', 'кабелийн хүснэгт'], ['json', 'JSON', 'бүрэн төлөв']].map(([k, label, hint]) => <a key={k} href={`/api/export/${k}?topology=${topology}`} download><span>{label}<small className="block text-[11px] text-muted">{hint}</small></span><ArrowUpRight size={13}/></a>)}</div>
      </details>
    </div>
  </header>;
}
