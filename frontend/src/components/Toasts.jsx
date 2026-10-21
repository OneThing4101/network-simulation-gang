import { Check, AlertTriangle } from 'lucide-react';

export default function Toasts({items}) {
  return <div className="toasts" aria-live="polite">{items.map(t => <div key={t.id} className={`toast ${t.kind}`}>{t.kind === 'fail' ? <AlertTriangle size={15}/> : <Check size={15}/>}{t.text}</div>)}</div>;
}
