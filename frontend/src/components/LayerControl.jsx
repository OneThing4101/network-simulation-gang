import {useEffect, useRef, useState} from 'react';
import {Layers, Map as MapIcon, X} from 'lucide-react';
import {LAYER_GROUPS, LAYER_PRESETS} from '../constants';
import {BASEMAPS} from './MapPlate';

// One discoverable control instead of nine equal buttons. Layers are grouped
// by what they are for, and a preset sets the whole plate in one click.
export default function LayerControl({layers, setLayers, basemap, setBasemap, onTileFailure}) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (root.current && !root.current.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const toggle = key => setLayers(previous => ({...previous, [key]: !previous[key]}));

  const applyPreset = preset => {
    if (preset === 'all') return setLayers({mountain: true, lake: true, river: true, forest: true, soums: true, bridges: true, added: true, access: true, gates: true, reroute: true, corridor: true, graticule: true});
    if (preset === 'network') return setLayers({mountain: false, lake: false, river: false, forest: false, soums: false, bridges: true, added: true, access: true, gates: true, reroute: true, corridor: false, graticule: true});
    setLayers({mountain: true, lake: true, river: true, forest: true, soums: true, bridges: false, added: false, access: false, gates: false, reroute: false, corridor: false, graticule: true});
  };

  return <div className="overlay" ref={root} style={{top: 12, right: 12}}>
    {open
      ? <div className="overlay-panel layer-pop" role="dialog" aria-label="Газрын зургийн давхаргууд">
        <div className="group">
          <small>Суурь зураг</small>
          <select className="input" value={basemap} onChange={e => setBasemap(e.target.value)} aria-label="Суурь зураг">
            {BASEMAPS.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </div>
        {LAYER_GROUPS.map(group => <div className="group" key={group.key}>
          <small>{group.label}</small>
          <div className="toggles">
            {group.layers.map(([key, label]) => <button key={key} aria-pressed={!!layers[key]} onClick={() => toggle(key)}>{label}</button>)}
          </div>
        </div>)}
        <div className="presets">
          {LAYER_PRESETS.map(preset => <button key={preset.key} onClick={() => applyPreset(preset.key)}>{preset.label}</button>)}
        </div>
        <button className="btn btn-ghost btn-sm btn-block" onClick={() => setOpen(false)}><X size={12}/>Хаах</button>
      </div>
      : <button className="overlay-panel layer-btn" onClick={() => setOpen(true)} aria-expanded={open}>
        <Layers size={14}/>Давхаргууд
      </button>}
  </div>;
}
