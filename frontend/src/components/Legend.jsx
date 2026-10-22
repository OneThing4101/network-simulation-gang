import {useState} from 'react';
import {ChevronDown, ChevronRight} from 'lucide-react';
import {COLORS, TOPOLOGIES} from '../constants';

// The legend is written for the current view: it lists only what the plate is
// actually drawing right now, so it never becomes a second static panel.
export default function Legend({topology, stats, layers, replay, scene}) {
  // On a phone the plate is small, so the legend starts folded.
  const [open, setOpen] = useState(() => !matchMedia('(max-width: 760px)').matches);
  const active = TOPOLOGIES.find(t => t.key === topology);
  const items = [];

  items.push({style: {color: COLORS[topology]}, label: `${active?.short ?? ''} трасс`});
  if (layers.bridges && stats?.bridge_count > 0) {
    items.push({style: {color: COLORS[topology], borderTopStyle: 'dashed'}, label: `Bridge холбоос (${stats.bridge_count})`});
  }
  if (layers.added && topology === 'protected') {
    items.push({style: {color: COLORS[topology], borderTopStyle: 'dashed'}, label: 'Нэмэлт нөөц холбоос'});
  }
  if (replay?.failed_edges?.length) {
    items.push({style: {color: '#B3261E', borderTopStyle: 'dashed'}, label: 'Тасарсан кабель'});
  }
  if (replay?.reroute_edges?.length) {
    items.push({style: {color: '#C27A12'}, label: 'Нөөц зам'});
  }
  if (layers.corridor) {
    items.push({style: {color: '#B3261E'}, label: 'Нийтлэг зурвас (өргөлбөр)'});
  }
  if (layers.gates) items.push({style: {color: '#0A8786', borderTopStyle: 'dashed'}, label: 'Төлөвлөсөн голын гарц'});
  if (layers.access) items.push({style: {color: '#DC992E', borderTopStyle: 'dashed'}, label: 'Уулын нэвтрэх хэсэг'});
  if (scene === 'evolution') items.push({style: {color: '#C27A12', borderTopStyle: 'dotted'}, label: 'Сонгосон холбоосын цагираг'});

  return <div className="overlay overlay-panel legend">
    <button className="legend-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
      <span>Тайлбар</span>
      {open ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
    </button>
    {open && <div className="legend-body">
      {items.map((item, index) => <span key={index}><i style={item.style}/>{item.label}</span>)}
    </div>}
  </div>;
}
