import {Download, Moon, Sun} from 'lucide-react';
import {COLORS, TOPOLOGIES} from '../constants';

// A meridian knot: the atlas mark. Two arcs crossing at a node.
function BrandMark() {
  return <svg className="brand-mark" viewBox="0 0 28 28" aria-hidden="true">
    <circle cx="14" cy="14" r="12.2" fill="none" stroke="currentColor" strokeWidth="1" opacity=".35"/>
    <path d="M4 20 C10 20 10 8 16 8 C22 8 22 18 24 18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    <path d="M4 9 C11 9 11 19 17 19 C21 19 22 14 24 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".55"/>
    <circle cx="14" cy="14" r="2" fill="currentColor"/>
  </svg>;
}

export default function TopBar({topology, setTopology, theme, setTheme, revision, busy, onExport, onMethod}) {
  return <header className="topbar">
    <div className="brand">
      <BrandMark/>
      <span className="brand-text">
        <b>FIBER ATLAS</b>
        <small>Монголын сүлжээний тэсвэрийн студи</small>
      </span>
    </div>

    <div className="mode-switch" role="radiogroup" aria-label="Топологи сонгох">
      {TOPOLOGIES.map(item => <button
        key={item.key}
        role="radio"
        aria-checked={topology === item.key}
        style={{'--mode-color': COLORS[item.key]}}
        onClick={() => setTopology(item.key)}
        title={item.hint}>
        <i className="swatch"/>
        <span className="mode-name">{item.short}</span>
      </button>)}
    </div>

    <div className="topbar-spacer"/>

    <span className="provenance" data-stale={busy ? 'true' : 'false'} title="Сүүлийн тооцооны хувилбар">
      <i className="dot"/>{busy ? 'Тооцоо хийгдэж байна…' : `Загвар · rev ${revision}`}
    </span>
    <button className="btn btn-sm btn-ghost" onClick={onMethod}>Аргачлал</button>
    <button className="btn btn-sm" onClick={onExport}><Download size={13}/>Экспорт</button>
    <button
      className="btn btn-sm btn-ghost"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label={theme === 'dark' ? 'Цайвар горимд шилжих' : 'Харанхуй горимд шилжих'}>
      {theme === 'dark' ? <Sun size={14}/> : <Moon size={14}/>}
    </button>
  </header>;
}
