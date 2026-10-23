import {BookOpen, Boxes, GitBranch, Layers, Map as MapIcon, ShieldAlert} from 'lucide-react';
import {SCENES} from '../constants';

const ICONS = {
  atlas: MapIcon,
  evolution: GitBranch,
  resilience: ShieldAlert,
  cost: Boxes,
  data: Layers,
  method: BookOpen,
};

// Left rail: the six scenes of the studio. The active scene is marked on the
// rail itself so the workspace never depends on the panel to say where you are.
export default function SceneRail({scene, setScene}) {
  return <nav className="rail" aria-label="Сцен">
    {SCENES.map(item => {
      const Icon = ICONS[item.key] || MapIcon;
      return <button
        key={item.key}
        className="rail-item"
        aria-current={scene === item.key}
        onClick={() => setScene(item.key)}
        title={item.hint}>
        <Icon size={17} strokeWidth={1.6}/>
        <span>{item.label}</span>
      </button>;
    })}
  </nav>;
}
