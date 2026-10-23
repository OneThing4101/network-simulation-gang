import {AlertTriangle, Check} from 'lucide-react';

export default function Toasts({items}) {
  if (!items?.length) return null;
  return <div className="toasts" role="status" aria-live="polite">
    {items.map(item => <div className="toast" key={item.id} data-kind={item.kind}>
      {item.kind === 'fail' ? <AlertTriangle size={14}/> : <Check size={14}/>}
      <span>{item.text}</span>
    </div>)}
  </div>;
}
