import {ChevronRight, X} from 'lucide-react';
import TopologyPanel from './panels/TopologyPanel';
import EvolutionPanel from './panels/EvolutionPanel';
import ResiliencePanel from './panels/ResiliencePanel';
import CostPanel from './panels/CostPanel';
import DataPanel from './panels/DataPanel';

const TITLES = {
  atlas: ['Трассын шинжилгээ', 'Сонгосон кабель, хотын мэдээлэл'],
  evolution: ['Сүлжээний хувьсгал', 'Граф хэрхэн байгуулагдсан'],
  resilience: ['Эрсдэлийн лаборатори', 'Тасралт, нөөц зам, нийтлэг зурвас'],
  cost: ['Тэсвэрийн хязгаар', 'Төсөв ба хамрах хүрээ'],
  data: ['Өгөгдөл ба эх сурвалж', 'Засах, сэргээх, экспорт'],
};

export default function Inspector(props) {
  const {scene, onClose} = props;
  const [title, subtitle] = TITLES[scene] || TITLES.atlas;

  const panel = {
    atlas: <TopologyPanel {...props}/>,
    evolution: <EvolutionPanel {...props}/>,
    resilience: <ResiliencePanel {...props}/>,
    cost: <CostPanel {...props}/>,
    data: <DataPanel {...props}/>,
  }[scene] || <TopologyPanel {...props}/>;

  return <aside className="inspector" aria-label="Дэлгэрэнгүй мэдээлэл">
    <div className="inspector-head">
      <div style={{flex: 1, minWidth: 0}}>
        <h2>{title}</h2>
        <div className="sub">{subtitle}</div>
      </div>
      <button className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Мэдээллийн хайврыг хаах"><X size={14}/></button>
    </div>
    <div className="inspector-body">{panel}</div>
  </aside>;
}
